from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.agents.graph import agent
from src.database import get_db
from src.models.consultation import Consultation
from src.models.patient import Patient
from src.models.schemas import (
    ChatRequest,
    ChatResponse,
    ConsultationCreateRequest,
    ConsultationListItem,
    ConsultationResponse,
    ConsultationSoapResponse,
    ConsultationSoapSaveRequest,
    PatientCreateRequest,
    PatientResponse,
    PatientSummary,
    TranscriptResponse,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdateRequest,
)
from src.models.soap_note import SoapNote
from src.models.transcript_segment import TranscriptSegment
from src.models.user import User
from src.schemas.model_settings import AudioModelPreferences
from src.services.audio.temp_storage import save_temp_audio
from src.services.blaze.stt_async import BlazeSTTAsync, BlazeSTTError, blaze_stt
from src.services.icd_kcb import IcdNotFoundError, IcdUnavailableError, IcdUpstreamError, lookup_code, search_codes
from src.services.model_runtime import ModelConfigurationError, resolve_connection
from src.services.clinical_gate import (
    ClinicalGateError,
    clinical_gate_classifier,
)
from src.services.speaker.role_classifier import (
    SpeakerRoleError,
    speaker_role_classifier,
)
from src.services.stt import create_stt
from src.services.transcript.normalizer import (
    TranscriptNormalizationError,
    normalize_transcript,
    normalize_unclassified_transcript,
)
from src.services.transcript.repository import (
    save_transcript_for_consultation,
)

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Chat với AI agent."""
    try:
        result = await agent.ainvoke({"query": request.message})
        return ChatResponse(
            response=result.get("response", ""),
            analysis=result.get("analysis", ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def agent_status():
    """Kiểm tra trạng thái agent."""
    return {"status": "ready", "agent": "LangGraph Agent v1.0"}


@router.post(
    "/patients",
    response_model=PatientResponse,
    status_code=201,
)
async def create_patient(
    request: PatientCreateRequest,
    db: Session = Depends(get_db),
) -> Patient:
    """Tạo một patient mới."""

    existing_patient = (
        db.query(Patient)
        .filter(Patient.patient_code == request.patient_code)
        .first()
    )

    if existing_patient is not None:
        raise HTTPException(
            status_code=409,
            detail="Patient code already exists",
        )

    try:
        patient = Patient(
            patient_code=request.patient_code,
            full_name=request.full_name,
            date_of_birth=request.date_of_birth,
            sex=request.sex,
        )

        db.add(patient)
        db.commit()
        db.refresh(patient)

        return patient
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to create patient record",
        ) from exc



@router.post(
    "/consultations",
    response_model=ConsultationResponse,
    status_code=201,
)
async def create_consultation(
    request: ConsultationCreateRequest,
    db: Session = Depends(get_db),
) -> Consultation:
    """Tạo một consultation mới."""

    patient = (
        db.query(Patient)
        .filter(Patient.id == request.patient_id)
        .first()
    )

    if patient is None:
        raise HTTPException(
            status_code=404,
            detail="Patient not found",
        )

    doctor = (
        db.query(User)
        .filter(User.id == request.doctor_id)
        .first()
    )

    if doctor is None:
        raise HTTPException(
            status_code=404,
            detail="Doctor not found",
        )

    consultation = Consultation(
        patient_id=patient.id,
        doctor_id=doctor.id,
        status="PROCESSING",
        language="vi",
    )

    db.add(consultation)
    db.commit()
    db.refresh(consultation)

    return consultation


@router.get("/consultations", response_model=list[ConsultationListItem])
async def list_consultations(
    doctor_id: UUID | None = None,
    patient_id: UUID | None = None,
    db: Session = Depends(get_db),
) -> list[ConsultationListItem]:
    """Danh sách consultations, lọc theo bác sĩ (để danh sách lượt khám per-doctor)."""

    transcript_exists = (
        select(TranscriptSegment.id)
        .where(TranscriptSegment.consultation_id == Consultation.id)
        .exists()
    )

    query = db.query(Consultation, transcript_exists.label("has_transcript"), Patient).join(
        Patient, Consultation.patient_id == Patient.id
    )

    if doctor_id is not None:
        query = query.filter(Consultation.doctor_id == doctor_id)
    if patient_id is not None:
        query = query.filter(Consultation.patient_id == patient_id)

    rows = query.order_by(Consultation.created_at.desc()).all()

    items: list[ConsultationListItem] = []
    for c, has_transcript, patient in rows:
        items.append(
            ConsultationListItem(
                id=c.id,
                patient_id=c.patient_id,
                doctor_id=c.doctor_id,
                status=c.status,
                created_at=c.created_at,
                started_at=c.started_at,
                ended_at=c.ended_at,
                has_transcript=has_transcript,
                patient=PatientSummary(
                    full_name=c.patient.full_name,
                    patient_code=c.patient.patient_code,
                    date_of_birth=c.patient.date_of_birth,
                    sex=c.patient.sex,
                ),
            )
        )
    return items


@router.post(
    "/consultations/{consultation_id}/audio",
)
async def upload_consultation_audio(
    consultation_id: UUID,
    audio_file: UploadFile = File(...),
    model_preferences: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    """Upload audio và xử lý transcript cho consultation."""

    preferences = None
    if model_preferences is not None:
        try:
            preferences = AudioModelPreferences.model_validate_json(model_preferences)
            resolve_connection("stt", preferences.stt)
            resolve_connection("roles", preferences.roles)
        except (ValidationError, ModelConfigurationError):
            raise HTTPException(status_code=422, detail="Cấu hình STT hoặc phân vai không hợp lệ.") from None

    consultation = (
        db.query(Consultation)
        .filter(Consultation.id == consultation_id)
        .first()
    )

    if consultation is None:
        raise HTTPException(
            status_code=404,
            detail="Consultation not found",
        )

    temp_path: Path | None = None

    try:
        # 1. Lưu audio tạm
        temp_path = await save_temp_audio(audio_file)

        # 2. Blaze STT
        if preferences and preferences.stt.provider in {"9router", "groq"}:
            stt_client = create_stt(preferences.stt)
        else:
            stt_client = BlazeSTTAsync(preferences.stt) if preferences else blaze_stt
        stt_result = await stt_client.transcribe(temp_path)

        segments = stt_result.get("segments", [])

        if not segments:
            raise HTTPException(
                status_code=422,
                detail="Blaze STT returned no transcript segments",
            )

        # 3. Clinical Relevance Gate (reuses preferences.roles)
        gate_decision = await clinical_gate_classifier.evaluate(
            segments, preferences.roles if preferences else None
        )

        if gate_decision.is_technical_failure:
            db.rollback()
            consultation.status = "FAILED"
            db.commit()
            raise HTTPException(
                status_code=502,
                detail=f"Kiểm tra tính phù hợp lâm sàng thất bại: {gate_decision.reason}",
            )

        if gate_decision.status == "NON_CLINICAL":
            consultation.status = "NON_CLINICAL"
            db.commit()
            return {
                "consultation_id": str(consultation.id),
                "status": consultation.status,
                "segments_count": 0,
                "speaker_source": stt_result.get("speaker_source", "audio"),
                "clinical_relevance": gate_decision.model_dump(),
                "transcript": [],
            }

        if gate_decision.status == "UNCERTAIN":
            normalized_segments = normalize_unclassified_transcript(segments)
            saved_segments = save_transcript_for_consultation(
                db=db,
                consultation=consultation,
                segments=normalized_segments,
                status=gate_decision.status,
            )
            return {
                "consultation_id": str(consultation.id),
                "status": consultation.status,
                "segments_count": len(saved_segments),
                "speaker_source": stt_result.get("speaker_source", "audio"),
                "clinical_relevance": gate_decision.model_dump(),
                "transcript": [
                    {
                        "id": str(segment.id),
                        "speaker_label": segment.speaker_label,
                        "resolved_role": segment.resolved_role,
                        "content": segment.content,
                        "start_ms": segment.start_ms,
                        "end_ms": segment.end_ms,
                        "role_confidence": segment.role_confidence,
                    }
                    for segment in saved_segments
                ],
            }

        # 4. Speaker Role Classification (if CLINICAL)
        if stt_result.get("speaker_source") == "text_inference":
            segments, role_result = await speaker_role_classifier.classify_unlabelled(
                segments, preferences.roles if preferences else None,
            )
        else:
            role_result = await speaker_role_classifier.classify(segments, preferences.roles) if preferences else await speaker_role_classifier.classify(segments)

        # 5. Normalize
        normalized_segments = normalize_transcript(
            segments=segments,
            speaker_roles=role_result["speaker_roles"],
        )

        # 6. Save transcript vào consultation
        saved_segments = save_transcript_for_consultation(
            db=db,
            consultation=consultation,
            segments=normalized_segments,
            status="COMPLETED",
        )

        return {
            "consultation_id": str(consultation.id),
            "status": consultation.status,
            "segments_count": len(saved_segments),
            "speaker_source": stt_result.get("speaker_source", "audio"),
            "clinical_relevance": gate_decision.model_dump(),
            "transcript": [
                {
                    "id": str(segment.id),
                    "speaker_label": segment.speaker_label,
                    "resolved_role": segment.resolved_role,
                    "content": segment.content,
                    "start_ms": segment.start_ms,
                    "end_ms": segment.end_ms,
                    "role_confidence": segment.role_confidence,
                }
                for segment in saved_segments
            ],
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except BlazeSTTError as exc:
        db.rollback()
        consultation.status = "FAILED"
        db.commit()

        raise HTTPException(
            status_code=502,
            detail="Speech-to-text processing failed",
        ) from exc

    except SpeakerRoleError as exc:
        db.rollback()
        consultation.status = "FAILED"
        db.commit()

        raise HTTPException(
            status_code=502,
            detail=("Không phân vai được đoạn Whisper. Có thể đoạn chứa nhiều vai, thiếu ngữ cảnh hoặc model trả JSON sai. Thử Blaze để tách người nói theo audio."
                    if stt_result.get("speaker_source") == "text_inference" else "Speaker role classification failed"),
        ) from exc

    except TranscriptNormalizationError as exc:
        db.rollback()
        consultation.status = "FAILED"
        db.commit()

        raise HTTPException(
            status_code=422,
            detail="Transcript normalization failed",
        ) from exc

    except HTTPException:
        raise

    except Exception as exc:
        db.rollback()
        consultation.status = "FAILED"
        db.commit()

        raise HTTPException(
            status_code=500,
            detail="Audio processing failed",
        ) from exc

    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.get(
    "/consultations/{consultation_id}/transcript",
    response_model=TranscriptResponse,
)
async def get_consultation_transcript(
    consultation_id: UUID,
    db: Session = Depends(get_db),
) -> TranscriptResponse:
    """Lấy transcript đã lưu của consultation."""

    consultation = (
        db.query(Consultation)
        .filter(Consultation.id == consultation_id)
        .first()
    )

    if consultation is None:
        raise HTTPException(
            status_code=404,
            detail="Consultation not found",
        )

    if consultation.status == "NON_CLINICAL":
        return TranscriptResponse(
            consultation_id=consultation.id,
            status=consultation.status,
            segments=[],
        )

    segments = (
        db.query(TranscriptSegment)
        .filter(
            TranscriptSegment.consultation_id
            == consultation_id
        )
        .order_by(
            TranscriptSegment.start_ms.asc(),
            TranscriptSegment.id.asc(),
        )
        .all()
    )

    return TranscriptResponse(
        consultation_id=consultation.id,
        status=consultation.status,
        segments=segments,
    )


@router.patch(
    "/transcript-segments/{segment_id}",
    response_model=TranscriptSegmentResponse,
)
async def update_transcript_segment(
    segment_id: UUID,
    request: TranscriptSegmentUpdateRequest,
    db: Session = Depends(get_db),
) -> TranscriptSegment:
    """Chỉnh sửa nội dung (content) của một transcript segment."""

    segment = (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.id == segment_id)
        .first()
    )

    if segment is None:
        raise HTTPException(
            status_code=404,
            detail="Transcript segment not found",
        )

    try:
        segment.content = request.content
        db.commit()
        db.refresh(segment)
        return segment
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to update transcript segment content",
        ) from exc


@router.get(
    "/consultations/{consultation_id}/soap",
    response_model=ConsultationSoapResponse,
)
async def get_consultation_soap(
    consultation_id: UUID,
    db: Session = Depends(get_db),
) -> ConsultationSoapResponse:
    """Lấy SOAP note đã lưu của consultation."""
    consultation = db.query(Consultation).filter(Consultation.id == consultation_id).first()
    if consultation is None:
        raise HTTPException(status_code=404, detail="Consultation not found")

    note = (
        db.query(SoapNote)
        .filter(SoapNote.consultation_id == consultation_id)
        .order_by(SoapNote.version.desc())
        .first()
    )
    if note is None:
        raise HTTPException(status_code=404, detail="SOAP not found for this consultation")

    return ConsultationSoapResponse(
        consultation_id=note.consultation_id,
        soap_run_id=note.model_name,
        version=note.version,
        status=note.status,
        subjective=note.subjective,
        objective=note.objective,
        assessment=note.assessment,
        plan=note.plan,
        approved_at=note.approved_at,
    )


@router.post(
    "/consultations/{consultation_id}/soap",
    response_model=ConsultationSoapResponse,
)
async def save_consultation_soap(
    consultation_id: UUID,
    request: ConsultationSoapSaveRequest,
    db: Session = Depends(get_db),
) -> ConsultationSoapResponse:
    """Lưu hoặc cập nhật SOAP note cho consultation."""
    consultation = db.query(Consultation).filter(Consultation.id == consultation_id).first()
    if consultation is None:
        raise HTTPException(status_code=404, detail="Consultation not found")

    from datetime import UTC, datetime

    note = (
        db.query(SoapNote)
        .filter(SoapNote.consultation_id == consultation_id)
        .order_by(SoapNote.version.desc())
        .first()
    )

    is_final = request.status.upper() == "FINAL"
    if note is None:
        note = SoapNote(
            consultation_id=consultation_id,
            version=request.version,
            status=request.status,
            subjective=request.subjective,
            objective=request.objective,
            assessment=request.assessment,
            plan=request.plan,
            model_name=request.soap_run_id,
            approved_by=request.approved_by,
            approved_at=datetime.now(UTC) if is_final else None,
        )
        db.add(note)
    else:
        note.version = request.version
        note.status = request.status
        if request.subjective is not None:
            note.subjective = request.subjective
        if request.objective is not None:
            note.objective = request.objective
        if request.assessment is not None:
            note.assessment = request.assessment
        if request.plan is not None:
            note.plan = request.plan
        note.model_name = request.soap_run_id
        if is_final:
            note.approved_by = request.approved_by or note.approved_by
            note.approved_at = datetime.now(UTC)
            consultation.status = "COMPLETED"

    try:
        db.commit()
        db.refresh(note)
        return ConsultationSoapResponse(
            consultation_id=note.consultation_id,
            soap_run_id=note.model_name,
            version=note.version,
            status=note.status,
            subjective=note.subjective,
            objective=note.objective,
            assessment=note.assessment,
            plan=note.plan,
            approved_at=note.approved_at,
        )
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save consultation SOAP") from exc


def _icd_error(exc: Exception) -> HTTPException:
    if isinstance(exc, IcdNotFoundError):
        return HTTPException(status_code=404, detail="Không có mã ICD này.")
    if isinstance(exc, IcdUnavailableError):
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc) if isinstance(exc, IcdUpstreamError) else "Không tra được ICD.")


@router.get("/icd/codes/{code}")
async def icd_code(code: str):
    """Chi tiết một mã ICD-10 từ icd.kcb.vn."""
    try:
        return await lookup_code(code)
    except (IcdNotFoundError, IcdUnavailableError, IcdUpstreamError) as exc:
        raise _icd_error(exc) from exc


@router.get("/icd/search")
async def icd_search(q: str = ""):
    """Tìm mã hoặc tên bệnh tiếng Việt. Danh mục chương được tải một lần rồi lọc tại server."""
    try:
        return await search_codes(q)
    except (IcdNotFoundError, IcdUnavailableError, IcdUpstreamError) as exc:
        raise _icd_error(exc) from exc


class TurnstileVerifyRequest(BaseModel):
    token: str


@router.post("/auth/verify-turnstile")
async def verify_turnstile(body: TurnstileVerifyRequest, request: Request):
    """Xác minh Cloudflare Turnstile token trước khi đăng nhập / đăng ký."""
    import httpx
    from src.config import get_settings

    secret = get_settings().turnstile_secret_key
    if not secret:
        return {"success": True}

    client_ip = request.headers.get("CF-Connecting-IP") or (request.client.host if request.client else None)
    payload = {"secret": secret, "response": body.token}
    if client_ip:
        payload["remoteip"] = client_ip

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", data=payload)
            data = res.json()
            if not data.get("success"):
                raise HTTPException(status_code=400, detail="Xác thực Cloudflare Turnstile thất bại hoặc token đã hết hạn.")
            return {"success": True}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối máy chủ Cloudflare: {exc}")


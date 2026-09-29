from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from src.services.audio.temp_storage import save_temp_audio
from src.services.icd_kcb import IcdNotFound, IcdUnavailable, IcdUpstream, lookup_code, search_codes
from src.services.blaze.stt_async import BlazeSTTError, blaze_stt
from src.services.speaker.role_classifier import (
    SpeakerRoleError,
    speaker_role_classifier,
)
from src.services.transcript.normalizer import (
    TranscriptNormalizationError,
    normalize_transcript,
)
from src.services.transcript.repository import (
    save_transcript_for_consultation,
)
from src.agents.graph import agent
from src.database import get_db
from src.models.consultation import Consultation
from src.models.patient import Patient
from src.models.schemas import (
    ChatRequest,
    ChatResponse,
    ConsultationCreateRequest,
    ConsultationResponse,
    PatientCreateRequest,
    PatientResponse,
    TranscriptResponse,
    TranscriptSegmentResponse,
    TranscriptSegmentUpdateRequest,
)
from src.models.user import User
from uuid import UUID
from src.models.transcript_segment import TranscriptSegment

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


@router.post(
    "/consultations/{consultation_id}/audio",
)
async def upload_consultation_audio(
    consultation_id: UUID,
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload audio và xử lý transcript cho consultation."""

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
        stt_result = await blaze_stt.transcribe(temp_path)

        segments = stt_result.get("segments", [])

        if not segments:
            raise HTTPException(
                status_code=422,
                detail="Blaze STT returned no transcript segments",
            )

        # 3. Qwen Speaker Role
        role_result = await speaker_role_classifier.classify(
            segments
        )

        # 4. Normalize
        normalized_segments = normalize_transcript(
            segments=segments,
            speaker_roles=role_result["speaker_roles"],
        )

        # 5. Save transcript vào consultation
        saved_segments = save_transcript_for_consultation(
            db=db,
            consultation=consultation,
            segments=normalized_segments,
        )

        return {
            "consultation_id": str(consultation.id),
            "status": consultation.status,
            "segments_count": len(saved_segments),
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
            detail="Speaker role classification failed",
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


def _icd_error(exc: Exception) -> HTTPException:
    if isinstance(exc, IcdNotFound):
        return HTTPException(status_code=404, detail="Không có mã ICD này.")
    if isinstance(exc, IcdUnavailable):
        return HTTPException(status_code=503, detail=str(exc))
    return HTTPException(status_code=502, detail=str(exc) if isinstance(exc, IcdUpstream) else "Không tra được ICD.")


@router.get("/icd/codes/{code}")
async def icd_code(code: str):
    """Chi tiết một mã ICD-10 từ icd.kcb.vn."""
    try:
        return await lookup_code(code)
    except (IcdNotFound, IcdUnavailable, IcdUpstream) as exc:
        raise _icd_error(exc) from exc


@router.get("/icd/search")
async def icd_search(q: str = ""):
    """Tìm mã hoặc tên bệnh tiếng Việt. Danh mục chương được tải một lần rồi lọc tại server."""
    try:
        return await search_codes(q)
    except (IcdNotFound, IcdUnavailable, IcdUpstream) as exc:
        raise _icd_error(exc) from exc

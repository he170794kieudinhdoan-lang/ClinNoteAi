from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from src.services.audio.temp_storage import save_temp_audio
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
)
from src.models.user import User
from uuid import UUID

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
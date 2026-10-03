from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from src.models.consultation import Consultation
from src.models.transcript_segment import TranscriptSegment


def create_consultation(
    db: Session,
    patient_id: UUID,
    doctor_id: UUID,
    audio_path: str | None = None,
    language: str = "vi",
) -> Consultation:
    consultation = Consultation(
        patient_id=patient_id,
        doctor_id=doctor_id,
        status="PROCESSING",
        audio_path=audio_path,
        language=language,
    )

    db.add(consultation)
    db.flush()

    return consultation


def save_transcript_segments(
    db: Session,
    consultation_id: UUID,
    segments: list[dict[str, Any]],
) -> list[TranscriptSegment]:
    transcript_segments = []

    for segment in segments:
        transcript_segment = TranscriptSegment(
            consultation_id=consultation_id,
            speaker_label=segment["speaker_label"],
            resolved_role=segment.get("resolved_role"),
            content=segment["content"],
            start_ms=segment.get("start_ms"),
            end_ms=segment.get("end_ms"),
            asr_confidence=segment.get("asr_confidence"),
            role_confidence=segment.get("role_confidence"),
        )

        db.add(transcript_segment)
        transcript_segments.append(transcript_segment)

    db.flush()

    return transcript_segments


def save_consultation_transcript(
    db: Session,
    patient_id: UUID,
    doctor_id: UUID,
    segments: list[dict[str, Any]],
    audio_path: str | None = None,
    language: str = "vi",
) -> Consultation:
    try:
        consultation = create_consultation(
            db=db,
            patient_id=patient_id,
            doctor_id=doctor_id,
            audio_path=audio_path,
            language=language,
        )

        save_transcript_segments(
            db=db,
            consultation_id=consultation.id,
            segments=segments,
        )

        consultation.status = "COMPLETED"

        db.commit()
        db.refresh(consultation)

        return consultation

    except Exception:
        db.rollback()
        raise

def save_transcript_for_consultation(
    db: Session,
    consultation: Consultation,
    segments: list[dict[str, Any]],
) -> list[TranscriptSegment]:
    try:
        db.query(TranscriptSegment).filter(
            TranscriptSegment.consultation_id == consultation.id
        ).delete(synchronize_session=False)

        transcript_segments = save_transcript_segments(
            db=db,
            consultation_id=consultation.id,
            segments=segments,
        )

        consultation.status = "COMPLETED"

        db.commit()

        for segment in transcript_segments:
            db.refresh(segment)

        db.refresh(consultation)

        return transcript_segments

    except Exception:
        db.rollback()
        raise

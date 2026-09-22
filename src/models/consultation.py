from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .clinical_fact import ClinicalFact
    from .icd_suggestion import IcdSuggestion
    from .patient import Patient
    from .soap_note import SoapNote
    from .transcript_segment import TranscriptSegment
    from .user import User


class Consultation(Base):
    __tablename__ = "consultations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    doctor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PROCESSING", index=True)
    audio_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    language: Mapped[str] = mapped_column(String(20), nullable=False, default="vi")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    patient: Mapped["Patient"] = relationship(back_populates="consultations")
    doctor: Mapped["User"] = relationship(
        back_populates="consultations",
        foreign_keys=[doctor_id],
    )
    transcript_segments: Mapped[list["TranscriptSegment"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan"
    )
    clinical_facts: Mapped[list["ClinicalFact"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan"
    )
    soap_notes: Mapped[list["SoapNote"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan"
    )
    icd_suggestions: Mapped[list["IcdSuggestion"]] = relationship(
        back_populates="consultation", cascade="all, delete-orphan"
    )

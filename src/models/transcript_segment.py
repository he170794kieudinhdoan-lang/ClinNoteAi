from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .clinical_fact import ClinicalFact
    from .consultation import Consultation
    from .evidence_link import EvidenceLink


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    speaker_label: Mapped[str] = mapped_column(String(50), nullable=False)
    resolved_role: Mapped[str | None] = mapped_column(String(30), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    asr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    role_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    consultation: Mapped[Consultation] = relationship(back_populates="transcript_segments")
    clinical_facts: Mapped[list[ClinicalFact]] = relationship(back_populates="transcript_segment")
    evidence_links: Mapped[list[EvidenceLink]] = relationship(back_populates="transcript_segment")

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .soap_claim import SoapClaim
    from .transcript_segment import TranscriptSegment


class EvidenceLink(Base):
    __tablename__ = "evidence_links"
    __table_args__ = (
        UniqueConstraint(
            "soap_claim_id",
            "transcript_segment_id",
            name="uq_evidence_claim_segment",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    soap_claim_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("soap_claims.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transcript_segment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transcript_segments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    evidence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    grounding_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    soap_claim: Mapped[SoapClaim] = relationship(back_populates="evidence_links")
    transcript_segment: Mapped[TranscriptSegment] = relationship(back_populates="evidence_links")

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .evidence_link import EvidenceLink
    from .soap_note import SoapNote
    from .verification_result import VerificationResult


class SoapClaim(Base):
    __tablename__ = "soap_claims"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    soap_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("soap_notes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    claim_text: Mapped[str] = mapped_column(Text, nullable=False)
    claim_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    claim_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    soap_note: Mapped["SoapNote"] = relationship(back_populates="claims")
    evidence_links: Mapped[list["EvidenceLink"]] = relationship(
        back_populates="soap_claim", cascade="all, delete-orphan"
    )
    verification_results: Mapped[list["VerificationResult"]] = relationship(
        back_populates="soap_claim", cascade="all, delete-orphan"
    )

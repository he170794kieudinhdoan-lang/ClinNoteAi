from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CHAR, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .base import Base


class GUID(TypeDecorator):
    """UUID that works on both PostgreSQL (native) and SQLite (test suites)."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None or isinstance(value, uuid.UUID):
            return value
        return uuid.UUID(value)

if TYPE_CHECKING:
    from .consultation import Consultation


class IcdSuggestion(Base):
    __tablename__ = "icd_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(GUID, primary_key=True, default=uuid.uuid4)
    consultation_id: Mapped[uuid.UUID] = mapped_column(
        GUID, ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    icd_code: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(512), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="SUGGESTED")

    consultation: Mapped[Consultation] = relationship(back_populates="icd_suggestions")

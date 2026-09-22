from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .consultation import Consultation
    from .soap_note import SoapNote


class User(Base):
    __tablename__ = "users"

    # If Supabase Auth is used, set this ID from auth.users.id when creating the profile row.
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="DOCTOR")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    consultations: Mapped[list[Consultation]] = relationship(
        back_populates="doctor",
        foreign_keys="Consultation.doctor_id",
    )
    approved_notes: Mapped[list[SoapNote]] = relationship(
        back_populates="approver",
        foreign_keys="SoapNote.approved_by",
    )

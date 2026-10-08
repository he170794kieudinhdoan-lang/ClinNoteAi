"""Contracts for ICD suggestion endpoints."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .model_settings import ModelPreference
from .soap import StrictModel

IcdStatus = Literal["SUGGESTED", "ACCEPTED", "REJECTED"]


class IcdSuggestRequest(StrictModel):
    run_id: str = Field(min_length=1)
    assessment_text: str | None = None
    model_config_override: ModelPreference | None = None


class IcdSaveItem(StrictModel):
    icd_code: str = Field(min_length=1, max_length=30)
    description: str = Field(min_length=1, max_length=512)
    confidence: float | None = Field(default=None, ge=0, le=100)


class IcdSaveRequest(StrictModel):
    items: list[IcdSaveItem] = Field(min_length=1, max_length=10)


class IcdStatusRequest(StrictModel):
    status: IcdStatus

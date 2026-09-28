"""Versioned contracts for the JSON backed SOAP demonstration."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


Speaker = Literal["clinician", "patient"]
CapType = Literal[
    "ChiefComplaint", "Problem", "ProblemHistory", "ExamFinding", "TestResult",
    "MedicationStatement", "MedicationRequest", "Order", "FollowUp", "Counseling",
]
SupportStatus = Literal["pending", "supported", "partial", "unsupported", "conflicting"]


class TranscriptTurn(StrictModel):
    turn_id: str = Field(min_length=1)
    source_segment_id: str | int | None = None
    source_speaker_id: str | None = None
    speaker: Speaker
    text: str = Field(min_length=1)
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    role_confidence: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def check_time(self):
        if (self.start_ms is None) != (self.end_ms is None):
            raise ValueError("timestamps must both be present or absent")
        if self.start_ms is not None and self.end_ms < self.start_ms:
            raise ValueError("end_ms precedes start_ms")
        return self


class Transcript(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    language: str = "vi"
    turns: list[TranscriptTurn] = Field(min_length=1)
    source_metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def unique_turns(self):
        ids = [turn.turn_id for turn in self.turns]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate turn_id")
        return self


class Evidence(StrictModel):
    turn_id: str = Field(min_length=1)
    quote: str = Field(min_length=1)
    source_segment_id: str | int | None = None
    speaker: Speaker | None = None
    start_ms: int | None = None
    end_ms: int | None = None


class Cap(StrictModel):
    prop_id: str = Field(min_length=1)
    cap_type: CapType
    canonical_concept: str = Field(min_length=1)
    proposition_text: str = Field(min_length=1)
    speaker_source: Speaker
    temporality: Literal["current", "past", "future", "unknown"] = "unknown"
    verification_status: Literal["affirmed", "negated", "uncertain", "unknown"] = "unknown"
    clinical_status: Literal["active", "resolved", "planned", "unknown"] = "unknown"
    medication_state: Literal[
        "taking", "not_taking", "start_planned", "stop_planned", "change_planned", "unknown"
    ] | None = None
    evidence: list[Evidence] = Field(min_length=1)
    supersedes: list[str] = Field(default_factory=list)
    resolution_status: Literal["current", "superseded", "needs_review"] = "current"


class CapsPayload(StrictModel):
    caps: list[Cap]
    warnings: list[str] = Field(default_factory=list)


class SoapItem(StrictModel):
    item_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    cap_ids: list[str] = Field(default_factory=list)
    origin: Literal["ai", "reviewer"] = "ai"
    review_status: Literal["needs_review", "reviewed"] = "needs_review"
    source_link_status: Literal["valid", "invalid"] = "valid"
    support_status: SupportStatus = "pending"
    manual_reason: str | None = None


class SoapSection(StrictModel):
    items: list[SoapItem] = Field(default_factory=list)
    missing: bool = False

    @model_validator(mode="after")
    def consistent_missing(self):
        if self.missing != (len(self.items) == 0):
            raise ValueError("missing must be true exactly when items is empty")
        return self


class SoapDocument(StrictModel):
    S: SoapSection
    O: SoapSection  # noqa: E741 - SOAP's standard Objective section
    A: SoapSection
    P: SoapSection


class SoapRevision(StrictModel):
    revision: int = Field(ge=1)
    parent_revision: int | None = None
    status: Literal["draft", "final"]
    soap: SoapDocument
    created_at: datetime
    approved_at: datetime | None = None
    model: str | None = None
    prompt_version: str | None = None
    reviewer_name: str | None = None
    warning_decisions: dict[str, str] = Field(default_factory=dict)


class ReviewDecision(StrictModel):
    item_id: str
    support_status: SupportStatus
    cap_ids: list[str] = Field(default_factory=list)
    reason: str | None = None


class RunMetadata(StrictModel):
    run_id: UUID
    created_at: datetime
    raw_sha256: str
    transcript_sha256: str
    input_format: Literal["qwen_role_result", "canonical", "text"]


class ExtractRequest(StrictModel):
    input_format: Literal["qwen_role_result", "canonical", "text"]
    content: dict[str, Any] | str


class GenerateRequest(StrictModel):
    expected_revision: int = Field(ge=0)


class RevisionRequest(StrictModel):
    expected_revision: int = Field(ge=0)
    soap: SoapDocument
    reviewer_name: str | None = None
    warning_decisions: dict[str, str] = Field(default_factory=dict)


class ApproveRequest(StrictModel):
    expected_revision: int = Field(ge=1)
    reviewer_name: str = Field(min_length=1)
    warning_decisions: dict[str, str] = Field(default_factory=dict)

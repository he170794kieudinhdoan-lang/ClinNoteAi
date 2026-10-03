from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Tin nhắn từ user",
    )


class ChatResponse(BaseModel):
    response: str = Field(
        ...,
        description="Phản hồi từ agent",
    )
    analysis: str = Field(
        default="",
        description="Phân tích nội bộ",
    )


class PatientCreateRequest(BaseModel):
    patient_code: str = Field(..., min_length=1, max_length=50)
    full_name: str = Field(..., min_length=1, max_length=255)
    date_of_birth: date | None = None
    sex: str | None = Field(default=None, max_length=20)


class PatientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    patient_code: str
    full_name: str
    date_of_birth: date | None
    sex: str | None
    created_at: datetime


class ConsultationCreateRequest(BaseModel):
    patient_id: UUID
    doctor_id: UUID


class ConsultationResponse(BaseModel):
    id: UUID
    patient_id: UUID
    doctor_id: UUID
    status: str
    audio_path: str | None
    language: str


class PatientSummary(BaseModel):
    full_name: str
    patient_code: str
    date_of_birth: date | None
    sex: str | None


class ConsultationListItem(BaseModel):
    id: UUID
    patient_id: UUID
    doctor_id: UUID
    status: str
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    has_transcript: bool
    patient: PatientSummary


class TranscriptSegmentUpdateRequest(BaseModel):
    content: str = Field(
        ...,
        min_length=1,
        description="Nội dung transcript segment sau khi chỉnh sửa",
    )

    @field_validator("content")
    @classmethod
    def validate_content_not_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Content cannot be empty or whitespace only")
        return value


class TranscriptSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    speaker_label: str
    resolved_role: str | None
    content: str
    start_ms: int | None
    end_ms: int | None
    asr_confidence: float | None
    role_confidence: float | None


class TranscriptResponse(BaseModel):
    consultation_id: UUID
    status: str
    segments: list[TranscriptSegmentResponse]

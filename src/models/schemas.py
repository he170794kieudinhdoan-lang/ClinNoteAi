from pydantic import BaseModel, Field
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

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
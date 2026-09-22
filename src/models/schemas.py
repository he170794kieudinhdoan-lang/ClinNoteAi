from pydantic import BaseModel, Field
from uuid import UUID

from pydantic import BaseModel, Field

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
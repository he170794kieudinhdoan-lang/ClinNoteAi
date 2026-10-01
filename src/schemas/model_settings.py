"""Request-scoped model choices; credentials never belong in saved preferences."""

from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

PipelineStep = Literal["stt", "roles", "caps", "soap"]


class ModelPreference(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    provider: Literal["default", "blaze", "9router", "openai", "ollama", "gemini", "openrouter", "groq", "custom"] = "default"
    custom_provider: str = Field(default="", alias="customProvider", max_length=200)
    model: str = Field(default="", max_length=200)
    base_url: str = Field(default="", alias="baseUrl", max_length=500)
    api_key: SecretStr | None = Field(default=None, alias="apiKey")

    @field_validator("model", "custom_provider", "base_url")
    @classmethod
    def trim(cls, value: str) -> str:
        return value.strip()

    @field_validator("base_url")
    @classmethod
    def valid_url(cls, value: str) -> str:
        if value:
            url = urlsplit(value)
            if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.query or url.fragment:
                raise ValueError("URL API phải là http/https, không chứa tài khoản, query hoặc fragment")
            _ = url.port
        return value


class AudioModelPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stt: ModelPreference = Field(default_factory=ModelPreference)
    roles: ModelPreference = Field(default_factory=ModelPreference)


class PingModelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    step: PipelineStep
    preference: ModelPreference = Field(default_factory=ModelPreference)

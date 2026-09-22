from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "AI20K Agent"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000"

    # OpenAI - dùng cho clinical/LLM flow sau này
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Database
    database_url: str = "sqlite:///./data/app.db"
    chroma_persist_dir: str = "./data/chroma"

    # Blaze STT
    blaze_api_key: str = ""
    blaze_api_url: str = "https://api.blaze.vn/v1/stt/execute"

    # Ollama / Qwen
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "kamekichi128/qwen3-4b-instruct-2507:latest"


@lru_cache
def get_settings() -> Settings:
    return Settings()
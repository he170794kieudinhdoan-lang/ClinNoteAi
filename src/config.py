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
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # LLM Provider selection: "9router" or "ollama" or "openai"
    llm_provider: Literal["9router", "ollama", "openai"] = "9router"

    # OpenAI - dùng cho clinical/LLM flow sau này
    openai_api_key: str = ""
    model_name: str = "gpt-4o-mini"
    gemini_api_key: str = ""
    gemini_model: str = ""
    openrouter_api_key: str = ""
    openrouter_model: str = ""
    openrouter_jev_model: str = "typesafe/jev-1.13"
    groq_api_key: str = ""
    groq_model: str = ""
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # 9Router configuration
    ninerouter_base_url: str = "http://localhost:20128/v1"
    ninerouter_api_key: str = ""
    ninerouter_model: str = "ag/gemini-3.8-flash"

    # Database
    database_url: str = "sqlite:///./data/app.db"
    chroma_persist_dir: str = "./data/chroma"

    # Blaze STT
    blaze_api_key: str = ""
    blaze_api_url: str = "https://api.blaze.vn/v1/stt/execute"

    # Ollama / Qwen
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "kamekichi128/qwen3-4b-instruct-2507:latest"

    # Local, single-process SOAP demonstration
    soap_enabled: bool = True
    db_auto_create_tables: bool = True
    soap_data_dir: str = "./data/soap_mvp"
    soap_max_turns: int = Field(default=200, ge=1)
    soap_max_chars: int = Field(default=30_000, ge=1)
    soap_max_input_bytes: int = Field(default=1_000_000, ge=1)
    soap_llm_timeout: float = Field(default=45.0, gt=0)
    cap_extraction_timeout: float = Field(default=60.0, gt=0)
    soap_llm_model: str = ""
    soap_llm_temperature: float = Field(default=0.0, ge=0.0, le=2.0)

    # ICD-10 from icd.kcb.vn, proxied so the Parse key stays on the server.
    parse_api_key: str = ""
    parse_icd_base_url: str = "https://api.parse.bot/scraper/f43e4b76-2a78-47fd-b08d-13fc8f3dbba3"


@lru_cache
def get_settings() -> Settings:
    return Settings()

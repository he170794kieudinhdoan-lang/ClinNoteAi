"""Resolve each invocation independently without modifying global settings."""

import asyncio
import io
import time
import wave
from dataclasses import dataclass, field

import httpx
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from src.config import get_settings
from src.schemas.model_settings import ModelPreference, PipelineStep


class ModelConfigurationError(ValueError):
    pass


def provider_error_message(error: Exception) -> str:
    """Only expose HTTP status categories, never upstream body or credentials."""
    if isinstance(error, ModelConfigurationError):
        return str(error)
    status = getattr(error, "status_code", None)
    if status is None:
        status = getattr(getattr(error, "response", None), "status_code", None)
    messages = {
        401: "Provider từ chối xác thực (401). Kiểm tra API key đúng provider; key có thể thiếu, sai hoặc đã hết hiệu lực.",
        403: "Provider từ chối truy cập (403). Kiểm tra quyền của API key và tài khoản.",
        404: "Provider không tìm thấy endpoint hoặc model (404). Kiểm tra URL và mã model.",
        429: "Provider giới hạn yêu cầu hoặc hết hạn mức (429). Kiểm tra hạn mức và thanh toán tài khoản.",
    }
    return messages.get(status, "Không gọi được provider. Kiểm tra URL, mã model, API key và quyền truy cập.")


@dataclass(frozen=True)
class ModelConnection:
    provider: str
    model: str
    base_url: str
    api_key: str = field(repr=False)


def resolve_connection(step: PipelineStep, preference: ModelPreference | None = None, *, discovery: bool = False) -> ModelConnection:
    settings = get_settings()
    choice = preference or ModelPreference()
    if settings.app_env == "production" and preference is not None:
        raise ModelConfigurationError("Cấu hình model tùy chỉnh hiện chỉ bật ở development/test.")
    provider = choice.provider
    if provider == "default":
        if step == "stt":
            provider = "blaze"
        elif step == "roles":
            provider = "jev"
        else:
            provider = settings.llm_provider
    if step == "stt" and provider not in {"blaze", "custom", "9router", "groq"}:
        raise ModelConfigurationError("STT hỗ trợ Blaze, 9router, Groq hoặc API tương thích Blaze.")
    if step != "stt" and provider == "blaze":
        raise ModelConfigurationError("Blaze chỉ dùng cho bước STT.")
    if step != "roles" and provider == "jev":
        raise ModelConfigurationError("Jev chỉ dùng cho bước phân loại Speaker Role (roles).")
    defaults = {
        "blaze": ("stt-async-1.5", settings.blaze_api_url, settings.blaze_api_key),
        "9router": (settings.ninerouter_model, settings.ninerouter_base_url, settings.ninerouter_api_key),
        "openai": (settings.model_name, "https://api.openai.com/v1", settings.openai_api_key),
        "gemini": (settings.gemini_model, "https://generativelanguage.googleapis.com/v1beta/openai", settings.gemini_api_key),
        "openrouter": (settings.openrouter_model, "https://openrouter.ai/api/v1", settings.openrouter_api_key),
        "jev": (settings.openrouter_jev_model, "https://openrouter.ai/api/alpha/decisions", settings.openrouter_api_key),
        "groq": (settings.groq_model, "https://api.groq.com/openai/v1", settings.groq_api_key),
        "ollama": (settings.ollama_model, settings.ollama_base_url.rstrip("/") + "/v1", "ollama"),
        "custom": ("", "", ""),
    }
    model, url, key = defaults[provider]
    if step == "stt" and provider in {"9router", "groq"}:
        model = "groq/whisper-large-v3" if provider == "9router" else "whisper-large-v3"
    if not discovery and provider in {"gemini", "openrouter", "groq"} and not (choice.model or model):
        raise ModelConfigurationError("Nhập mã model hoặc đặt model mặc định của provider trong cấu hình máy chủ.")
    if step in {"caps", "soap"} and choice.provider == "default":
        model = settings.soap_llm_model or model
    if provider == "custom" and (not choice.custom_provider or not choice.base_url or (not discovery and not choice.model)):
        raise ModelConfigurationError("Provider tùy chỉnh cần tên, mã model và URL API.")
    target = (choice.base_url or url).rstrip("/")
    # Never forward a server credential to an arbitrary user supplied endpoint.
    allowed_official = {
        url.rstrip("/"),
        "https://openrouter.ai/api/v1",
        "https://openrouter.ai/api/alpha/decisions",
    } if provider in {"openrouter", "jev"} else {url.rstrip("/")}

    if target not in allowed_official:
        key = ""
    if choice.api_key is not None:
        key = choice.api_key.get_secret_value().strip()
    return ModelConnection(provider, choice.model or model, target, key)


def create_model(step: PipelineStep, preference: ModelPreference | None = None) -> ChatOpenAI:
    connection = resolve_connection(step, preference)
    settings = get_settings()
    if step == "caps":
        timeout = settings.cap_extraction_timeout
    elif step == "soap":
        timeout = settings.soap_llm_timeout
    else:
        timeout = 120
    return ChatOpenAI(
        model=connection.model,
        base_url=connection.base_url,
        api_key=connection.api_key or "not-required",
        temperature=settings.soap_llm_temperature if step in {"caps", "soap"} else settings.llm_temperature,
        timeout=timeout,
        max_retries=0,
        metadata={"pipeline_provider": connection.provider},
    )


async def ping_model(step: PipelineStep, preference: ModelPreference) -> dict:
    connection = resolve_connection(step, preference)
    started = time.monotonic()
    try:
        if step == "stt":
            from src.services.stt import create_stt

            audio = io.BytesIO()
            with wave.open(audio, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(b"\x00\x00" * 24000)
            await asyncio.wait_for(
                create_stt(preference).transcribe_bytes(audio.getvalue(), allow_empty=True), timeout=30,
            )
        elif connection.provider == "jev":
            if not connection.api_key:
                raise ModelConfigurationError("Jev (OpenRouter) yêu cầu OPENROUTER_API_KEY. Vui lòng nhập API key trong .env hoặc ô API key bên dưới.")
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {connection.api_key}",
            }
            payload = {
                "model": connection.model,
                "state": "Health check",
                "questions": {
                    "is_health_check": {
                        "type": "noul",
                        "instructions": "Is this a health check ping?",
                    }
                },
                "input": "Reply with OK only.",
                "messages": [{"role": "user", "content": "Reply with OK only."}],
            }
            endpoints = [
                connection.base_url,
                "https://openrouter.ai/api/alpha/decisions",
                "https://openrouter.ai/api/v1/chat/completions",
            ]
            seen = set()
            target_urls = [u for u in endpoints if u and not (u in seen or seen.add(u))]

            last_exc = None
            success = False
            for target_url in target_urls:
                try:
                    async with httpx.AsyncClient(timeout=20) as client:
                        response = await client.post(target_url, json=payload, headers=headers)
                        response.raise_for_status()
                    success = True
                    break
                except Exception as exc:
                    last_exc = exc
            if not success and last_exc is not None:
                raise last_exc
        else:
            model = create_model(step, preference)
            response = await asyncio.wait_for(model.ainvoke([HumanMessage(content="Reply with OK only.")], max_tokens=8), timeout=20)
            if not isinstance(response.content, str) or not response.content.strip():
                raise ValueError("empty_response")
        return {"connected": True, "provider": connection.provider, "model": connection.model,
                "latency_ms": round((time.monotonic() - started) * 1000),
                "message": "Model đã phản hồi yêu cầu kiểm tra."}
    except (TimeoutError, httpx.TimeoutException):
        message = "Model không phản hồi trong thời gian cho phép."
    except Exception as exc:
        # Provider errors may contain request headers, URLs or body; do not echo them.
        message = provider_error_message(exc)
    return {"connected": False, "provider": connection.provider, "model": connection.model,
            "latency_ms": round((time.monotonic() - started) * 1000), "message": message}

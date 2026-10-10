import json
import httpx
import pytest
from unittest.mock import AsyncMock

from src.config import Settings
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.speaker.role_classifier import SpeakerRoleClassifier, SpeakerRoleError

_RealAsyncClient = httpx.AsyncClient


@pytest.fixture
def jev_configured(monkeypatch):
    settings = Settings(
        _env_file=None,
        llm_provider="9router",
        openrouter_api_key="openrouter-test-key",
        openrouter_model="openrouter/standard-model",
        openrouter_jev_model="typesafe/jev-1.13",
        ninerouter_model="ninerouter/standard-model",
        ninerouter_base_url="http://router.example/v1",
        ninerouter_api_key="server-test-key",
        ollama_base_url="http://localhost:11434",
        ollama_model="kamekichi128/qwen3-4b-instruct-2507:latest",
        openai_api_key="openai-test-key",
        model_name="gpt-4o-mini",
    )
    monkeypatch.setattr(model_runtime, "get_settings", lambda: settings)
    monkeypatch.setattr("src.services.speaker.role_classifier.get_settings", lambda: settings)
    return settings


@pytest.mark.asyncio
async def test_roles_defaults_to_jev(jev_configured):
    """1. Khi không chỉ định provider cho roles, hệ thống chọn Jev."""
    conn = model_runtime.resolve_connection("roles")
    assert conn.provider == "jev"
    assert conn.model == "typesafe/jev-1.13"
    assert conn.base_url == "https://openrouter.ai/api/alpha/decisions"
    assert conn.api_key == "openrouter-test-key"


@pytest.mark.asyncio
async def test_cap_soap_defaults_not_affected_by_jev(jev_configured):
    """12. Cấu hình model của các tác vụ CAP/SOAP/ICD-10 không bị ảnh hưởng."""
    conn_caps = model_runtime.resolve_connection("caps")
    conn_soap = model_runtime.resolve_connection("soap")
    assert conn_caps.provider == "9router"
    assert conn_soap.provider == "9router"
    assert conn_caps.provider != "jev"
    assert conn_soap.provider != "jev"


@pytest.mark.asyncio
async def test_jev_decisions_api_call_structure(jev_configured, monkeypatch):
    """2 & 3. Khi chọn Jev, request dùng OPENROUTER_JEV_MODEL và gọi Decisions API."""
    captured_requests = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        return httpx.Response(
            200,
            json={
                "speaker_roles": {
                    "1": {"role": "doctor", "confidence": 0.95, "evidence": ["Bác sĩ hỏi"]},
                    "2": {"role": "patient", "confidence": 0.9, "evidence": ["Bệnh nhân trả lời"]},
                },
                "reason": "Phân loại thử nghiệm",
            },
        )

    transport = httpx.MockTransport(handle_request)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = SpeakerRoleClassifier()
    segments = [
        {"speaker": "1", "text": "Chào anh, hôm nay anh thấy thế nào?"},
        {"speaker": "2", "text": "Tôi bị đau đầu 2 ngày nay bác sĩ ơi."},
    ]

    result = await classifier.classify(segments)

    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert str(req.url) == "https://openrouter.ai/api/alpha/decisions"
    assert req.headers["Authorization"] == "Bearer openrouter-test-key"

    body = json.loads(req.content)
    assert body["model"] == "typesafe/jev-1.13"
    assert "messages" in body
    assert "input" in body

    assert result["speaker_roles"]["1"]["role"] == "doctor"
    assert result["speaker_roles"]["2"]["role"] == "patient"


@pytest.mark.asyncio
async def test_jev_response_adaptation_and_validation(jev_configured, monkeypatch):
    """4 & 5. Response Jev được chuyển thành cấu trúc role mà pipeline chấp nhận."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"1": "doctor", "2": "patient", "reason": "Jev simple format"},
        )

    transport = httpx.MockTransport(handle_request)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = SpeakerRoleClassifier()
    segments = [
        {"speaker": "1", "text": "Bệnh sử thế nào?"},
        {"speaker": "2", "text": "Tôi đau bụng."},
    ]
    result = await classifier.classify(segments)

    assert result["speaker_roles"]["1"]["role"] == "doctor"
    assert result["speaker_roles"]["2"]["role"] == "patient"
    assert result["reason"] == "Jev simple format"


@pytest.mark.asyncio
async def test_jev_error_handling(jev_configured, monkeypatch):
    """6. Lỗi API hoặc response sai cấu trúc được xử lý rõ ràng (SpeakerRoleError)."""
    # 6a. Server 500 error
    def handle_500(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="Internal Server Error")

    transport = httpx.MockTransport(handle_500)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = SpeakerRoleClassifier()
    segments = [{"speaker": "1", "text": "A"}, {"speaker": "2", "text": "B"}]
    with pytest.raises(SpeakerRoleError, match="HTTP 500"):
        await classifier.classify(segments)

    # 6b. Missing key error
    settings = Settings(_env_file=None, openrouter_api_key="")
    monkeypatch.setattr("src.services.speaker.role_classifier.get_settings", lambda: settings)
    with pytest.raises(SpeakerRoleError, match="OPENROUTER_API_KEY is not configured"):
        await classifier.classify(segments)


@pytest.mark.asyncio
async def test_other_providers_remain_intact(jev_configured, monkeypatch):
    """7, 8, 9, 10, 11. OpenAI, OpenRouter standard, 9router, Ollama, Gemini, Groq đều hoạt động bình thường."""
    classifier = SpeakerRoleClassifier()

    # 7. OpenAI Explicit Choice
    monkeypatch.setattr(classifier, "_classify_openai", AsyncMock(return_value={
        "speaker_roles": {"1": {"role": "doctor", "confidence": 0.9}, "2": {"role": "patient", "confidence": 0.9}},
        "reason": "openai test",
    }))
    res_openai = await classifier.classify(
        [{"speaker": "1", "text": "A"}, {"speaker": "2", "text": "B"}],
        preference=ModelPreference(provider="openai"),
    )
    assert res_openai["reason"] == "openai test"

    # 8. OpenRouter Standard Model Choice
    conn_openrouter = model_runtime.resolve_connection("roles", ModelPreference(provider="openrouter"))
    assert conn_openrouter.provider == "openrouter"
    assert conn_openrouter.model == "openrouter/standard-model"
    assert conn_openrouter.base_url == "https://openrouter.ai/api/v1"

    # 9. 9router Explicit Choice
    monkeypatch.setattr(classifier, "_classify_9router", AsyncMock(return_value={
        "speaker_roles": {"1": {"role": "doctor", "confidence": 0.9}, "2": {"role": "patient", "confidence": 0.9}},
        "reason": "9router test",
    }))
    res_9router = await classifier.classify(
        [{"speaker": "1", "text": "A"}, {"speaker": "2", "text": "B"}],
        preference=ModelPreference(provider="9router"),
    )
    assert res_9router["reason"] == "9router test"

    # 10. Ollama Explicit Choice
    monkeypatch.setattr(classifier, "_classify_ollama", AsyncMock(return_value={
        "speaker_roles": {"1": {"role": "doctor", "confidence": 0.9}, "2": {"role": "patient", "confidence": 0.9}},
        "reason": "ollama test",
    }))
    res_ollama = await classifier.classify(
        [{"speaker": "1", "text": "A"}, {"speaker": "2", "text": "B"}],
        preference=ModelPreference(provider="ollama"),
    )
    assert res_ollama["reason"] == "ollama test"

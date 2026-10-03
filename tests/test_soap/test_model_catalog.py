import httpx
import pytest

from src.config import Settings
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.model_catalog import list_models


@pytest.mark.asyncio
@pytest.mark.parametrize("step,provider,path,expected", [
    ("stt", "9router", "/models/stt", ["groq/whisper-large-v3", "llama"]),
    ("stt", "groq", "/models", ["groq/whisper-large-v3"]),
    ("caps", "groq", "/models", ["llama"]),
    ("soap", "gemini", "/models", ["groq/whisper-large-v3", "llama"]),
])
async def test_catalog_without_model_and_safe_credentials(monkeypatch, step, provider, path, expected):
    monkeypatch.setattr(model_runtime, "get_settings", lambda: Settings(_env_file=None, groq_api_key="server-secret"))
    captured = []

    async def get(self, url, **kwargs):
        captured.append((url, kwargs))
        return httpx.Response(200, request=httpx.Request("GET", url), json={"data": [
            {"id": "groq/whisper-large-v3"}, {"id": "llama"}, {"id": "llama"}, {"other": "invalid"},
        ]})
    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    result = await list_models(step, ModelPreference(provider=provider, baseUrl="https://other.example/v1"))
    assert result["models"] == expected
    assert captured == [("https://other.example/v1" + path, {"headers": {}})]


@pytest.mark.asyncio
async def test_catalog_error_safe_and_blaze_no_request(monkeypatch):
    async def get(self, url, **kwargs):
        return httpx.Response(401, request=httpx.Request("GET", url), text="secret-header")
    monkeypatch.setattr(httpx.AsyncClient, "get", get)
    result = await list_models("caps", ModelPreference(provider="9router"))
    assert result["models"] == [] and "secret-header" not in str(result)
    assert "401" in result["message"]
    monkeypatch.setattr(httpx.AsyncClient, "get", lambda *args, **kwargs: pytest.fail("Blaze must not GET"))
    assert (await list_models("stt", ModelPreference()))["models"] == []

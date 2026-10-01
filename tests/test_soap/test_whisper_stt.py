import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.messages import AIMessage

from src.config import Settings
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.blaze.stt_async import BlazeSTTError
from src.services.speaker import role_classifier
from src.services.stt import create_stt


@pytest.mark.asyncio
@pytest.mark.parametrize("provider,model", [("9router", "groq/whisper-large-v3"), ("groq", "whisper-large-v3")])
async def test_whisper_contract_and_ping(monkeypatch, provider, model):
    monkeypatch.setattr(model_runtime, "get_settings", lambda: Settings(_env_file=None))
    calls = []

    async def post(self, url, **kwargs):
        calls.append((url, kwargs))
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "text": "Tôi đau đầu.", "segments": [{"text": "Tôi đau đầu.", "start": 0.2, "end": 1.3}],
        })

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    preference = ModelPreference(provider=provider, baseUrl="https://stt.example/v1", apiKey="test-key")
    adapter = create_stt(preference)
    result = await adapter.transcribe_bytes(b"synthetic")
    assert result["segments"] == [{"text": "Tôi đau đầu.", "startTime": 0.2, "endTime": 1.3}]
    assert result["speaker_source"] == "text_inference"
    assert (await model_runtime.ping_model("stt", preference))["connected"]
    assert len(calls) == 2
    for url, arguments in calls:
        assert url == "https://stt.example/v1/audio/transcriptions"
        assert arguments["data"]["model"] == model
        assert arguments["data"]["response_format"] == "verbose_json"
        assert "file" in arguments["files"] and "params" not in arguments
        assert arguments["headers"]["Authorization"] == "Bearer test-key"
    assert model_runtime.resolve_connection("stt", ModelPreference(provider=provider, baseUrl="https://other.example/v1")).api_key == ""


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [None, "unknown", "duplicate", "missing"])
async def test_text_roles_preserve_source_and_reject_ambiguous(monkeypatch, bad):
    segments = [{"text": "Tôi đau đầu.", "startTime": 0, "endTime": 1},
                {"text": "Anh đau bao lâu?", "startTime": 1, "endTime": 2}]
    assignments = [{"index": 0, "role": "patient", "confidence": 0.8},
                   {"index": 1, "role": "doctor", "confidence": 0.9}]
    if bad == "unknown":
        assignments[0]["role"] = "unknown"
    elif bad == "duplicate":
        assignments[1]["index"] = 0
    elif bad == "missing":
        assignments.pop()
    model = SimpleNamespace(ainvoke=AsyncMock(return_value=AIMessage(content=json.dumps({"segment_roles": assignments}))))
    monkeypatch.setattr(role_classifier, "create_model", lambda *args: model)
    classifier = role_classifier.SpeakerRoleClassifier()
    if bad:
        with pytest.raises(role_classifier.SpeakerRoleError):
            await classifier.classify_unlabelled(segments)
    else:
        labelled, result = await classifier.classify_unlabelled(segments)
        assert labelled == [{**segments[0], "speaker": "2"}, {**segments[1], "speaker": "1"}]
        assert all("speaker" not in segment for segment in segments)
        assert result["speaker_roles"]["2"]["role"] == "patient"
    assert model.ainvoke.await_count == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [
    {"text": "Test", "segments": []},
    {"text": "Test", "segments": [{"text": "Test", "start": 2, "end": 1}]},
    {"text": "Test", "segments": [{"text": "Test", "start": float("inf"), "end": 2}]},
    {"text": "Test", "segments": [{"text": "Test"}]},
])
async def test_invalid_whisper_response_does_not_make_up_sources(monkeypatch, payload):
    async def post(self, url, **kwargs):
        return httpx.Response(200, request=httpx.Request("POST", url), text=json.dumps(payload))
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    with pytest.raises(BlazeSTTError):
        await create_stt(ModelPreference(provider="9router")).transcribe_bytes(b"synthetic")

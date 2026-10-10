import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from langchain_core.messages import AIMessage

from src.api import routes as audio_routes
from src.api import soap_routes
from src.config import Settings
from src.database import get_db
from src.main import app
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.blaze.stt_async import BlazeSTTAsync
from src.services.speaker import role_classifier


@pytest.fixture
def configured(monkeypatch):
    settings = Settings(_env_file=None, llm_provider="9router", ninerouter_model="role-default",
                        soap_llm_model="soap-default", ninerouter_base_url="http://router.example/v1",
                        ninerouter_api_key="server-test-key", blaze_api_key="stt-test-key")
    monkeypatch.setattr(model_runtime, "get_settings", lambda: settings)
    return settings


@pytest.mark.parametrize(("provider", "endpoint"), [
    ("gemini", "https://generativelanguage.googleapis.com/v1beta/openai"),
    ("openrouter", "https://openrouter.ai/api/v1"),
    ("groq", "https://api.groq.com/openai/v1"),
])
@pytest.mark.asyncio
async def test_new_provider_transport_and_credentials(provider, endpoint, monkeypatch, configured):
    original = model_runtime.ChatOpenAI
    captured = []

    def respond(request):
        captured.append(request)
        return httpx.Response(200, json={"id": "test", "object": "chat.completion", "created": 1,
                                       "model": "chosen-model", "choices": [{"index": 0, "finish_reason": "stop",
                                       "message": {"role": "assistant", "content": "OK"}}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as transport:
        monkeypatch.setattr(model_runtime, "ChatOpenAI", lambda **kwargs: original(http_async_client=transport, **kwargs))
        preference = ModelPreference(provider=provider, model="chosen-model", apiKey="provider-test-key")
        result = await model_runtime.ping_model("caps", preference)
    assert result["connected"] and result["provider"] == provider
    assert str(captured[0].url) == endpoint + "/chat/completions"
    assert captured[0].headers["Authorization"] == "Bearer provider-test-key"
    assert json.loads(captured[0].content)["model"] == "chosen-model"
    connection = model_runtime.resolve_connection("soap", preference.model_copy(update={"base_url": "https://different.example/v1", "api_key": None}))
    assert connection.api_key == ""


def test_defaults_and_credential_isolation(configured):
    assert model_runtime.resolve_connection("roles").model == "typesafe/jev-1.13"
    assert model_runtime.resolve_connection("caps").model == "soap-default"
    assert model_runtime.resolve_connection("stt").model == "stt-async-1.5"
    choice = ModelPreference(provider="9router", model="override", baseUrl="http://other.example/v1")
    resolved = model_runtime.resolve_connection("caps", choice)
    assert resolved.model == "override" and resolved.api_key == ""
    assert configured.ninerouter_model == "role-default"
    authenticated = model_runtime.resolve_connection("caps", choice.model_copy(update={"api_key": ModelPreference(apiKey="tab-test-key").api_key}))
    assert authenticated.api_key == "tab-test-key"
    assert "tab-test-key" not in repr(authenticated)


@pytest.mark.asyncio
async def test_ping_success_failure_timeout_and_invalid_config(client, monkeypatch, configured):
    llm = SimpleNamespace(ainvoke=AsyncMock(return_value=AIMessage(content="OK")))
    monkeypatch.setattr(model_runtime, "create_model", lambda *args: llm)
    response = await client.post("/api/v1/model-settings/ping", json={"step": "caps", "preference": {"model": "caps-test"}})
    assert response.status_code == 200
    assert response.json()["connected"] and response.json()["model"] == "caps-test"
    assert llm.ainvoke.await_count == 1
    assert llm.ainvoke.call_args.args[0][0].content == "Reply with OK only."
    llm.ainvoke.side_effect = RuntimeError("secret-test-key provider response")
    failed = await client.post("/api/v1/model-settings/ping", json={"step": "roles"})
    assert failed.status_code == 200 and not failed.json()["connected"]
    assert "secret-test-key" not in failed.text
    llm.ainvoke.side_effect = TimeoutError()
    timed_out = await client.post("/api/v1/model-settings/ping", json={"step": "soap"})
    assert not timed_out.json()["connected"]
    assert "thời gian" in timed_out.json()["message"]
    invalid = await client.post("/api/v1/model-settings/ping", json={"step": "stt", "preference": {"provider": "openai"}})
    assert invalid.status_code == 422
    missing = await client.post("/api/v1/model-settings/ping", json={"step": "soap", "preference": {"provider": "custom"}})
    assert missing.status_code == 422


@pytest.mark.asyncio
async def test_stt_adapter_and_ping_share_model_url_and_key(client, monkeypatch, configured, tmp_path):
    calls = []

    async def post(self, url, **kwargs):
        calls.append((url, kwargs))
        data = {"is_successful": True, "segments": [{"speaker": 1, "text": "Dữ liệu giả lập"}]}
        return httpx.Response(200, json={"result": {"data": data}}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    preference = ModelPreference(provider="custom", customProvider="Demo STT", model="stt-test",
                                 baseUrl="http://stt.example/execute", apiKey="tab-stt-key")
    audio = tmp_path / "synthetic.wav"
    audio.write_bytes(b"synthetic audio fixture")
    await BlazeSTTAsync(preference).transcribe(audio)
    result = await model_runtime.ping_model("stt", preference)
    assert result["connected"]
    assert len(calls) == 2
    for url, arguments in calls:
        assert url == "http://stt.example/execute"
        assert arguments["params"]["model"] == "stt-test"
        assert arguments["headers"]["Authorization"] == "Bearer tab-stt-key"
    assert calls[1][1]["files"]["audio_file"][1].startswith(b"RIFF")


@pytest.mark.asyncio
async def test_role_model_is_request_scoped(monkeypatch, configured):
    role_result = {"speaker_roles": {"1": {"role": "doctor", "confidence": 0.9},
                                      "2": {"role": "patient", "confidence": 0.8}}}
    llm = SimpleNamespace(ainvoke=AsyncMock(return_value=AIMessage(content=json.dumps(role_result))))
    received = []

    def create(step, choice):
        received.append((step, choice.model))
        return llm

    monkeypatch.setattr(role_classifier, "create_model", create)
    result = await role_classifier.SpeakerRoleClassifier().classify(
        [{"speaker": 1, "text": "Anh đau ở đâu?"}, {"speaker": 2, "text": "Tôi đau đầu."}],
        ModelPreference(provider="ollama", model="role-test"),
    )
    assert result == role_result and received == [("roles", "role-test")]
    assert llm.ainvoke.await_count == 1


@pytest.mark.asyncio
async def test_cap_and_soap_route_independent_choices(client, soap_override, sample, monkeypatch, configured):
    transcript, caps, soap = sample
    calls = []

    def create(step, choice):
        connection = model_runtime.resolve_connection(step, choice)
        calls.append((step, connection.model))
        return SimpleNamespace(ainvoke=AsyncMock(return_value=AIMessage(content=json.dumps(caps if step == "caps" else soap))),
                               model_name=connection.model, metadata={"pipeline_provider": connection.provider})

    monkeypatch.setattr(soap_routes, "create_model", create)
    extracted = await client.post("/api/v1/soap/extract-caps", json={
        "input_format": "canonical", "content": transcript,
        "model_config_override": {"provider": "9router", "model": "cap-test", "apiKey": "private-cap-test"},
    })
    assert extracted.status_code == 200, extracted.text
    run_id = extracted.json()["run_id"]
    generated = await client.post(f"/api/v1/soap/runs/{run_id}/generate", json={
        "expected_revision": 0, "model_config_override": {"provider": "ollama", "model": "soap-test"},
    })
    assert generated.status_code == 200, generated.text
    assert calls == [("caps", "cap-test"), ("soap", "soap-test")]
    assert generated.json()["model_metadata"]["provider"] == "ollama"
    assert generated.json()["revision"]["model"] == "soap-test"
    for artifact in soap_override.root.rglob("*.json"):
        assert "private-cap-test" not in artifact.read_text(encoding="utf-8")


@pytest.mark.asyncio
@pytest.mark.parametrize("whisper", [False, True])
async def test_audio_multipart_forwards_both_choices_without_real_database(client, monkeypatch, configured, tmp_path, whisper):
    from unittest.mock import MagicMock
    from uuid import uuid4

    consultation = SimpleNamespace(id=uuid4(), status="COMPLETED")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = consultation
    async def fake_database():
        return db

    app.dependency_overrides[get_db] = fake_database
    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"synthetic")
    segments = [{"speaker": 1, "text": "Anh đau ở đâu?", "start": 0, "end": 1},
                {"speaker": 2, "text": "Tôi đau đầu.", "start": 1, "end": 2}]
    role_result = {"speaker_roles": {"1": {"role": "doctor", "confidence": 0.9},
                                      "2": {"role": "patient", "confidence": 0.8}}}
    received = []

    class FakeSTT:
        def __init__(self, preference):
            received.append(("stt", preference.model))

        async def transcribe(self, path):
            assert path == audio
            return {"segments": segments, **({"speaker_source": "text_inference"} if whisper else {})}

    async def classify(raw, preference):
        assert raw == segments
        received.append(("roles", preference.model))
        return role_result

    saved = SimpleNamespace(id=uuid4(), speaker_label="1", resolved_role="doctor", content="Dữ liệu tổng hợp",
                            start_ms=None, end_ms=None, role_confidence=0.9)
    monkeypatch.setattr(audio_routes, "save_temp_audio", AsyncMock(return_value=audio))
    monkeypatch.setattr(audio_routes, "BlazeSTTAsync", FakeSTT)
    monkeypatch.setattr(audio_routes, "create_stt", FakeSTT)
    monkeypatch.setattr(audio_routes.speaker_role_classifier, "classify", classify)
    async def classify_unlabelled(raw, preference):
        return raw, await classify(raw, preference)
    monkeypatch.setattr(audio_routes.speaker_role_classifier, "classify_unlabelled", classify_unlabelled)
    monkeypatch.setattr(audio_routes, "save_transcript_for_consultation", lambda **kwargs: [saved])
    try:
        response = await client.post(f"/api/v1/consultations/{consultation.id}/audio", files={"audio_file": ("audio.wav", b"synthetic", "audio/wav")}, data={
            "model_preferences": json.dumps({"stt": {"provider": "9router" if whisper else "default", "model": "chosen-stt"}, "roles": {"model": "chosen-roles"}}),
        })
        assert response.status_code == 200, response.text
        assert received == [("stt", "chosen-stt"), ("roles", "chosen-roles")]
        assert response.json()["speaker_source"] == ("text_inference" if whisper else "audio")
        db.commit.assert_not_called()
        invalid = await client.post(f"/api/v1/consultations/{consultation.id}/audio", files={"audio_file": ("audio.wav", b"synthetic")}, data={"model_preferences": "{invalid"})
        assert invalid.status_code == 422
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_validation_does_not_echo_secret_input(client):
    response = await client.post("/api/v1/model-settings/ping", json={
        "step": "soap", "preference": {"provider": "not-supported", "apiKey": "private-invalid-test"},
    })
    assert response.status_code == 422
    assert "private-invalid-test" not in response.text and '"input"' not in response.text

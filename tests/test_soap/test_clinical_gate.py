"""Comprehensive test suite for Clinical Relevance Gate."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
from langchain_core.messages import AIMessage

from src.agents.soap_graph import create_soap_pipeline
from src.config import Settings
from src.database import get_db
from src.main import app
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.clinical_gate.classifier import (
    ClinicalGateError,
    ClinicalRelevanceClassifier,
    ClinicalRelevanceDecision,
    clinical_gate_classifier,
)
from src.services.clinical_gate.heuristic import evaluate_heuristics

_RealAsyncClient = httpx.AsyncClient


@pytest.fixture
def jev_gate_settings(monkeypatch):
    settings = Settings(
        _env_file=None,
        llm_provider="9router",
        openrouter_api_key="openrouter-test-key",
        openrouter_model="openrouter/standard-model",
        openrouter_jev_model="typesafe/jev-1.13",
        ninerouter_model="ninerouter/standard-model",
        ninerouter_base_url="http://router.example/v1",
        ninerouter_api_key="server-test-key",
        openai_api_key="openai-test-key",
        model_name="gpt-4o-mini",
    )
    monkeypatch.setattr(model_runtime, "get_settings", lambda: settings)
    monkeypatch.setattr("src.services.clinical_gate.classifier.get_settings", lambda: settings)
    return settings


# ==============================================================================
# 1. HEURISTIC PRE-FILTER TESTS
# ==============================================================================

def test_heuristic_detects_empty_transcript():
    res = evaluate_heuristics([])
    assert res is not None
    assert res.is_unusable is True
    assert res.status == "UNCERTAIN"
    assert "rỗng" in res.reason


def test_heuristic_detects_all_whitespace_segments():
    res = evaluate_heuristics([{"text": "   "}, {"text": "\n\t"}])
    assert res is not None
    assert res.is_unusable is True
    assert res.status == "UNCERTAIN"


def test_heuristic_detects_ultra_short_single_token():
    res = evaluate_heuristics([{"text": "Alo"}])
    assert res is not None
    assert res.is_unusable is True
    assert res.status == "UNCERTAIN"
    assert "quá ngắn" in res.reason


def test_heuristic_detects_corrupted_repeated_garble():
    garble = [{"text": "ừ ừ ừ ừ ừ ừ ừ ừ ừ ừ ừ ừ"}]
    res = evaluate_heuristics(garble)
    assert res is not None
    assert res.is_unusable is True
    assert res.status == "UNCERTAIN"
    assert "lặp" in res.reason


def test_heuristic_passes_normal_dialogue():
    # Even a short 2-turn dialogue should pass heuristic to be evaluated by model
    dialogue = [
        {"speaker": 1, "text": "Chào bác sĩ, dạo này tôi đau khớp gối quá."},
        {"speaker": 2, "text": "Bác đau bao lâu rồi, có sưng nóng đỏ không?"},
    ]
    res = evaluate_heuristics(dialogue)
    assert res is None


# ==============================================================================
# 2. JEV DECISIONS API ADAPTER TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_jev_adapter_request_structure_and_clinical_outcome(jev_gate_settings, monkeypatch):
    """Jev adapter posts to Decisions API with is_clinical_consultation question."""
    captured_requests = []

    def handle_request(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        return httpx.Response(
            200,
            json={
                "answers": {
                    "is_clinical_consultation": {
                        "noul": 0.94,
                    }
                }
            },
        )

    transport = httpx.MockTransport(handle_request)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = ClinicalRelevanceClassifier()
    segments = [
        {"speaker": "1", "text": "Bác sĩ ơi, tôi bị sốt và ho đờm 3 ngày nay rồi."},
        {"speaker": "2", "text": "Để tôi nghe phổi của anh nhé. Hít sâu vào nào."},
    ]

    decision = await classifier.evaluate(segments, preference=ModelPreference(provider="jev"))

    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert str(req.url) == "https://openrouter.ai/api/alpha/decisions"
    assert req.headers["Authorization"] == "Bearer openrouter-test-key"

    body = json.loads(req.content)
    assert body["model"] == "typesafe/jev-1.13"
    assert "is_clinical_consultation" in body["questions"]
    assert body["questions"]["is_clinical_consultation"]["type"] == "noul"

    assert decision.status == "CLINICAL"
    assert decision.confidence == 0.94
    assert decision.is_technical_failure is False


@pytest.mark.asyncio
async def test_jev_adapter_non_clinical_outcome(jev_gate_settings, monkeypatch):
    """Low Jev score (<=0.35) maps to NON_CLINICAL."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answers": {
                    "is_clinical_consultation": {
                        "noul": 0.12,
                    }
                }
            },
        )

    transport = httpx.MockTransport(handle_request)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = ClinicalRelevanceClassifier()
    casual_segments = [
        {"speaker": "1", "text": "Cuối tuần này cậu có đi du lịch Đà Lạt không?"},
        {"speaker": "2", "text": "Chắc có, mình vừa đặt vé máy bay hôm qua rồi."},
    ]

    decision = await classifier.evaluate(casual_segments, preference=ModelPreference(provider="jev"))
    assert decision.status == "NON_CLINICAL"
    assert decision.confidence == 0.88  # 1.0 - 0.12
    assert decision.is_technical_failure is False


@pytest.mark.asyncio
async def test_jev_adapter_uncertain_outcome(jev_gate_settings, monkeypatch):
    """Mid-range Jev score (0.35 < score < 0.65) maps to UNCERTAIN."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "answers": {
                    "is_clinical_consultation": {
                        "noul": 0.52,
                    }
                }
            },
        )

    transport = httpx.MockTransport(handle_request)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = ClinicalRelevanceClassifier()
    ambiguous = [
        {"speaker": "1", "text": "Hôm nay tôi thấy trong người hơi mệt."},
        {"speaker": "2", "text": "Vậy à, nghỉ ngơi tí xem sao nhé."},
    ]

    decision = await classifier.evaluate(ambiguous, preference=ModelPreference(provider="jev"))
    assert decision.status == "UNCERTAIN"
    assert decision.confidence == 0.52
    assert decision.is_technical_failure is False


# ==============================================================================
# 3. STANDARD CHAT PROVIDERS (OPENAI, 9ROUTER, GEMINI, GROQ, OLLAMA)
# ==============================================================================

@pytest.mark.asyncio
async def test_standard_provider_clinical_evaluation(monkeypatch):
    """Chat models use Vietnamese prompt and return structured JSON."""
    fake_response_json = json.dumps({
        "status": "CLINICAL",
        "confidence": 0.95,
        "reason": "Bác sĩ thăm khám triệu chứng đau đầu và hướng dẫn đo huyết áp.",
        "evidence_signals": ["Đau đầu vùng trán", "Huyết áp 130/80"],
    })

    fake_model = AsyncMock()
    fake_model.ainvoke.return_value = AIMessage(content=fake_response_json)

    monkeypatch.setattr("src.services.clinical_gate.classifier.create_model", lambda step, pref: fake_model)

    classifier = ClinicalRelevanceClassifier()
    segments = [
        {"speaker": "1", "text": "Tôi bị đau đầu vùng trán hai hôm nay."},
        {"speaker": "2", "text": "Huyết áp của anh là 130/80, để tôi kiểm tra phản xạ mắt."},
    ]

    decision = await classifier.evaluate(segments, preference=ModelPreference(provider="openai", model="gpt-4o-mini"))
    assert decision.status == "CLINICAL"
    assert decision.confidence == 0.95
    assert "triệu chứng" in decision.reason
    assert len(decision.evidence_signals) == 2


@pytest.mark.asyncio
async def test_medical_terms_without_consultation_is_non_clinical(monkeypatch):
    """News broadcast mentioning medicine/diseases should be classified as NON_CLINICAL."""
    fake_response_json = json.dumps({
        "status": "NON_CLINICAL",
        "confidence": 0.92,
        "reason": "Bản tin thời sự y tế, không phải hội thoại khám chữa bệnh thực tế.",
        "evidence_signals": ["Bản tin y tế 24h", "Bộ Y tế khuyến cáo"],
    })

    fake_model = AsyncMock()
    fake_model.ainvoke.return_value = AIMessage(content=fake_response_json)

    monkeypatch.setattr("src.services.clinical_gate.classifier.create_model", lambda step, pref: fake_model)

    classifier = ClinicalRelevanceClassifier()
    news_text = [
        {"speaker": "1", "text": "Chào quý vị, bản tin y tế hôm nay sẽ nói về bệnh viêm gan và thuốc paracetamol."},
        {"speaker": "2", "text": "Bộ Y tế khuyến cáo người dân không tự ý mua kháng sinh tại hiệu thuốc."},
    ]

    decision = await classifier.evaluate(news_text, preference=ModelPreference(provider="9router"))
    assert decision.status == "NON_CLINICAL"
    assert decision.confidence == 0.92


@pytest.mark.asyncio
async def test_consultation_with_casual_chitchat_is_clinical(monkeypatch):
    """Clinical consultation containing casual chitchat must remain CLINICAL."""
    fake_response_json = json.dumps({
        "status": "CLINICAL",
        "confidence": 0.89,
        "reason": "Có trò chuyện xã giao đầu buổi nhưng phần chính là khám thoái hóa khớp gối.",
        "evidence_signals": ["Đau nhức khớp gối khi lên cầu thang"],
    })

    fake_model = AsyncMock()
    fake_model.ainvoke.return_value = AIMessage(content=fake_response_json)

    monkeypatch.setattr("src.services.clinical_gate.classifier.create_model", lambda step, pref: fake_model)

    classifier = ClinicalRelevanceClassifier()
    mixed = [
        {"speaker": "1", "text": "Hôm nay trời nắng nóng quá bác nhỉ, dạo này con cái bác thế nào?"},
        {"speaker": "2", "text": "Cảm ơn bác sĩ, các cháu vẫn khỏe. Nhưng cái khớp gối của tôi dạo này đau nhức quá."},
        {"speaker": "1", "text": "Để tôi khám gối cho bác xem có sưng không nhé."},
    ]

    decision = await classifier.evaluate(mixed, preference=ModelPreference(provider="gemini", model="gemini-2.5-flash"))
    assert decision.status == "CLINICAL"


# ==============================================================================
# 4. TECHNICAL FAILURE HANDLING
# ==============================================================================

@pytest.mark.asyncio
async def test_jev_timeout_returns_technical_failure(jev_gate_settings, monkeypatch):
    """Timeout during Jev call sets is_technical_failure=True and safe raw_error."""
    def timeout_handler(request: httpx.Request):
        raise httpx.TimeoutException("Connection timed out after 60s")

    transport = httpx.MockTransport(timeout_handler)
    monkeypatch.setattr("httpx.AsyncClient", lambda **kwargs: _RealAsyncClient(transport=transport))

    classifier = ClinicalRelevanceClassifier()
    segments = [
        {"speaker": "1", "text": "Bác sĩ ơi tôi đau lưng nhiều quá từ tuần trước."},
        {"speaker": "2", "text": "Bác đau ở vị trí thắt lưng hay lan xuống chân?"},
    ]

    decision = await classifier.evaluate(segments, preference=ModelPreference(provider="jev"))
    assert decision.is_technical_failure is True
    assert decision.status == "UNCERTAIN"
    assert decision.confidence is None
    assert "timed out" in decision.raw_error


@pytest.mark.asyncio
async def test_missing_openrouter_api_key_returns_technical_failure(monkeypatch):
    """Missing API key for Jev is a technical failure, not content classification."""
    settings = Settings(_env_file=None, openrouter_api_key="")
    monkeypatch.setattr("src.services.clinical_gate.classifier.get_settings", lambda: settings)

    classifier = ClinicalRelevanceClassifier()
    segments = [
        {"speaker": "1", "text": "Bác sĩ ơi tôi đau lưng nhiều quá từ tuần trước."},
        {"speaker": "2", "text": "Bác đau ở vị trí thắt lưng hay lan xuống chân?"},
    ]

    decision = await classifier.evaluate(segments, preference=ModelPreference(provider="jev"))
    assert decision.is_technical_failure is True
    assert "OPENROUTER_API_KEY is not configured" in decision.raw_error


# ==============================================================================
# 5. INTEGRATION TEST: AUDIO UPLOAD ROUTE WITH GATE (ROUTES.PY)
# ==============================================================================

@pytest.mark.asyncio
async def test_audio_upload_blocks_non_clinical_and_skips_role_classification(monkeypatch, tmp_path):
    """When Gate classifies NON_CLINICAL, role classification is skipped and status is NON_CLINICAL."""
    from types import SimpleNamespace
    from src.api import routes as audio_routes

    consultation_id = uuid4()
    consultation = SimpleNamespace(id=consultation_id, status="PROCESSING")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = consultation

    async def fake_get_db():
        return db

    app.dependency_overrides[get_db] = fake_get_db

    audio_file = tmp_path / "casual.wav"
    audio_file.write_bytes(b"dummy")

    stt_segments = [
        {"speaker": "1", "text": "Đi ăn lẩu không bạn ơi?"},
        {"speaker": "2", "text": "Đi chứ, quán nào ngon vậy?"},
    ]

    class FakeSTT:
        async def transcribe(self, path):
            return {"segments": stt_segments, "speaker_source": "audio"}

    role_classifier_called = False

    async def fake_classify(*args, **kwargs):
        nonlocal role_classifier_called
        role_classifier_called = True
        return {"speaker_roles": {}}

    gate_mock = AsyncMock(return_value=ClinicalRelevanceDecision(
        status="NON_CLINICAL",
        confidence=0.96,
        reason="Hội thoại rủ nhau đi ăn, phi lâm sàng.",
        evidence_signals=["Đi ăn lẩu"],
        is_technical_failure=False,
    ))

    monkeypatch.setattr(audio_routes, "save_temp_audio", AsyncMock(return_value=audio_file))
    monkeypatch.setattr(audio_routes, "blaze_stt", FakeSTT())
    monkeypatch.setattr(audio_routes.speaker_role_classifier, "classify", fake_classify)
    monkeypatch.setattr(audio_routes.clinical_gate_classifier, "evaluate", gate_mock)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/consultations/{consultation_id}/audio",
            files={"audio_file": ("casual.wav", b"dummy", "audio/wav")},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "NON_CLINICAL"
    assert role_classifier_called is False  # MUST NOT call role classification
    assert data["clinical_relevance"]["status"] == "NON_CLINICAL"
    # For NON_CLINICAL: transcript segments MUST NOT be persisted; empty transcript returned
    assert data["transcript"] == []
    assert data["segments_count"] == 0
    assert consultation.status == "NON_CLINICAL"
    assert db.commit.called is True
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_audio_upload_uncertain_persists_unclassified_transcript(monkeypatch, tmp_path):
    """When Gate classifies UNCERTAIN, unclassified transcript is saved for review, but role classification is skipped."""
    from types import SimpleNamespace
    from src.api import routes as audio_routes

    consultation_id = uuid4()
    consultation = SimpleNamespace(id=consultation_id, status="PROCESSING")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = consultation

    async def fake_get_db():
        return db

    app.dependency_overrides[get_db] = fake_get_db

    audio_file = tmp_path / "uncertain.wav"
    audio_file.write_bytes(b"dummy")

    stt_segments = [
        {"speaker": "1", "text": "Hôm nay tôi thấy hơi lạ trong người."},
        {"speaker": "2", "text": "Lạ thế nào, kể rõ hơn xem sao?"},
    ]

    class FakeSTT:
        async def transcribe(self, path):
            return {"segments": stt_segments, "speaker_source": "audio"}

    role_classifier_called = False

    async def fake_classify(*args, **kwargs):
        nonlocal role_classifier_called
        role_classifier_called = True
        return {"speaker_roles": {}}

    gate_mock = AsyncMock(return_value=ClinicalRelevanceDecision(
        status="UNCERTAIN",
        confidence=0.50,
        reason="Hội thoại mơ hồ, chưa đủ căn cứ xác định có phải buổi khám bệnh hay không.",
        evidence_signals=["Hơi lạ trong người"],
        is_technical_failure=False,
    ))

    monkeypatch.setattr(audio_routes, "save_temp_audio", AsyncMock(return_value=audio_file))
    monkeypatch.setattr(audio_routes, "blaze_stt", FakeSTT())
    monkeypatch.setattr(audio_routes.speaker_role_classifier, "classify", fake_classify)
    monkeypatch.setattr(audio_routes.clinical_gate_classifier, "evaluate", gate_mock)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/consultations/{consultation_id}/audio",
            files={"audio_file": ("uncertain.wav", b"dummy", "audio/wav")},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "UNCERTAIN"
    assert role_classifier_called is False  # MUST NOT call role classification
    assert data["clinical_relevance"]["status"] == "UNCERTAIN"
    # Segments saved with resolved_role = None for review workflow
    assert data["segments_count"] == 2
    assert data["transcript"][0]["resolved_role"] is None
    assert consultation.status == "UNCERTAIN"
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_get_consultation_transcript_returns_empty_when_non_clinical():
    """get_consultation_transcript must return empty segments when consultation status is NON_CLINICAL."""
    from types import SimpleNamespace

    consultation_id = uuid4()
    consultation = SimpleNamespace(id=consultation_id, status="NON_CLINICAL")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = consultation

    async def fake_get_db():
        return db

    app.dependency_overrides[get_db] = fake_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(f"/api/v1/consultations/{consultation_id}/transcript")

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "NON_CLINICAL"
    assert data["segments"] == []
    app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_audio_upload_proceeds_when_clinical(monkeypatch, tmp_path):
    """When Gate classifies CLINICAL, role classification proceeds and consultation is COMPLETED."""
    from types import SimpleNamespace
    from src.api import routes as audio_routes

    consultation_id = uuid4()
    consultation = SimpleNamespace(id=consultation_id, status="PROCESSING")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = consultation

    async def fake_get_db():
        return db

    app.dependency_overrides[get_db] = fake_get_db

    audio_file = tmp_path / "clinical.wav"
    audio_file.write_bytes(b"dummy")

    stt_segments = [
        {"speaker": "1", "text": "Tôi bị đau ngực khi leo thang."},
        {"speaker": "2", "text": "Cơn đau kéo dài bao lâu, có lan ra cánh tay không?"},
    ]

    class FakeSTT:
        async def transcribe(self, path):
            return {"segments": stt_segments, "speaker_source": "audio"}

    role_classifier_called = False

    async def fake_classify(*args, **kwargs):
        nonlocal role_classifier_called
        role_classifier_called = True
        return {
            "speaker_roles": {
                "1": {"role": "patient", "confidence": 0.95},
                "2": {"role": "doctor", "confidence": 0.95},
            }
        }

    gate_mock = AsyncMock(return_value=ClinicalRelevanceDecision(
        status="CLINICAL",
        confidence=0.98,
        reason="Khám bệnh tim mạch rõ ràng.",
        evidence_signals=["Đau ngực khi leo thang"],
        is_technical_failure=False,
    ))

    monkeypatch.setattr(audio_routes, "save_temp_audio", AsyncMock(return_value=audio_file))
    monkeypatch.setattr(audio_routes, "blaze_stt", FakeSTT())
    monkeypatch.setattr(audio_routes.speaker_role_classifier, "classify", fake_classify)
    monkeypatch.setattr(audio_routes.clinical_gate_classifier, "evaluate", gate_mock)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            f"/api/v1/consultations/{consultation_id}/audio",
            files={"audio_file": ("clinical.wav", b"dummy", "audio/wav")},
        )

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    assert role_classifier_called is True  # MUST call role classification
    assert data["clinical_relevance"]["status"] == "CLINICAL"
    assert data["transcript"][0]["resolved_role"] == "patient"
    assert data["transcript"][1]["resolved_role"] == "doctor"
    app.dependency_overrides.pop(get_db, None)


# ==============================================================================
# 6. DEFENSE IN DEPTH: SOAP PIPELINE BLOCKS NON_CLINICAL TRANSCRIPT
# ==============================================================================

@pytest.mark.asyncio
async def test_soap_pipeline_blocks_non_clinical_transcript(soap_store, monkeypatch):
    """Direct invocation of SOAP graph with non-clinical transcript is halted at check_gate node."""
    llm = MagicMock()
    llm_called = False

    async def fake_extract(*args, **kwargs):
        nonlocal llm_called
        llm_called = True
        return "{}", {}

    monkeypatch.setattr("src.services.soap.extractor.extract_once", fake_extract)

    gate_mock = AsyncMock(return_value=ClinicalRelevanceDecision(
        status="NON_CLINICAL",
        confidence=0.97,
        reason="Văn bản bàn về chứng khoán, không phải y tế.",
        evidence_signals=["Thị trường chứng khoán hôm nay"],
        is_technical_failure=False,
    ))
    monkeypatch.setattr("src.agents.nodes.soap_nodes.clinical_gate_classifier.evaluate", gate_mock)

    pipeline = create_soap_pipeline(soap_store, llm)
    raw_content = "Doctor: Hôm nay giá cổ phiếu tăng mạnh.\nPatient: Vâng, tôi đã chốt lời rồi."

    result = await pipeline.ainvoke({
        "operation": "extract",
        "input_format": "text",
        "content": raw_content,
    })

    assert "error" in result
    assert result["error"]["stage"] == "clinical_gate"
    assert result["error"]["code"] == "non_clinical_transcript"
    assert result["error"]["status"] == 422
    assert llm_called is False  # LLM #1 MUST NOT BE CALLED

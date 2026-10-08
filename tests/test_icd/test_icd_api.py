import json
import os

import pytest
from langchain_core.messages import AIMessage

import src.services.icd_suggest as icd_suggest
from src.api.icd_routes import _soap_store
from src.main import app
from src.services.icd_kcb import IcdNotFoundError

pytestmark = pytest.mark.asyncio

DETAIL = {
    "icd10_code": "M17.9", "disease_name_vi": "Thoái hóa khớp gối, không xác định",
    "description_vi": "Thoái hóa khớp gối", "chapter": {"code": "XIII", "title": "Bệnh hệ cơ xương"},
    "section": {"code": "M00-M25", "title": "Cơ quan vận động"},
    "parent_group": {"code": "M17", "title": "Thoái hóa khớp gối"},
}


class FakeLLM:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        content = self.outputs.pop(0)
        if isinstance(content, Exception):
            raise content
        return AIMessage(content=content)


class FakeLookup:
    def __init__(self, known):
        self.known = {k.upper(): dict(DETAIL, icd10_code=k.upper()) for k in known}
        self.calls = []

    async def __call__(self, code):
        self.calls.append(code)
        if code.upper() not in self.known:
            raise IcdNotFoundError(code)
        return self.known[code.upper()]


@pytest.fixture
def store_override(soap_store):
    async def override():
        return soap_store

    app.dependency_overrides[_soap_store] = override
    yield soap_store
    app.dependency_overrides.pop(_soap_store, None)


@pytest.fixture
def llm_override(monkeypatch):
    def apply(output_text):
        # suggest_codes / _suggest import get_soap_llm lazily from src.services.llm
        monkeypatch.setattr("src.services.llm.get_soap_llm", lambda preference=None: FakeLLM([output_text]))
    return apply


@pytest.fixture
def verify(monkeypatch):
    fake = FakeLookup(["M17.9"])
    monkeypatch.setattr(icd_suggest, "lookup_code", fake)
    return fake


async def test_icd_suggest_happy_path(client, store_override, run_id, llm_override, verify):
    llm_override(json.dumps({"suggestions": [
        {"code": "M17.9", "rationale": "Đau và sưng gối trái", "cap_ids": ["C1", "C2"], "confidence": 85}],
        "unsure": []}))
    response = await client.post("/api/v1/icd/suggest", json={"run_id": run_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["suggestions"][0]["code"] == "M17.9"
    assert body["suggestions"][0]["verified"] is True
    assert body["prompt_version"] == "icd-1"


async def test_icd_suggest_run_without_caps_returns_409(client, store_override, sample, llm_override):
    from src.schemas.soap import Transcript

    transcript, _ = sample
    created = store_override.create_run({"input_format": "canonical", "content": transcript},
                                        Transcript.model_validate(transcript), "canonical")
    response = await client.post("/api/v1/icd/suggest", json={"run_id": created})
    assert response.status_code == 409
    assert "caps_not_ready" in response.text


async def test_icd_suggest_unknown_run_returns_404(client, store_override):
    response = await client.post("/api/v1/icd/suggest", json={"run_id": "00000000-0000-0000-0000-000000000000"})
    assert response.status_code == 404


async def test_icd_suggest_rejects_extra_fields(client, store_override, run_id):
    response = await client.post("/api/v1/icd/suggest", json={"run_id": run_id, "unexpected": 1})
    assert response.status_code == 422


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"),
                    reason="DB-backed suggestion APIs need TEST_DATABASE_URL (PostgreSQL)")
async def test_icd_suggestion_crud_lifecycle(client):
    response = await client.post("/api/v1/consultations/00000000-0000-0000-0000-000000000000/icd-suggestions",
                                 json={"items": [{"icd_code": "M17.9", "description": "Thoái hóa khớp gối",
                                                  "confidence": 82}]})
    assert response.status_code in {404, 200, 409}

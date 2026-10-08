import json

import pytest
from langchain_core.messages import AIMessage

import src.services.icd_suggest as icd_suggest
from src.schemas.soap import Cap
from src.services.icd_kcb import IcdNotFoundError
from src.services.soap.errors import SoapFailure

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
        key = code.upper()
        if key not in self.known:
            raise IcdNotFoundError(code)
        return self.known[key]


@pytest.fixture
def verify(monkeypatch):
    fake = FakeLookup(["M17.9"])
    monkeypatch.setattr(icd_suggest, "lookup_code", fake)
    return fake


def usable(sample):
    _, caps = sample
    return [Cap.model_validate(c) for c in caps]


def test_ground_links_must_be_real_caps(sample):
    _, caps = sample
    raw = [
        {"code": "m17.9", "rationale": "khớp gối", "cap_ids": ["C1"], "confidence": 90},
        {"code": "I10", "rationale": "huyết áp", "cap_ids": [], "confidence": 80},
        {"code": "ZZZ99", "rationale": "tạo văng", "cap_ids": ["C9"], "confidence": 70},
        {"code": "M25.56", "rationale": "not specified", "cap_ids": ["C1"], "confidence": 60},
    ]
    grounded, demoted = icd_suggest.ground_suggestions(raw, usable(sample))
    assert [item["code"] for item in grounded] == ["M17.9", "M25.56"]
    assert {d["reason"] for d in demoted} == {"not_grounded", "invalid_code_or_rationale"}


def test_ground_normalizes_code_format(sample):
    raw = [{"code": "m17.900", "rationale": "khớp gối", "cap_ids": ["C1"], "confidence": 90}]
    grounded, _ = icd_suggest.ground_suggestions(raw, usable(sample))
    assert grounded[0]["code"] == "M17.90"


def test_ground_uncertain_cap_caps_confidence_at_50(sample):
    _, caps = sample
    grounded, _ = icd_suggest.ground_suggestions(
        [{"code": "M17.9", "rationale": "viêm khớp chưa chắc", "cap_ids": ["C3"], "confidence": 90}],
        usable(sample))
    assert grounded[0]["confidence"] == 50


def test_ground_dedupes_and_caps_at_four(sample):
    _, caps = sample
    raw = [{"code": "M17.9", "rationale": r, "cap_ids": ["C1"], "confidence": 90} for r in ("a", "b", "c")]
    raw += [{"code": f"M{index:02d}.9", "rationale": "x", "cap_ids": ["C2"], "confidence": 80}
            for index in range(1, 11)]
    grounded, _ = icd_suggest.ground_suggestions(raw, usable(sample))
    assert len(grounded) == 4
    assert sum(1 for item in grounded if item["code"] == "M17.9") == 1


def test_parse_suggestions_rejects_garbage():
    with pytest.raises(SoapFailure) as info:
        icd_suggest.parse_suggestions("không phải json")
    assert info.value.code == "invalid_model_output"


def test_parse_suggestions_strips_fences():
    payload = {"suggestions": [{"code": "M17.9", "rationale": "x", "cap_ids": ["C1"], "confidence": 80}],
               "unsure": []}
    parsed = icd_suggest.parse_suggestions("```json\n" + json.dumps(payload) + "\n```")
    assert parsed["suggestions"][0]["code"] == "M17.9"


def test_parse_suggestions_tolerates_missing_keys():
    parsed = icd_suggest.parse_suggestions("{}")
    assert parsed == {"suggestions": [], "unsure": []}


@pytest.mark.asyncio
async def test_verify_filters_unknown_codes(verify):
    grounded = [{"code": "M17.9", "rationale": "x", "cap_ids": ["C1"], "confidence": 80},
                {"code": "ZZZ9", "rationale": "x", "cap_ids": ["C1"], "confidence": 70}]
    suggestions, dropped = await icd_suggest.verify_suggestions(grounded)
    assert [item["code"] for item in suggestions] == ["M17.9"]
    assert suggestions[0]["title"] == "Thoái hóa khớp gối, không xác định"
    assert suggestions[0]["verified"] is True
    assert dropped == [{"code": "ZZZ9", "reason": "not_in_catalog"}]


@pytest.mark.asyncio
async def test_suggest_codes_full_flow(soap_store, run_id, sample, verify):
    llm = FakeLLM([json.dumps({
        "suggestions": [
            {"code": "M17.9", "rationale": "Khớp gối đau và sưng nhẹ khi khám, chưa chắc viêm khớp.",
             "cap_ids": ["C1", "C2"], "confidence": 85},
            {"code": "I10", "rationale": "Huyết áp chưa đo trong run này.", "cap_ids": [],
             "confidence": 20},
        ],
        "unsure": [{"term": "viêm khớp", "reason": "nhận định uncertain"}],
    })])
    result = await icd_suggest.suggest_codes(run_id, None, store=soap_store, llm=llm)
    assert [item["code"] for item in result["suggestions"]] == ["M17.9"]
    assert result["suggestions"][0]["cap_ids"] == ["C1", "C2"]
    assert result["suggestions"][0]["verified"] is True
    reasons = {item["term"] for item in result["unsure"]}
    assert "I10" in reasons and "viêm khớp" in reasons
    assert result["model_metadata"]["provider"] is not None


@pytest.mark.asyncio
async def test_suggest_codes_without_caps_conflicts(soap_store, sample, verify):
    from src.schemas.soap import Transcript

    transcript, _ = sample
    fresh = soap_store.create_run({"input_format": "canonical", "content": transcript},
                                  Transcript.model_validate(transcript), "canonical")
    with pytest.raises(SoapFailure) as info:
        await icd_suggest.suggest_codes(fresh, None, store=soap_store, llm=FakeLLM(["{}"]))
    assert info.value.code == "caps_not_ready"

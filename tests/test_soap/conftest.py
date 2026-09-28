import tempfile
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage

from src.api.soap_routes import get_soap_store
from src.main import app
from src.services.soap.store import SoapStore


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


@pytest.fixture
def sample():
    transcript = {"schema_version": "1.0", "language": "vi", "source_metadata": {}, "turns": [
        {"turn_id": "T1", "speaker": "patient", "text": "Tôi đau gối trái ba ngày."},
        {"turn_id": "T2", "speaker": "clinician", "text": "Khám thấy gối trái sưng nhẹ."},
        {"turn_id": "T3", "speaker": "clinician", "text": "Có thể là viêm khớp."},
        {"turn_id": "T4", "speaker": "clinician", "text": "Nếu còn đau thì tái khám tuần sau."},
    ]}
    caps = {"caps": [
        {"prop_id": "C1", "cap_type": "ChiefComplaint", "canonical_concept": "đau gối trái", "proposition_text": "Đau gối trái ba ngày", "speaker_source": "patient", "temporality": "current", "verification_status": "affirmed", "clinical_status": "active", "evidence": [{"turn_id": "T1", "quote": "đau gối trái ba ngày"}]},
        {"prop_id": "C2", "cap_type": "ExamFinding", "canonical_concept": "sưng gối trái", "proposition_text": "Gối trái sưng nhẹ", "speaker_source": "clinician", "temporality": "current", "verification_status": "affirmed", "clinical_status": "active", "evidence": [{"turn_id": "T2", "quote": "gối trái sưng nhẹ"}]},
        {"prop_id": "C3", "cap_type": "Problem", "canonical_concept": "viêm khớp", "proposition_text": "Có thể viêm khớp", "speaker_source": "clinician", "temporality": "current", "verification_status": "uncertain", "clinical_status": "active", "evidence": [{"turn_id": "T3", "quote": "Có thể là viêm khớp"}]},
        {"prop_id": "C4", "cap_type": "FollowUp", "canonical_concept": "tái khám", "proposition_text": "Nếu còn đau thì tái khám tuần sau", "speaker_source": "clinician", "temporality": "future", "verification_status": "uncertain", "clinical_status": "planned", "evidence": [{"turn_id": "T4", "quote": "Nếu còn đau thì tái khám tuần sau"}]},
    ], "warnings": []}
    soap = {name: {"items": [{"item_id": name + "1", "text": text, "cap_ids": [cap]}], "missing": False}
            for name, text, cap in (("S", "Đau gối trái ba ngày", "C1"), ("O", "Gối trái sưng nhẹ", "C2"), ("A", "Có thể viêm khớp", "C3"), ("P", "Nếu còn đau thì tái khám tuần sau", "C4"))}
    return transcript, caps, soap


@pytest.fixture
def soap_store():
    return SoapStore(Path(tempfile.mkdtemp(prefix="soap-mvp-test-")))


@pytest.fixture
def soap_override(soap_store):
    async def override():
        return soap_store
    app.dependency_overrides[get_soap_store] = override
    yield soap_store
    app.dependency_overrides.pop(get_soap_store, None)

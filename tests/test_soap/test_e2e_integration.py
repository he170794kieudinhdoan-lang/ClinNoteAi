"""Phase 7 E2E & Final Integration Verification Test Suite."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import (
    Cap,
    Evidence,
    SoapDocument,
    Transcript,
    TranscriptTurn,
)
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import parse_soap
from src.services.soap.text_utils import resolve_conservative_evidence_quote
from src.services.soap.validation import check_approval, filter_usable_caps, validate_caps, validate_soap


def make_turn(turn_id: str, speaker: str, text: str) -> TranscriptTurn:
    return TranscriptTurn(
        turn_id=turn_id,
        speaker=speaker,  # type: ignore
        text=text,
        start_ms=0,
        end_ms=1000,
    )


def make_cap(
    prop_id: str,
    cap_type: str,
    canonical_concept: str,
    proposition_text: str,
    speaker_source: str,
    temporality: str = "current",
    verification_status: str = "affirmed",
    clinical_status: str = "active",
    resolution_status: str = "current",
    turn_id: str = "t1",
    quote: str = "sample quote",
) -> Cap:
    return Cap(
        prop_id=prop_id,
        cap_type=cap_type,  # type: ignore
        canonical_concept=canonical_concept,
        proposition_text=proposition_text,
        speaker_source=speaker_source,  # type: ignore
        temporality=temporality,  # type: ignore
        verification_status=verification_status,  # type: ignore
        clinical_status=clinical_status,  # type: ignore
        resolution_status=resolution_status,  # type: ignore
        evidence=[Evidence(turn_id=turn_id, quote=quote)],
    )


def make_soap_dict(
    s_items: list[dict] | None = None,
    o_items: list[dict] | None = None,
    a_items: list[dict] | None = None,
    p_items: list[dict] | None = None,
) -> dict:
    s_list = s_items or []
    o_list = o_items or []
    a_list = a_items or []
    p_list = p_items or []
    return {
        "S": {"items": s_list, "missing": len(s_list) == 0},
        "O": {"items": o_list, "missing": len(o_list) == 0},
        "A": {"items": a_list, "missing": len(a_list) == 0},
        "P": {"items": p_list, "missing": len(p_list) == 0},
    }


def make_mock_llm(responses: list[dict]):
    mocks = []
    for resp in responses:
        m = MagicMock(content=json.dumps(resp))
        m.response_metadata = {}
        mocks.append(m)
    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(side_effect=mocks if len(mocks) > 1 else None, return_value=mocks[0] if len(mocks) == 1 else None)
    return llm


# E2E SCENARIO 1: Happy Path
@pytest.mark.asyncio
async def test_e2e_scenario_1_happy_path():
    turns = [
        make_turn("t1", "patient", "Em đau đầu từ sáng."),
        make_turn("t2", "clinician", "Khám thấy nhiệt độ 37.5 độ C."),
        make_turn("t3", "clinician", "Tôi đánh giá chưa ghi nhận dấu hiệu nguy hiểm."),
        make_turn("t4", "clinician", "Cho uống paracetamol 500 mg và tái khám sau 3 ngày."),
    ]
    transcript = Transcript(turns=turns)

    caps = [
        make_cap("C1", "ChiefComplaint", "Đau đầu", "Đau đầu từ sáng", "patient", turn_id="t1", quote="đau đầu từ sáng"),
        make_cap("C2", "ExamFinding", "Nhiệt độ", "Nhiệt độ 37.5 độ C", "clinician", turn_id="t2", quote="nhiệt độ 37.5 độ"),
        make_cap("C3", "Problem", "Dấu hiệu nguy hiểm", "Chưa ghi nhận dấu hiệu nguy hiểm", "clinician", turn_id="t3", quote="chưa ghi nhận dấu hiệu nguy hiểm"),
        make_cap("C4", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician", turn_id="t4", quote="paracetamol 500 mg"),
    ]

    # Validate CAPs against transcript evidence
    val_caps, warnings = validate_caps(caps, transcript)
    assert len(val_caps) == 4

    # Render SOAP
    soap_json = make_soap_dict(
        s_items=[{"item_id": "raw1", "text": "Bệnh nhân đau đầu từ sáng", "cap_ids": ["C1"]}],
        o_items=[{"item_id": "raw2", "text": "Nhiệt độ 37.5 độ C", "cap_ids": ["C2"]}],
        a_items=[{"item_id": "raw3", "text": "Chưa ghi nhận dấu hiệu nguy hiểm", "cap_ids": ["C3"]}],
        p_items=[{"item_id": "raw4", "text": "Paracetamol 500 mg", "cap_ids": ["C4"]}],
    )

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": transcript.model_dump(mode="json"),
        "caps": [c.model_dump(mode="json") for c in val_caps],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    llm = make_mock_llm([soap_json])
    app = create_soap_pipeline(store, llm)

    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    draft_soap = SoapDocument.model_validate(state["soap_draft"])

    # Deterministic item IDs check
    assert draft_soap.S.items[0].item_id == "S1"
    assert draft_soap.O.items[0].item_id == "O1"
    assert draft_soap.A.items[0].item_id == "A1"
    assert draft_soap.P.items[0].item_id == "P1"

    # Safety checks pass
    assert draft_soap.S.items[0].support_status == "pending"
    assert draft_soap.O.items[0].support_status == "pending"
    assert draft_soap.A.items[0].support_status == "pending"
    assert draft_soap.P.items[0].support_status == "pending"

    # Traceability chain check
    assert draft_soap.S.items[0].cap_ids == ["C1"]
    assert val_caps[0].evidence[0].turn_id == "t1"
    assert val_caps[0].evidence[0].quote in turns[0].text


# E2E SCENARIO 2: Superseded CAP Protection
def test_e2e_scenario_2_superseded_cap():
    c1 = make_cap("C1", "ChiefComplaint", "Đau đầu", "Đau nhẹ", "patient", resolution_status="superseded")
    c2 = make_cap("C2", "ChiefComplaint", "Đau đầu", "Đau nặng", "patient", resolution_status="current")

    usable = filter_usable_caps([c1, c2])
    assert len(usable) == 1
    assert usable[0].prop_id == "C2"

    # If LLM attempts to link C1, validate_soap rejects
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "raw1", "text": "Đau nhẹ", "cap_ids": ["C1"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c1, c2], generated=True)
    assert exc_info.value.code == "invalid_cap_link"


# E2E SCENARIO 3: Ambiguous Evidence Fail-Safe
def test_e2e_scenario_3_ambiguous_evidence():
    turn = make_turn("t1", "patient", "Đau đầu rất nhiều. Đau đầu rất nhiều.")
    res, status = resolve_conservative_evidence_quote("Đau đầu", turn.text)
    assert res is None  # >1 span match -> None
    assert status == "ambiguous_quote"

    cap = make_cap("C1", "ChiefComplaint", "Đau đầu", "Đau đầu", "patient", turn_id="t1", quote="Đau đầu")
    transcript = Transcript(turns=[turn])
    with pytest.raises(SoapFailure) as exc_info:
        validate_caps([cap], transcript)
    assert exc_info.value.code == "invalid_quote"


# E2E SCENARIO 4: Wrong Section Repair
@pytest.mark.asyncio
async def test_e2e_scenario_4_wrong_section_repair():
    c1 = make_cap("C1", "Problem", "Viêm họng", "Nghi ngờ viêm họng cấp", "clinician")
    # First render puts clinician problem in Section O (invalid: objective_source)
    wrong_soap = make_soap_dict(o_items=[{"item_id": "O1", "text": "Nghi ngờ viêm họng cấp", "cap_ids": ["C1"]}])
    # Repaired render puts clinician problem in Section A (valid)
    repaired_soap = make_soap_dict(a_items=[{"item_id": "A1", "text": "Nghi ngờ viêm họng cấp", "cap_ids": ["C1"]}])

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[make_turn("t1", "clinician", "Nghi ngờ viêm họng cấp")]).model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    llm = make_mock_llm([wrong_soap, repaired_soap])
    app = create_soap_pipeline(store, llm)

    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    assert llm.ainvoke.call_count == 2
    draft_soap = SoapDocument.model_validate(state["soap_draft"])
    assert len(draft_soap.A.items) == 1
    assert draft_soap.A.items[0].item_id == "A1"


# E2E SCENARIO 5: Missing CAP Link Repair
@pytest.mark.asyncio
async def test_e2e_scenario_5_missing_cap_link_repair():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician")
    missing_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": []}])
    repaired_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": ["C1"]}])

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[make_turn("t1", "clinician", "Paracetamol 500mg")]).model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    llm = make_mock_llm([missing_soap, repaired_soap])
    app = create_soap_pipeline(store, llm)

    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    assert llm.ainvoke.call_count == 2
    draft_soap = SoapDocument.model_validate(state["soap_draft"])
    assert draft_soap.P.items[0].cap_ids == ["C1"]


# E2E SCENARIO 6: Dosage Mismatch Safety
def test_e2e_scenario_6_dosage_mismatch_safety():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 1000 mg", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.P.items[0].support_status == "unsupported"


# E2E SCENARIO 7: Medication Mismatch Safety
def test_e2e_scenario_7_medication_mismatch_safety():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(p_items=[{"item_id": "P1", "text": "Ibuprofen 500 mg", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.P.items[0].support_status == "unsupported"


# E2E SCENARIO 8: Negation Contradiction Safety
def test_e2e_scenario_8_negation_contradiction_safety():
    c1 = make_cap("C1", "Problem", "Dị ứng Penicillin", "Không dị ứng penicillin", "patient", verification_status="negated")
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "S1", "text": "Dị ứng penicillin", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.S.items[0].support_status == "unsupported"


# E2E SCENARIO 9: Temporality Contradiction Safety
def test_e2e_scenario_9_temporality_contradiction_safety():
    c1 = make_cap("C1", "ProblemHistory", "Đau dạ dày", "Đã từng đau dạ dày năm ngoái", "patient", temporality="past")
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "S1", "text": "Hiện tại đau dạ dày cấp", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.S.items[0].support_status == "unsupported"


# E2E SCENARIO 10: Unsupported Diagnosis Safety
def test_e2e_scenario_10_unsupported_diagnosis_safety():
    c1 = make_cap("C1", "Problem", "Đau đầu", "Bệnh nhân đau đầu", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(a_items=[{"item_id": "A1", "text": "Chẩn đoán viêm màng não", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.A.items[0].support_status == "unsupported"


# E2E SCENARIO 11: Unsupported Treatment Safety
def test_e2e_scenario_11_unsupported_treatment_safety():
    c1 = make_cap("C1", "MedicationRequest", "Nghỉ ngơi", "Khuyên nghỉ ngơi", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(p_items=[{"item_id": "P1", "text": "Cho uống amoxicillin 500mg", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.P.items[0].support_status == "unsupported"


# E2E SCENARIO 12: Repair Limit Enforcement
@pytest.mark.asyncio
async def test_e2e_scenario_12_repair_limit_enforcement():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician")
    invalid_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": []}])

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[make_turn("t1", "clinician", "Paracetamol 500mg")]).model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()

    llm = make_mock_llm([invalid_soap, invalid_soap])
    app = create_soap_pipeline(store, llm)

    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    assert state.get("revision") is not None
    assert any("Coverage warning" in w for w in state.get("cap_warnings", []))
    assert llm.ainvoke.call_count == 2  # Exactly 2 calls (render + 1 repair limit)


# APPROVAL SAFETY TEST
def test_approval_safety_unsupported_item_rejected():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 1000mg", "cap_ids": ["C1"]}])))
    validated = validate_soap(soap, [c1], generated=True)

    assert validated.P.items[0].support_status == "unsupported"

    # Attempt to approve without review/support
    with pytest.raises(SoapFailure) as exc_info:
        check_approval(validated, [], {})
    assert exc_info.value.code in {"item_not_reviewed", "unsupported_item"}

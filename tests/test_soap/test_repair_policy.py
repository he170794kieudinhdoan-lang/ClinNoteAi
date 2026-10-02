"""Phase 6 Unit Tests: Strict LLM Repair Policy & LangGraph Orchestration."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.renderer import parse_soap
from src.services.soap.repair_policy import is_repairable_error
from src.services.soap.validation import filter_usable_caps, validate_soap


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


# TEST 1: wrong_section -> allowed to route to LLM repair
def test_wrong_section_repairable():
    assert is_repairable_error("subjective_source", repair_count=0) is True
    assert is_repairable_error("assessment_source", repair_count=0) is True
    assert is_repairable_error("objective_source", repair_count=0) is True
    assert is_repairable_error("plan_source", repair_count=0) is True


# TEST 2: missing_cap_link -> allowed to route to LLM repair
def test_missing_cap_link_repairable():
    assert is_repairable_error("missing_cap_link", repair_count=0) is True


# TEST 3: duplicate_item_id -> backend deterministic handling, NO LLM repair
def test_duplicate_item_id_not_repairable():
    assert is_repairable_error("duplicate_item_id", repair_count=0) is False


# TEST 4: invalid_cap_link -> structural linking error, allowed to route to LLM repair
# (safety still holds: repair only receives usable CAPs and validate_soap re-runs after repair)
def test_invalid_cap_link_repairable():
    assert is_repairable_error("invalid_cap_link", repair_count=0) is True


# TEST 5: ambiguous_quote -> NO LLM repair
def test_ambiguous_quote_not_repairable():
    assert is_repairable_error("ambiguous_quote", repair_count=0) is False


# TEST 6: dosage_mismatch -> NO LLM repair
def test_dosage_mismatch_not_repairable():
    assert is_repairable_error("dosage_mismatch", repair_count=0) is False


# TEST 7: medication_mismatch -> NO LLM repair
def test_medication_mismatch_not_repairable():
    assert is_repairable_error("medication_mismatch", repair_count=0) is False


# TEST 8: negation_contradiction -> NO LLM repair
def test_negation_contradiction_not_repairable():
    assert is_repairable_error("negation_contradiction", repair_count=0) is False


# TEST 9: temporality_contradiction -> NO LLM repair
def test_temporality_contradiction_not_repairable():
    assert is_repairable_error("temporality_contradiction", repair_count=0) is False


# TEST 10: unsupported_diagnosis -> NO LLM repair
def test_unsupported_diagnosis_not_repairable():
    assert is_repairable_error("unsupported_diagnosis", repair_count=0) is False


# TEST 11: unsupported_treatment -> NO LLM repair
def test_unsupported_treatment_not_repairable():
    assert is_repairable_error("unsupported_treatment", repair_count=0) is False


# TEST 12: numbers_mismatch -> NO LLM repair
def test_numbers_mismatch_not_repairable():
    assert is_repairable_error("numbers_mismatch", repair_count=0) is False


# TEST 13: units_mismatch -> NO LLM repair
def test_units_mismatch_not_repairable():
    assert is_repairable_error("units_mismatch", repair_count=0) is False


# TEST 14: vital sign mismatch -> NO LLM repair
def test_vital_sign_mismatch_not_repairable():
    for code in ["bp_mismatch", "heart_rate_mismatch", "temperature_mismatch", "spo2_mismatch"]:
        assert is_repairable_error(code, repair_count=0) is False


# TEST 15: lab value mismatch -> NO LLM repair
def test_lab_value_mismatch_not_repairable():
    assert is_repairable_error("lab_value_mismatch", repair_count=0) is False


# TEST 16 & 17: Repair success -> re-runs structural & safety validation
@pytest.mark.asyncio
async def test_repair_success_reruns_structural_and_safety_validation():
    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[make_turn("t1", "clinician", "Paracetamol 500mg")]).model_dump(mode="json"),
        "caps": [make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician", quote="Paracetamol 500mg").model_dump(mode="json")],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    # First render returns missing cap link
    invalid_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": []}])
    valid_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": ["C1"]}])

    res1 = MagicMock(content=json.dumps(invalid_soap))
    res1.response_metadata = {}
    res2 = MagicMock(content=json.dumps(valid_soap))
    res2.response_metadata = {}

    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(side_effect=[res1, res2])

    app = create_soap_pipeline(store, llm)
    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    if state.get("error"):
        print("DEBUG STATE ERROR:", state["error"])

    assert state.get("error") is None
    assert "revision" in state
    assert llm.ainvoke.call_count == 2  # Render once + Repair once


# TEST 18: Repair still invalid -> fail-safe, no infinite retry
@pytest.mark.asyncio
async def test_repair_still_invalid_failsafe():
    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[make_turn("t1", "clinician", "Paracetamol 500mg")]).model_dump(mode="json"),
        "caps": [make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician", quote="Paracetamol 500mg").model_dump(mode="json")],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()

    # Both render and repair return invalid missing cap link
    invalid_soap = make_soap_dict(p_items=[{"item_id": "P1", "text": "Paracetamol 500mg", "cap_ids": []}])

    res = MagicMock(content=json.dumps(invalid_soap))
    res.response_metadata = {}

    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(return_value=res)

    app = create_soap_pipeline(store, llm)
    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "00000000-0000-0000-0000-000000000001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is not None
    assert state["error"]["code"] == "missing_cap_link"
    assert llm.ainvoke.call_count == 2  # Exactly 2 calls (render + 1 repair), no infinite retry


# TEST 19: Repair count exceeds limit -> fail-safe
def test_repair_count_exceeds_limit():
    assert is_repairable_error("missing_cap_link", repair_count=1) is False
    assert is_repairable_error("subjective_source", repair_count=1) is False


# TEST 20: Repair cannot link superseded CAP
def test_repair_cannot_link_superseded_cap():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician", resolution_status="superseded")
    c2 = make_cap("C2", "MedicationRequest", "Paracetamol", "Paracetamol 1000mg", "clinician", resolution_status="current")

    usable = filter_usable_caps([c1, c2])
    assert len(usable) == 1
    assert usable[0].prop_id == "C2"

    item = SoapItem(item_id="P1", text="Paracetamol 500mg", cap_ids=["C1"])
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[item], missing=False),
    )

    with pytest.raises(Exception) as exc_info:
        validate_soap(soap, [c1, c2], generated=True)
    assert "invalid_cap_link" in str(exc_info.value) or exc_info.value.code == "invalid_cap_link"


# TEST 21: Repair cannot create new CAPs
def test_repair_cannot_create_new_caps():
    c1 = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500mg", "clinician")
    item = SoapItem(item_id="P1", text="Paracetamol 500mg", cap_ids=["C999"])  # Non-existent CAP
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[item], missing=False),
    )

    with pytest.raises(Exception) as exc_info:
        validate_soap(soap, [c1], generated=True)
    # Non-existent CAP IDs are kept by normalize_cap_links and rejected by validate_soap
    assert exc_info.value.code == "invalid_cap_link"


# TEST 22: Deterministic item_id still assigned after repair
def test_deterministic_item_id_assigned_after_repair():
    raw_soap_json = json.dumps(make_soap_dict(
        s_items=[{"item_id": "custom_s_id", "text": "Bệnh nhân đau đầu", "cap_ids": ["C1"]}],
        p_items=[{"item_id": "random_p_id", "text": "Kê đơn Paracetamol", "cap_ids": ["C2"]}],
    ))
    parsed = parse_soap(raw_soap_json)
    assert parsed.S.items[0].item_id == "S1"
    assert parsed.P.items[0].item_id == "P1"


# TEST 23: Structural & safety validation consistency
def test_validation_consistency():
    cap = make_cap("C1", "ExamFinding", "HA", "HA 120/80 mmHg", "clinician")
    item = SoapItem(item_id="O1", text="HA 120/80 mmHg", cap_ids=["C1"])
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[item], missing=False),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].item_id == "O1"
    assert validated.O.items[0].support_status == "pending"

"""Comprehensive test suite for SOAP Pipeline Hardening (EC-01 to EC-06 invariants)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Evidence, SoapDocument, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import compute_section_candidates, parse_soap
from src.services.soap.repair_policy import is_repairable_error
from src.services.soap.semantic_validator import check_item_safety
from src.services.soap.validation import filter_usable_caps, validate_soap


def make_cap(
    prop_id: str,
    cap_type: str,
    canonical_concept: str,
    proposition_text: str,
    speaker_source: str,
    temporality: str = "current",
    verification_status: str = "affirmed",
    clinical_status: str = "active",
    turn_id: str = "T1",
    quote: str = "sample quote",
    resolution_status: str = "current",
    supersedes: list[str] | None = None,
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
        evidence=[Evidence(turn_id=turn_id, quote=quote)],
        resolution_status=resolution_status,  # type: ignore
        supersedes=supersedes or [],
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


# ============================================================
# 1. CANDIDATE BOUNDARY VIOLATION TESTS (EC-02)
# ============================================================

def test_candidate_boundary_violation_s_section_linking_objective_cap():
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient")
    c2 = make_cap("C2", "ExamFinding", "sưng khớp", "Khớp sưng nhẹ", "clinician")
    caps = [c1, c2]

    # Item in S links C2 which belongs to O candidates
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "S1", "text": "Khớp sưng nhẹ", "cap_ids": ["C2"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code in {"subjective_source", "candidate_boundary_violation"}


def test_candidate_boundary_violation_o_section_linking_subjective_cap():
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient")
    c2 = make_cap("C2", "ExamFinding", "sưng khớp", "Khớp sưng nhẹ", "clinician")
    caps = [c1, c2]

    # Item in O links C1 which belongs to S candidates
    soap = parse_soap(json.dumps(make_soap_dict(o_items=[{"item_id": "O1", "text": "Đau khớp gối", "cap_ids": ["C1"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code in {"objective_source", "candidate_boundary_violation"}


def test_candidate_boundary_violation_a_section_linking_plan_cap():
    c1 = make_cap("C1", "Problem", "thoái hóa khớp", "Nghi ngờ thoái hóa khớp", "clinician")
    c2 = make_cap("C2", "Order", "chụp X-quang", "Chụp X-quang khớp gối", "clinician", temporality="future", clinical_status="planned")
    caps = [c1, c2]

    # Item in A links C2 which belongs to P candidates
    soap = parse_soap(json.dumps(make_soap_dict(a_items=[{"item_id": "A1", "text": "Chụp X-quang khớp gối", "cap_ids": ["C2"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code in {"assessment_source", "candidate_boundary_violation"}


def test_candidate_boundary_violation_repairable_in_policy():
    assert is_repairable_error("candidate_boundary_violation", repair_count=0) is True
    assert is_repairable_error("candidate_boundary_violation", repair_count=1) is False
    assert is_repairable_error("subjective_source", repair_count=0) is True
    assert is_repairable_error("objective_source", repair_count=0) is True
    assert is_repairable_error("assessment_source", repair_count=0) is True
    assert is_repairable_error("plan_source", repair_count=0) is True


# ============================================================
# 2. SOURCE OF FACT SEMANTICS MATRIX TESTS (EC-01)
# ============================================================

def test_source_of_fact_matrix_clinician_recap_versus_observation():
    # Case D: Clinician recaps patient symptom -> patient source
    c_recap = make_cap("C1", "ChiefComplaint", "mệt mỏi", "Mệt mỏi mức độ vừa", "patient", turn_id="T13", quote="mệt mỏi mức độ vừa")

    # Case E: Clinician direct observation -> clinician source
    c_obs = make_cap("C2", "ExamFinding", "da nhợt", "Da nhợt nhạt", "clinician", turn_id="T14", quote="da nhợt nhạt")

    caps = [c_recap, c_obs]
    cands = compute_section_candidates(caps)

    assert cands["S"] == ["C1"]
    assert cands["O"] == ["C2"]

    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Mệt mỏi mức độ vừa", "cap_ids": ["C1"]}],
        o_items=[{"item_id": "O1", "text": "Da nhợt nhạt", "cap_ids": ["C2"]}],
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.S.items) == 1
    assert len(validated.O.items) == 1


def test_source_of_fact_patient_medication_statement_vs_clinician_request():
    # Case K: Patient current medication statement -> patient source
    c_med_stmt = make_cap("C1", "MedicationStatement", "Amlodipine", "Đang uống Amlodipine 5mg", "patient")

    # Case L: Clinician prescribed medication request -> clinician source
    c_med_req = make_cap("C2", "MedicationRequest", "Paracetamol", "Kê đơn Paracetamol 500mg", "clinician", temporality="future", clinical_status="planned")

    caps = [c_med_stmt, c_med_req]
    cands = compute_section_candidates(caps)

    assert cands["S"] == ["C1"]
    assert cands["P"] == ["C2"]


def test_source_of_fact_patient_denial_and_uncertainty():
    # Case M: Patient denial -> patient source, negated
    c_denial = make_cap("C1", "ChiefComplaint", "sốt", "Không bị sốt", "patient", verification_status="negated")

    # Case N: Patient uncertainty -> patient source, uncertain
    c_uncert = make_cap("C2", "ChiefComplaint", "thời gian đau", "Không nhớ rõ thời gian bắt đầu đau", "patient", verification_status="uncertain")

    caps = [c_denial, c_uncert]
    cands = compute_section_candidates(caps)

    assert set(cands["S"]) == {"C1", "C2"}


# ============================================================
# 3. QUARANTINE & USABLE CAP INVARIANTS (EC-03 & EC-06)
# ============================================================

def test_quarantine_invariants_filter_usable_caps():
    c_active = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp", "patient", resolution_status="current")
    c_quarantined = make_cap("C2", "ExamFinding", "sưng", "Sưng", "clinician", resolution_status="needs_review")
    c_superseded = make_cap("C3", "ChiefComplaint", "đau", "Đau nhẹ", "patient", resolution_status="superseded")

    usable = filter_usable_caps([c_active, c_quarantined, c_superseded])
    assert usable == [c_active]


def test_quarantined_cap_referencing_in_soap_fails_validation():
    c_active = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp", "patient", resolution_status="current")
    c_quarantined = make_cap("C2", "ChiefComplaint", "đau khớp", "Đau khớp nhẹ", "patient", resolution_status="needs_review")
    caps = [c_active, c_quarantined]

    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "S1", "text": "Đau khớp", "cap_ids": ["C2"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code == "invalid_cap_link"


# ============================================================
# 4. SEMANTIC PRESERVATION & GROUNDING INVARIANTS (INV-6)
# ============================================================

def test_semantic_preservation_negation_contradiction_detection():
    c_negated = make_cap("C1", "ChiefComplaint", "sốt", "Không bị sốt", "patient", verification_status="negated")

    # SOAP item text affirms fever ("Có sốt nhẹ") while linked to negated CAP
    item_dict = {"item_id": "S1", "text": "Có sốt nhẹ", "cap_ids": ["C1"]}
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[item_dict])))

    violations = check_item_safety(soap.S.items[0], "S", [c_negated])
    v_codes = [v.code for v in violations]
    assert "negation_contradiction" in v_codes

    validated = validate_soap(soap, [c_negated], generated=True)
    assert validated.S.items[0].support_status == "unsupported"


def test_semantic_preservation_numbers_units_mismatch():
    c_bp = make_cap("C1", "ExamFinding", "huyết áp", "Huyết áp 120/80 mmHg", "clinician")

    # SOAP item text alters BP numbers to 140/90
    item_dict = {"item_id": "O1", "text": "Huyết áp 140/90 mmHg", "cap_ids": ["C1"]}
    soap = parse_soap(json.dumps(make_soap_dict(o_items=[item_dict])))

    violations = check_item_safety(soap.O.items[0], "O", [c_bp])
    v_codes = [v.code for v in violations]
    assert "bp_mismatch" in v_codes

    validated = validate_soap(soap, [c_bp], generated=True)
    assert validated.O.items[0].support_status == "unsupported"


# ============================================================
# 5. MULTI-TURN E2E CLINICAL DIALOGUE INTEGRATION
# ============================================================

@pytest.mark.asyncio
async def test_e2e_multi_turn_clinical_dialogue_pipeline():
    transcript = Transcript(turns=[
        TranscriptTurn(turn_id="T1", speaker="clinician", text="Bác bị sao mà đi khám?"),
        TranscriptTurn(turn_id="T2", speaker="patient", text="Tôi bị đau gối trái 2 tuần nay, vận động thì đau tăng."),
        TranscriptTurn(turn_id="T3", speaker="clinician", text="Để tôi khám. Khớp gối trái sưng nhẹ, ấn đau khe khớp."),
        TranscriptTurn(turn_id="T4", speaker="clinician", text="Tôi nghĩ bác bị đợt bùng phát thoái hóa khớp gối."),
        TranscriptTurn(turn_id="T5", speaker="clinician", text="Tôi sẽ cho bác chụp X-quang khớp gối và dùng Paracetamol."),
    ])

    caps = [
        make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối trái 2 tuần nay", "patient", turn_id="T2", quote="đau gối trái 2 tuần nay"),
        make_cap("C2", "ProblemHistory", "đau tăng khi vận động", "Đau tăng khi vận động", "patient", turn_id="T2", quote="vận động thì đau tăng"),
        make_cap("C3", "ExamFinding", "sưng khớp gối", "Khớp gối trái sưng nhẹ", "clinician", turn_id="T3", quote="Khớp gối trái sưng nhẹ"),
        make_cap("C4", "ExamFinding", "ấn đau khe khớp", "Ấn đau khe khớp gối", "clinician", turn_id="T3", quote="ấn đau khe khớp"),
        make_cap("C5", "Problem", "thoái hóa khớp gối", "Nghi ngờ đợt bùng phát thoái hóa khớp gối", "clinician", verification_status="uncertain", turn_id="T4", quote="đợt bùng phát thoái hóa khớp gối"),
        make_cap("C6", "Order", "chụp X-quang", "Chụp X-quang khớp gối", "clinician", temporality="future", clinical_status="planned", turn_id="T5", quote="chụp X-quang khớp gối"),
        make_cap("C7", "MedicationRequest", "Paracetamol", "Kê đơn Paracetamol", "clinician", temporality="future", clinical_status="planned", turn_id="T5", quote="dùng Paracetamol"),
    ]

    cands = compute_section_candidates(caps)
    assert set(cands["S"]) == {"C1", "C2"}
    assert set(cands["O"]) == {"C3", "C4"}
    assert cands["A"] == ["C5"]
    assert set(cands["P"]) == {"C6", "C7"}

    rendered_soap_json = {
        "S": {"items": [{"item_id": "S1", "text": "Đau gối trái 2 tuần nay, đau tăng khi vận động", "cap_ids": ["C1", "C2"]}], "missing": False},
        "O": {"items": [{"item_id": "O1", "text": "Khớp gối trái sưng nhẹ, ấn đau khe khớp", "cap_ids": ["C3", "C4"]}], "missing": False},
        "A": {"items": [{"item_id": "A1", "text": "Nghi ngờ đợt bùng phát thoái hóa khớp gối", "cap_ids": ["C5"]}], "missing": False},
        "P": {"items": [
            {"item_id": "P1", "text": "Chụp X-quang khớp gối", "cap_ids": ["C6"]},
            {"item_id": "P2", "text": "Dùng Paracetamol", "cap_ids": ["C7"]},
        ], "missing": False},
    }

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": transcript.model_dump(mode="json"),
        "caps": [c.model_dump(mode="json") for c in caps],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    res = MagicMock(content=json.dumps(rendered_soap_json))
    res.response_metadata = {}
    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(return_value=res)

    app = create_soap_pipeline(store, llm)
    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "e2e-test-run-001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    draft_soap = SoapDocument.model_validate(state["soap_draft"])
    assert len(draft_soap.S.items) == 1
    assert len(draft_soap.O.items) == 1
    assert len(draft_soap.A.items) == 1
    assert len(draft_soap.P.items) == 2

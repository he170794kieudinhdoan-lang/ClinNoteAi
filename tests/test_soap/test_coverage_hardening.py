"""Comprehensive Test Suite for SOAP Coverage Hardening (Requirements 1-40)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Evidence, SoapDocument, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import compute_section_candidates, parse_soap
from src.services.soap.repair_policy import is_repairable_error
from src.services.soap.validation import check_candidate_coverage, filter_usable_caps, validate_and_partition_caps, validate_soap


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
# SUBJECTIVE COVERAGE TESTS (1-11)
# ============================================================

def test_subjective_coverage_complaint_duration_severity():
    c1 = make_cap("C1", "ChiefComplaint", "đau vai", "Đau vai phải", "patient")
    c2 = make_cap("C2", "ProblemHistory", "thời gian đau", "Đau kéo dài 3 tuần", "patient")
    c3 = make_cap("C3", "ProblemHistory", "mức độ đau", "Đau mức độ nặng", "patient")

    caps = [c1, c2, c3]
    cands = compute_section_candidates(caps)
    assert set(cands["S"]) == {"C1", "C2", "C3"}

    # Grouped into single Subjective item
    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Đau vai phải mức độ nặng kéo dài 3 tuần", "cap_ids": ["C1", "C2", "C3"]}]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.S.items) == 1
    assert set(validated.S.items[0].cap_ids) == {"C1", "C2", "C3"}


def test_subjective_coverage_aggravating_and_relieving_factors():
    c1 = make_cap("C1", "ChiefComplaint", "đau thắt lưng", "Đau thắt lưng", "patient")
    c2 = make_cap("C2", "ProblemHistory", "yếu tố tăng", "Đau tăng khi cúi và mang vật nặng", "patient")
    c3 = make_cap("C3", "ProblemHistory", "yếu tố giảm", "Nghỉ ngơi thì giảm đau", "patient")

    caps = [c1, c2, c3]
    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Đau thắt lưng, đau tăng khi cúi hoặc mang vật nặng, nghỉ ngơi giúp giảm đau", "cap_ids": ["C1", "C2", "C3"]}]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.S.items) == 1


def test_subjective_coverage_sleep_and_functional_impact():
    c1 = make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối trái", "patient")
    c2 = make_cap("C2", "ProblemHistory", "ảnh hưởng giấc ngủ", "Đau gây mất ngủ hàng đêm", "patient")
    c3 = make_cap("C3", "ProblemHistory", "hạn chế vận động", "Khó khăn khi đi lại và leo cầu thang", "patient")

    caps = [c1, c2, c3]
    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Đau gối trái gây mất ngủ hàng đêm, hạn chế đi lại và leo cầu thang", "cap_ids": ["C1", "C2", "C3"]}]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.S.items) == 1


def test_subjective_coverage_relevant_history_denial_uncertainty():
    c1 = make_cap("C1", "ProblemHistory", "tiền sử tăng huyết áp", "Tiền sử tăng huyết áp 5 năm", "patient")
    c2 = make_cap("C2", "ChiefComplaint", "sốt", "Không bị sốt", "patient", verification_status="negated")
    c3 = make_cap("C3", "ChiefComplaint", "thời gian bắt đầu", "Không nhớ rõ ngày bắt đầu đau", "patient", verification_status="uncertain")

    caps = [c1, c2, c3]
    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[
            {"item_id": "S1", "text": "Tiền sử tăng huyết áp 5 năm", "cap_ids": ["C1"]},
            {"item_id": "S2", "text": "Không bị sốt, không nhớ rõ ngày bắt đầu đau", "cap_ids": ["C2", "C3"]},
        ]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.S.items) == 2


# ============================================================
# OBJECTIVE COVERAGE TESTS (12-22)
# ============================================================

def test_objective_coverage_vital_signs_preservation():
    c_bp = make_cap("C1", "ExamFinding", "huyết áp", "Huyết áp 120/80 mmHg", "clinician")
    c_hr = make_cap("C2", "ExamFinding", "mạch", "Mạch 75 lần/phút", "clinician")
    c_rr = make_cap("C3", "ExamFinding", "nhịp thở", "Nhịp thở 16 lần/phút", "clinician")
    c_temp = make_cap("C4", "ExamFinding", "nhiệt độ", "Nhiệt độ 36.8°C", "clinician")
    c_spo2 = make_cap("C5", "ExamFinding", "SpO2", "SpO2 98%", "clinician")

    caps = [c_bp, c_hr, c_rr, c_temp, c_spo2]
    cands = compute_section_candidates(caps)
    assert len(cands["O"]) == 5

    soap = parse_soap(json.dumps(make_soap_dict(
        o_items=[{"item_id": "O1", "text": "Sinh hiệu: HA 120/80 mmHg, Mạch 75 lần/phút, Nhịp thở 16 lần/phút, Thân nhiệt 36.8°C, SpO2 98%", "cap_ids": ["C1", "C2", "C3", "C4", "C5"]}]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.O.items) == 1


def test_objective_coverage_inspection_palpation_rom_maneuvers_test_result():
    c1 = make_cap("C1", "ExamFinding", "sưng khớp", "Khớp gối trái sưng nề nhẹ", "clinician")
    c2 = make_cap("C2", "ExamFinding", "ấn đau", "Ấn đau khe khớp gối trong", "clinician")
    c3 = make_cap("C3", "ExamFinding", "biên độ vận động", "Hạn chế gập duỗi gối do đau", "clinician")
    c4 = make_cap("C4", "ExamFinding", "McMurray", "Nghiệm pháp McMurray dương tính", "clinician")
    c5 = make_cap("C5", "ExamFinding", "Lachman", "Nghiệm pháp Lachman âm tính", "clinician", verification_status="negated")
    c6 = make_cap("C6", "TestResult", "X-quang", "X-quang hẹp khe khớp nhẹ", "clinician")

    caps = [c1, c2, c3, c4, c5, c6]
    soap = parse_soap(json.dumps(make_soap_dict(
        o_items=[
            {"item_id": "O1", "text": "Khớp gối trái sưng nề nhẹ, ấn đau khe khớp trong, hạn chế gập duỗi do đau", "cap_ids": ["C1", "C2", "C3"]},
            {"item_id": "O2", "text": "McMurray (+), Lachman (-)", "cap_ids": ["C4", "C5"]},
            {"item_id": "O3", "text": "X-quang: Hẹp khe khớp nhẹ", "cap_ids": ["C6"]},
        ]
    )))
    validated = validate_soap(soap, caps, generated=True)
    assert len(validated.O.items) == 3


# ============================================================
# RENDERER COVERAGE & OMISSION TESTS (23-30)
# ============================================================

def test_renderer_omission_of_meaningful_candidate_cap_fails():
    c1 = make_cap("C1", "ChiefComplaint", "đau vai", "Đau vai", "patient")
    c2 = make_cap("C2", "ProblemHistory", "mất ngủ", "Đau gây mất ngủ", "patient")
    caps = [c1, c2]

    # SOAP links C1 but omits C2 entirely
    soap = parse_soap(json.dumps(make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Đau vai", "cap_ids": ["C1"]}]
    )))

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code == "candidate_coverage_violation"


def test_candidate_coverage_violation_repairable_policy():
    assert is_repairable_error("candidate_coverage_violation", repair_count=0) is True
    assert is_repairable_error("candidate_coverage_violation", repair_count=1) is False


# ============================================================
# QUARANTINE NORMALIZATION TESTS (31-36)
# ============================================================

def test_quarantine_normalization_whitespace_case_punctuation():
    turn = TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau khớp gối kéo dài 3 tuần nay.")
    transcript = Transcript(turns=[turn])

    # Quote with slight whitespace / case / trailing punct variation
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient", turn_id="T1", quote="ĐAU KHỚP GỐI KÉO DÀI 3 TUẦN NAY")
    usable, quarantined, warnings = validate_and_partition_caps([c1], transcript)

    assert len(usable) == 1
    assert len(quarantined) == 0


def test_quarantine_retains_invalid_quote_when_unmatched():
    turn = TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi chỉ bị nhức mỏi nhẹ.")
    transcript = Transcript(turns=[turn])

    c1 = make_cap("C1", "ChiefComplaint", "sốt cao", "Sốt cao 40 độ", "patient", turn_id="T1", quote="sốt cao 40 độ liên tục")
    usable, quarantined, warnings = validate_and_partition_caps([c1], transcript)

    assert len(usable) == 0
    assert len(quarantined) == 1
    assert quarantined[0].resolution_status == "needs_review"


# ============================================================
# END-TO-END CONSULTATION PATTERN TESTS (37-40)
# ============================================================

@pytest.mark.asyncio
async def test_e2e_full_knee_consultation_pattern():
    transcript = Transcript(turns=[
        TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau gối trái 3 tuần nay, cúi xuống thì đau tăng, nghỉ ngơi thì đỡ."),
        TranscriptTurn(turn_id="T2", speaker="clinician", text="Huyết áp 120/80 mmHg, Mạch 72."),
        TranscriptTurn(turn_id="T3", speaker="clinician", text="Khớp gối trái sưng nề nhẹ, ấn đau khe khớp, Lachman âm tính."),
        TranscriptTurn(turn_id="T4", speaker="clinician", text="Theo dõi đợt bùng phát thoái hóa khớp gối."),
        TranscriptTurn(turn_id="T5", speaker="clinician", text="Kê đơn Paracetamol 500mg và hẹn tái khám 2 tuần."),
    ])

    caps = [
        make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối trái 3 tuần nay", "patient", turn_id="T1", quote="đau gối trái 3 tuần nay"),
        make_cap("C2", "ProblemHistory", "yếu tố tăng", "Đau tăng khi cúi", "patient", turn_id="T1", quote="cúi xuống thì đau tăng"),
        make_cap("C3", "ProblemHistory", "yếu tố giảm", "Nghỉ ngơi thì đỡ đau", "patient", turn_id="T1", quote="nghỉ ngơi thì đỡ"),
        make_cap("C4", "ExamFinding", "huyết áp", "Huyết áp 120/80 mmHg", "clinician", turn_id="T2", quote="Huyết áp 120/80 mmHg"),
        make_cap("C5", "ExamFinding", "mạch", "Mạch 72 lần/phút", "clinician", turn_id="T2", quote="Mạch 72"),
        make_cap("C6", "ExamFinding", "sưng khớp", "Khớp gối trái sưng nề nhẹ", "clinician", turn_id="T3", quote="Khớp gối trái sưng nề nhẹ"),
        make_cap("C7", "ExamFinding", "ấn đau", "Ấn đau khe khớp gối", "clinician", turn_id="T3", quote="ấn đau khe khớp"),
        make_cap("C8", "ExamFinding", "Lachman", "Nghiệm pháp Lachman âm tính", "clinician", verification_status="negated", turn_id="T3", quote="Lachman âm tính"),
        make_cap("C9", "Problem", "thoái hóa khớp gối", "Theo dõi đợt bùng phát thoái hóa khớp gối", "clinician", verification_status="uncertain", turn_id="T4", quote="đợt bùng phát thoái hóa khớp gối"),
        make_cap("C10", "MedicationRequest", "Paracetamol", "Kê đơn Paracetamol 500mg", "clinician", temporality="future", clinical_status="planned", turn_id="T5", quote="Paracetamol 500mg"),
        make_cap("C11", "FollowUp", "tái khám", "Hẹn tái khám 2 tuần", "clinician", temporality="future", clinical_status="planned", turn_id="T5", quote="tái khám 2 tuần"),
    ]

    cands = compute_section_candidates(caps)
    assert set(cands["S"]) == {"C1", "C2", "C3"}
    assert set(cands["O"]) == {"C4", "C5", "C6", "C7", "C8"}
    assert cands["A"] == ["C9"]
    assert set(cands["P"]) == {"C10", "C11"}

    rendered = {
        "S": {"items": [{"item_id": "S1", "text": "Đau gối trái 3 tuần nay, đau tăng khi cúi, nghỉ ngơi thì đỡ", "cap_ids": ["C1", "C2", "C3"]}], "missing": False},
        "O": {"items": [
            {"item_id": "O1", "text": "Sinh hiệu: HA 120/80 mmHg, Mạch 72 lần/phút", "cap_ids": ["C4", "C5"]},
            {"item_id": "O2", "text": "Khớp gối trái sưng nề nhẹ, ấn đau khe khớp, Lachman âm tính", "cap_ids": ["C6", "C7", "C8"]},
        ], "missing": False},
        "A": {"items": [{"item_id": "A1", "text": "Theo dõi đợt bùng phát thoái hóa khớp gối", "cap_ids": ["C9"]}], "missing": False},
        "P": {"items": [
            {"item_id": "P1", "text": "Kê đơn Paracetamol 500mg", "cap_ids": ["C10"]},
            {"item_id": "P2", "text": "Hẹn tái khám sau 2 tuần", "cap_ids": ["C11"]},
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

    res = MagicMock(content=json.dumps(rendered))
    res.response_metadata = {}
    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(return_value=res)

    app = create_soap_pipeline(store, llm)
    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "e2e-knee-test-001",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    draft_soap = SoapDocument.model_validate(state["soap_draft"])
    assert len(draft_soap.S.items) == 1
    assert len(draft_soap.O.items) == 2
    assert len(draft_soap.A.items) == 1
    assert len(draft_soap.P.items) == 2

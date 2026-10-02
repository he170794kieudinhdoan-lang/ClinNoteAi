"""Regression suite for Section Candidate Routing & Exact Run 0d82e6ec-8e63-46e3-aec6-3f4d1234d26a."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Evidence, SoapDocument, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import compute_section_candidates, parse_soap
from src.services.soap.repair_policy import is_repairable_error
from src.services.soap.validation import validate_soap


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


# 1. Clinician ExamFinding cannot be placed in S
def test_clinician_exam_finding_cannot_be_placed_in_s():
    c3 = make_cap("C3", "ExamFinding", "sưng khớp", "Khớp gối trái hơi sưng nhẹ", "clinician")
    soap = parse_soap(json.dumps(make_soap_dict(s_items=[{"item_id": "S1", "text": "Khớp gối trái hơi sưng nhẹ", "cap_ids": ["C3"]}])))

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c3], generated=True)
    assert exc_info.value.code == "subjective_source"


# 2. Patient-reported symptom cannot be forced into O merely because its wording sounds like a finding
def test_patient_reported_symptom_cannot_be_forced_into_o():
    c4 = make_cap("C4", "ChiefComplaint", "cứng khớp", "Bị cứng khớp nhiều vào buổi sáng", "patient")
    soap = parse_soap(json.dumps(make_soap_dict(o_items=[{"item_id": "O1", "text": "Bị cứng khớp nhiều vào buổi sáng", "cap_ids": ["C4"]}])))

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c4], generated=True)
    assert exc_info.value.code == "objective_source"


# 3. S candidate generation contains only patient-source CAPs
def test_s_candidate_generation_only_patient_source():
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient")
    c2 = make_cap("C2", "ProblemHistory", "tiền sử đau", "Đau 3 tuần", "patient")
    c3 = make_cap("C3", "ExamFinding", "sưng khớp", "Khớp gối sưng nhẹ", "clinician")

    cands = compute_section_candidates([c1, c2, c3])
    assert set(cands["S"]) == {"C1", "C2"}
    assert "C3" not in cands["S"]


# 4. O candidate generation contains only valid objective CAPs (clinician ExamFinding/TestResult)
def test_o_candidate_generation_only_valid_objective_caps():
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient")
    c3 = make_cap("C3", "ExamFinding", "sưng khớp", "Khớp gối sưng nhẹ", "clinician")
    c7 = make_cap("C7", "FollowUp", "tái khám", "Hẹn tái khám sau 4 tuần", "clinician")

    cands = compute_section_candidates([c1, c3, c7])
    assert cands["O"] == ["C3"]
    assert "C1" not in cands["O"]
    assert "C7" not in cands["O"]


# 5. A remains empty when no clinician assessment CAP exists
def test_a_remains_empty_when_no_clinician_assessment_cap():
    caps = [
        make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient"),
        make_cap("C3", "ExamFinding", "sưng khớp", "Khớp gối sưng nhẹ", "clinician"),
        make_cap("C7", "FollowUp", "tái khám", "Hẹn tái khám sau 4 tuần", "clinician"),
    ]

    cands = compute_section_candidates(caps)
    assert cands["A"] == []

    # Attempting to link an item in A without clinician assessment CAP fails validation
    soap = parse_soap(json.dumps(make_soap_dict(a_items=[{"item_id": "A1", "text": "Thoái hóa khớp gối", "cap_ids": ["C1"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, caps, generated=True)
    assert exc_info.value.code == "assessment_source"


# 6. P only accepts clinician plan CAPs
def test_p_only_accepts_clinician_plan_caps():
    c1 = make_cap("C1", "ChiefComplaint", "đau khớp", "Đau khớp gối", "patient")
    c7 = make_cap("C7", "FollowUp", "tái khám", "Hẹn tái khám sau 4 tuần", "clinician")
    c8 = make_cap("C8", "Counseling", "tập vật lý trị liệu", "Khuyên tập vật lý trị liệu", "clinician")

    cands = compute_section_candidates([c1, c7, c8])
    assert set(cands["P"]) == {"C7", "C8"}
    assert "C1" not in cands["P"]

    soap = parse_soap(json.dumps(make_soap_dict(p_items=[{"item_id": "P1", "text": "Đau khớp gối", "cap_ids": ["C1"]}])))
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c1, c7, c8], generated=True)
    assert exc_info.value.code == "plan_source"


# 7. Exact regression for run 0d82e6ec-8e63-46e3-aec6-3f4d1234d26a
@pytest.mark.asyncio
async def test_exact_regression_run_0d82e6ec_8e63_46e3_aec6_3f4d1234d26a():
    caps = [
        make_cap("C1", "ChiefComplaint", "đau khớp gối", "Khớp gối trái của tôi bị đau nhiều quá.", "patient"),
        make_cap("C2", "ProblemHistory", "đau khớp gối", "Cơn đau kéo dài suốt 3 tuần nay.", "patient"),
        make_cap("C3", "ExamFinding", "sưng khớp", "Khớp gối trái hơi sưng nhẹ.", "clinician"),
        make_cap("C4", "ChiefComplaint", "cứng khớp", "Bị cứng khớp nhiều, nhất là vào các buổi sáng.", "patient"),
        make_cap("C5", "Problem", "tăng huyết áp", "Tôi có bị tăng huyết áp, nhưng được kiểm soát tốt.", "patient"),
        make_cap("C6", "MedicationStatement", "thuốc huyết áp", "Tôi uống thuốc huyết áp đều đặn.", "patient"),
        make_cap("C7", "FollowUp", "tái khám", "Hẹn tái khám sau 4 tuần nữa.", "clinician"),
        make_cap("C8", "Counseling", "tập vật lý trị liệu", "Khuyên bác nên bắt đầu tập vật lý trị liệu.", "clinician"),
    ]

    cands = compute_section_candidates(caps)
    assert set(cands["S"]) == {"C1", "C2", "C4", "C5", "C6"}
    assert cands["O"] == ["C3"]
    assert cands["A"] == []
    assert set(cands["P"]) == {"C7", "C8"}

    # Valid SOAP generated matching candidate mapping
    correct_soap = make_soap_dict(
        s_items=[
            {"item_id": "S1", "text": "Khớp gối trái đau nhiều", "cap_ids": ["C1"]},
            {"item_id": "S2", "text": "Đau kéo dài 3 tuần", "cap_ids": ["C2"]},
            {"item_id": "S3", "text": "Cứng khớp vào buổi sáng", "cap_ids": ["C4"]},
            {"item_id": "S4", "text": "Tiền sử tăng huyết áp", "cap_ids": ["C5"]},
            {"item_id": "S5", "text": "Uống thuốc huyết áp đều đặn", "cap_ids": ["C6"]},
        ],
        o_items=[{"item_id": "O1", "text": "Khớp gối trái hơi sưng nhẹ", "cap_ids": ["C3"]}],
        a_items=[],
        p_items=[
            {"item_id": "P1", "text": "Hẹn tái khám sau 4 tuần", "cap_ids": ["C7"]},
            {"item_id": "P2", "text": "Tập vật lý trị liệu", "cap_ids": ["C8"]},
        ],
    )

    store = MagicMock()
    store.assert_revision = MagicMock()
    store.load = MagicMock(return_value={
        "transcript": Transcript(turns=[TranscriptTurn(turn_id="T1", speaker="patient", text="đau khớp gối")]).model_dump(mode="json"),
        "caps": [c.model_dump(mode="json") for c in caps],
        "cap_warnings": [],
    })
    store.save_attempt = MagicMock()
    store.append_revision = MagicMock(return_value={"revision": 1})

    res = MagicMock(content=json.dumps(correct_soap))
    res.response_metadata = {}
    llm = MagicMock()
    llm.model_name = "test-model"
    llm.ainvoke = AsyncMock(return_value=res)

    app = create_soap_pipeline(store, llm)
    state = await app.ainvoke({
        "operation": "generate",
        "run_id": "0d82e6ec-8e63-46e3-aec6-3f4d1234d26a",
        "expected_revision": 0,
        "soap_repair_count": 0,
    })

    assert state.get("error") is None
    draft_soap = SoapDocument.model_validate(state["soap_draft"])
    assert draft_soap.A.missing is True
    assert len(draft_soap.A.items) == 0


# 8. Existing repair limit remains unchanged
def test_existing_repair_limit_remains_unchanged():
    assert is_repairable_error("missing_cap_link", repair_count=0) is True
    assert is_repairable_error("missing_cap_link", repair_count=1) is False

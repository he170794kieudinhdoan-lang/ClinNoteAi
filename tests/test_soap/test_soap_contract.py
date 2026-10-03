"""Phase 4 Unit Tests for S/O/A/P Contract and source_of_fact Semantics.

Tests cover:
TEST 1: Patient-reported Problem -> S is valid.
TEST 2: ExamFinding -> O is valid.
TEST 3: TestResult -> O is valid.
TEST 4: Patient Problem -> O is rejected (objective_source).
TEST 5: Clinician assessment/diagnosis -> A is valid.
TEST 6: Patient-reported Problem -> A is rejected (assessment_source).
TEST 7: Clinician repeats patient info -> source_of_fact = patient -> rejected for A.
TEST 8: Clinician diagnosis/assessment -> source_of_fact = clinician -> valid for A.
TEST 9: Clinician treatment/order/follow-up -> valid for P.
TEST 10: Patient Problem or non-plan CAP -> rejected for P (plan_source).
TEST 11: Objective-only CAP (ExamFinding/TestResult) in S -> rejected for S (subjective_source).
TEST 12: SOAP item generated without cap_ids -> rejected (missing_cap_link).
"""

import pytest

from src.schemas.soap import Cap, SoapDocument, SoapItem, SoapSection
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import validate_soap


@pytest.fixture
def base_caps():
    return [
        Cap(
            prop_id="C_S1",
            cap_type="Problem",
            canonical_concept="đau đầu",
            proposition_text="Đau đầu từ sáng nay",
            speaker_source="patient",  # source_of_fact = patient
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T1", "quote": "đau đầu"}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C_O1",
            cap_type="ExamFinding",
            canonical_concept="sưng gối trái",
            proposition_text="Gối trái sưng nhẹ",
            speaker_source="clinician",  # source_of_fact = clinician
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T2", "quote": "gối trái sưng nhẹ"}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C_O2",
            cap_type="TestResult",
            canonical_concept="bạch cầu",
            proposition_text="Bạch cầu tăng nhẹ",
            speaker_source="clinician",
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T2", "quote": "bạch cầu tăng"}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C_A1",
            cap_type="Problem",
            canonical_concept="viêm khớp cấp",
            proposition_text="Chẩn đoán viêm khớp cấp",
            speaker_source="clinician",  # source_of_fact = clinician assessment
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T3", "quote": "Chẩn đoán viêm khớp cấp"}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C_P1",
            cap_type="FollowUp",
            canonical_concept="tái khám",
            proposition_text="Tái khám sau 1 tuần",
            speaker_source="clinician",  # source_of_fact = clinician plan
            temporality="future",
            verification_status="affirmed",
            clinical_status="planned",
            evidence=[{"turn_id": "T4", "quote": "Tái khám sau 1 tuần"}],
            supersedes=[],
            resolution_status="current",
        ),
    ]


def test_patient_reported_problem_valid_in_s(base_caps):
    """TEST 1: Patient-reported Problem -> S is valid."""
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau đầu từ sáng", cap_ids=["C_S1"])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, base_caps, generated=True)
    assert validated.S.items[0].cap_ids == ["C_S1"]


def test_exam_finding_and_test_result_valid_in_o(base_caps):
    """TEST 2 & 3: ExamFinding and TestResult -> O is valid."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(
            items=[
                SoapItem(item_id="O1", text="Gối trái sưng nhẹ", cap_ids=["C_O1"]),
                SoapItem(item_id="O2", text="Bạch cầu tăng nhẹ", cap_ids=["C_O2"]),
            ],
            missing=False,
        ),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, base_caps, generated=True)
    assert len(validated.O.items) == 2


def test_patient_problem_rejected_in_o(base_caps):
    """TEST 4: Patient Problem -> O is rejected (objective_source)."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Đau đầu từ sáng", cap_ids=["C_S1"])], missing=False),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, base_caps, generated=True)
    assert exc.value.code == "objective_source"


def test_clinician_assessment_valid_in_a(base_caps):
    """TEST 5 & 8: Clinician diagnosis/assessment (source_of_fact=clinician) -> A is valid."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[SoapItem(item_id="A1", text="Chẩn đoán viêm khớp cấp", cap_ids=["C_A1"])], missing=False),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, base_caps, generated=True)
    assert validated.A.items[0].cap_ids == ["C_A1"]


def test_patient_reported_problem_rejected_in_a(base_caps):
    """TEST 6 & 7: Patient-reported Problem (even if spoken in clinician turn) has source_of_fact=patient -> rejected in A."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[SoapItem(item_id="A1", text="Đau đầu từ sáng", cap_ids=["C_S1"])], missing=False),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, base_caps, generated=True)
    assert exc.value.code == "assessment_source"


def test_clinician_plan_valid_in_p(base_caps):
    """TEST 9: Clinician treatment/order/follow-up -> valid in P."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[SoapItem(item_id="P1", text="Tái khám sau 1 tuần", cap_ids=["C_P1"])], missing=False),
    )
    validated = validate_soap(soap, base_caps, generated=True)
    assert validated.P.items[0].cap_ids == ["C_P1"]


def test_non_plan_cap_rejected_in_p(base_caps):
    """TEST 10: Non-plan CAP (e.g. ChiefComplaint or Problem) -> rejected for P (plan_source)."""
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[SoapItem(item_id="P1", text="Chẩn đoán viêm khớp cấp", cap_ids=["C_A1"])], missing=False),
    )
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, base_caps, generated=True)
    assert exc.value.code == "plan_source"


def test_objective_only_cap_rejected_in_s(base_caps):
    """TEST 11: Pure ExamFinding/TestResult CAP without patient basis -> rejected for S (subjective_source)."""
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Gối sưng nhẹ", cap_ids=["C_O1"])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, base_caps, generated=True)
    assert exc.value.code == "subjective_source"


def test_soap_item_lacks_cap_ids_rejected(base_caps):
    """TEST 12: Generated SOAP item without cap_ids -> rejected (missing_cap_link)."""
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau đầu", cap_ids=[])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, base_caps, generated=True)
    assert exc.value.code == "missing_cap_link"

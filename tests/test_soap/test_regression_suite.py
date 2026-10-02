"""Phase 0 Regression Test Suite for VMEC-06 SOAP Pipeline.

This test suite captures the 5 actual failure modes identified during codebase audit:
1. objective_source: Objective item requires exam or test source
2. assessment_source: Assessment requires clinician source
3. invalid_cap_link: Item links missing or superseded CAP
4. invalid_quote: CAP quote is absent from turn
5. duplicate_item_id: SOAP item IDs must be unique

NOTE: These tests document current system behavior and baseline failure modes
without modifying backend implementation in Phase 0.
"""

import pytest

from src.schemas.soap import Cap, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import validate_caps, validate_soap


@pytest.fixture
def sample_transcript():
    return Transcript(turns=[
        TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau đầu từ sáng nay."),
        TranscriptTurn(turn_id="T2", speaker="clinician", text="Khám thấy gối trái sưng nhẹ."),
        TranscriptTurn(turn_id="T3", speaker="clinician", text="Đánh giá có thể là viêm khớp."),
        TranscriptTurn(turn_id="T4", speaker="clinician", text="Dặn tái khám sau 1 tuần."),
    ])


@pytest.fixture
def sample_caps():
    return [
        Cap(
            prop_id="C1",
            cap_type="ChiefComplaint",
            canonical_concept="đau đầu",
            proposition_text="Đau đầu từ sáng nay",
            speaker_source="patient",
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T1", "quote": "Tôi bị đau đầu từ sáng nay."}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C2",
            cap_type="ExamFinding",
            canonical_concept="sưng gối trái",
            proposition_text="Gối trái sưng nhẹ",
            speaker_source="clinician",
            temporality="current",
            verification_status="affirmed",
            clinical_status="active",
            evidence=[{"turn_id": "T2", "quote": "Khám thấy gối trái sưng nhẹ."}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C3",
            cap_type="Problem",
            canonical_concept="viêm khớp",
            proposition_text="Có thể là viêm khớp",
            speaker_source="clinician",
            temporality="current",
            verification_status="uncertain",
            clinical_status="active",
            evidence=[{"turn_id": "T3", "quote": "Đánh giá có thể là viêm khớp."}],
            supersedes=[],
            resolution_status="current",
        ),
        Cap(
            prop_id="C4",
            cap_type="FollowUp",
            canonical_concept="tái khám",
            proposition_text="Tái khám sau 1 tuần",
            speaker_source="clinician",
            temporality="future",
            verification_status="affirmed",
            clinical_status="planned",
            evidence=[{"turn_id": "T4", "quote": "Dặn tái khám sau 1 tuần."}],
            supersedes=[],
            resolution_status="current",
        ),
    ]


def test_regression_objective_source_error(sample_caps):
    """Failure Mode 1: Objective item linking a non-exam/test CAP raises objective_source."""
    # C3 is type "Problem", which is not allowed in section O (only ExamFinding or TestResult allowed)
    invalid_soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="item-s1", text="Đau đầu từ sáng", cap_ids=["C1"])], missing=False),
        O=SoapSection(items=[SoapItem(item_id="item-o1", text="Có thể viêm khớp", cap_ids=["C3"])], missing=False),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(invalid_soap, sample_caps, generated=True)

    assert exc_info.value.code == "objective_source"
    assert exc_info.value.message == "Objective item requires exam or test source"


def test_regression_assessment_source_error(sample_caps):
    """Failure Mode 2: Assessment item linking a patient-source CAP raises assessment_source."""
    # C1 has speaker_source="patient", which is not allowed in section A (requires clinician)
    invalid_soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[SoapItem(item_id="item-a1", text="Bệnh nhân khai đau đầu", cap_ids=["C1"])], missing=False),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(invalid_soap, sample_caps, generated=True)

    assert exc_info.value.code == "assessment_source"
    assert exc_info.value.message == "Assessment requires clinician source"


def test_regression_superseded_cap_link_error(sample_caps, sample_transcript):
    """Failure Mode 3: SOAP item linking a superseded CAP raises invalid_cap_link."""
    # Create C5 which supersedes C1
    c5 = Cap(
        prop_id="C5",
        cap_type="ChiefComplaint",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu vừa phải từ 8h sáng",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T1", "quote": "Tôi bị đau đầu từ sáng nay."}],
        supersedes=["C1"],
        resolution_status="current",
    )
    all_caps = sample_caps + [c5]
    validated_caps, _ = validate_caps(all_caps, sample_transcript)

    # C1 is now marked resolution_status="superseded"
    c1_validated = next(c for c in validated_caps if c.prop_id == "C1")
    assert c1_validated.resolution_status == "superseded"

    # SOAP item in S links C1 (which is superseded by C5) -> Deterministically resolved to C5
    invalid_soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="item-s1", text="Đau đầu từ sáng", cap_ids=["C1"])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    resolved_soap = validate_soap(invalid_soap, validated_caps, generated=True)
    assert resolved_soap.S.items[0].cap_ids == ["C5"]

    # SOAP item linking a superseded CAP with NO replacement -> raises invalid_cap_link
    c_orphan = Cap(
        prop_id="C_ORPHAN", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối", speaker_source="patient", evidence=[{"turn_id": "T1", "quote": "Tôi bị đau gối."}],
        resolution_status="superseded",
    )
    unresolvable_soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="item-s2", text="Đau gối", cap_ids=["C_ORPHAN"])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(unresolvable_soap, validated_caps + [c_orphan], generated=True)

    assert exc_info.value.code == "invalid_cap_link"
    assert "Item item-s2 links missing or superseded CAP" in exc_info.value.message


def test_regression_invalid_quote_error(sample_transcript):
    """Failure Mode 4: CAP quote not matching turn text character-for-character raises invalid_quote."""
    # Quote contains slight paraphrase or typo ("gối trái sưng vừa" instead of "gối trái sưng nhẹ")
    invalid_cap = Cap(
        prop_id="C2",
        cap_type="ExamFinding",
        canonical_concept="sưng gối trái",
        proposition_text="Gối trái sưng nhẹ",
        speaker_source="clinician",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T2", "quote": "gối trái sưng vừa"}],
        supersedes=[],
        resolution_status="current",
    )

    with pytest.raises(SoapFailure) as exc_info:
        validate_caps([invalid_cap], sample_transcript)

    assert exc_info.value.code == "invalid_quote"
    assert "CAP C2 quote is absent from turn T2" in exc_info.value.message


def test_regression_duplicate_item_id_error(sample_caps):
    """Failure Mode 5: SOAP items with duplicate item_id raise duplicate_item_id."""
    invalid_soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="item-a1", text="Đau đầu từ sáng", cap_ids=["C1"])], missing=False),
        O=SoapSection(items=[SoapItem(item_id="item-a1", text="Gối trái sưng nhẹ", cap_ids=["C2"])], missing=False),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(invalid_soap, sample_caps, generated=True)

    assert exc_info.value.code == "duplicate_item_id"
    assert exc_info.value.message == "SOAP item IDs must be unique"

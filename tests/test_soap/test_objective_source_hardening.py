"""Regression tests for Objective item validation, section candidate boundaries, and quote matching invariants."""

from __future__ import annotations

import pytest

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import compute_section_candidates
from src.services.soap.text_utils import resolve_conservative_evidence_quote
from src.services.soap.validation import filter_usable_caps, validate_and_partition_caps, validate_soap


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
    turn_id: str = "T1",
    quote: str = "sample quote",
    resolution_status: str = "current",
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


# TEST A: Quarantined ExamFinding CAP must NOT be included in section_candidates['O'] or usable CAPs
def test_a_quarantined_exam_finding_excluded_from_objective_candidates():
    t = Transcript(turns=[make_turn("T1", "clinician", "Khám gối bình thường.")])
    # ExamFinding CAP with invalid_quote (absent from turn T1)
    quarantined_exam = make_cap("C1", "ExamFinding", "sưng gối", "Gối sưng 2cm", "clinician", turn_id="T1", quote="absent quote string")
    
    usable, quarantined, warnings = validate_and_partition_caps([quarantined_exam], t)
    assert len(quarantined) == 1
    assert quarantined[0].resolution_status == "needs_review"
    assert len(usable) == 0

    section_candidates = compute_section_candidates(usable)
    assert section_candidates["O"] == []


# TEST B: Valid Objective items must link CAPs with cap_type in {"ExamFinding", "TestResult"} and clinician speaker_source
def test_b_objective_item_requires_exam_or_test_source():
    # Patient CAP (ChiefComplaint) cannot be linked to Objective section
    cap_patient = make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối", "patient", turn_id="T1", quote="đau gối")
    soap_invalid = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau gối", cap_ids=["C1"])]),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Khám gối đau", cap_ids=["C1"])]),  # Linking patient CAP to O
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap_invalid, [cap_patient], generated=True)
    assert exc_info.value.code in {"objective_source", "candidate_boundary_violation"}

    # Valid ExamFinding CAP can be linked to Objective section
    cap_exam = make_cap("C2", "ExamFinding", "sưng gối", "Gối sưng nhẹ", "clinician", turn_id="T2", quote="gối sưng nhẹ")
    soap_valid = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Gối sưng nhẹ", cap_ids=["C2"])]),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap_valid, [cap_exam], generated=True)
    assert len(validated.O.items) == 1


# TEST C: Objective item must NOT link needs_review, superseded, or quarantined CAP
def test_c_objective_item_cannot_link_quarantined_or_superseded_cap():
    cap_active = make_cap("C1", "ExamFinding", "huyết áp", "Huyết áp 120/80", "clinician", turn_id="T1", quote="120/80")
    cap_quarantined = make_cap("C2", "ExamFinding", "sưng gối", "Gối sưng", "clinician", turn_id="T1", quote="120/80", resolution_status="needs_review")
    cap_superseded = make_cap("C3", "ExamFinding", "nhịp tim", "Nhịp tim 70", "clinician", turn_id="T1", quote="120/80", resolution_status="superseded")

    # Linking quarantined C2
    soap_q = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Gối sưng", cap_ids=["C2"])]),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc1:
        validate_soap(soap_q, [cap_active, cap_quarantined, cap_superseded], generated=True)
    assert exc1.value.code in {"invalid_cap_link", "objective_source", "candidate_boundary_violation"}

    # Linking superseded C3
    soap_s = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Nhịp tim 70", cap_ids=["C3"])]),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    with pytest.raises(SoapFailure) as exc2:
        validate_soap(soap_s, [cap_active, cap_quarantined, cap_superseded], generated=True)
    assert exc2.value.code in {"invalid_cap_link", "objective_source", "candidate_boundary_violation"}


# TEST D: When no usable Objective CAP exists, empty Objective section (items: [], missing: true) is accepted cleanly
def test_d_empty_objective_section_accepted_when_no_usable_candidates():
    cap_patient = make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối", "patient", turn_id="T1", quote="đau gối")
    usable = [cap_patient]
    section_candidates = compute_section_candidates(usable)
    assert section_candidates["O"] == []

    soap_empty_o = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau gối", cap_ids=["C1"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap_empty_o, usable, generated=True)
    assert validated.O.missing is True
    assert len(validated.O.items) == 0


# TEST E: Evidence quote resolver handles casing/whitespace/punct, but quarantines absent quotes
def test_e_evidence_quote_resolver_deterministic_normalization_and_quarantine():
    turn_text = "Bác sĩ đo Huyết áp của tôi là 120/80 mmHg."

    # 1. Casing & punctuation differences match deterministically
    q1, s1 = resolve_conservative_evidence_quote("...huyết áp của tôi là 120/80,", turn_text)
    assert q1 == "Huyết áp của tôi là 120/80"
    assert s1 == "conservative_normalized_match"

    # 2. Whitespace differences match deterministically
    q2, s2 = resolve_conservative_evidence_quote("Huyết  áp   của tôi", turn_text)
    assert q2 == "Huyết áp của tôi"
    assert s2 == "conservative_normalized_match"

    # 3. Completely absent / hallucinated quote returns None -> triggers quarantine
    q3, s3 = resolve_conservative_evidence_quote("bác bị tiểu đường 10 năm", turn_text)
    assert q3 is None
    assert s3 == "unresolved_quote"

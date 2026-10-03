"""Mandatory Test Cases for Patch 1 & Patch 2 Verification.

Covers:
TEST 1: Label "chẩn đoán" does not cause unsupported_diagnosis
TEST 2: Clinical unsupported diagnosis (e.g., viêm phổi) is STILL blocked
TEST 3: Patient-first transcript works properly with speaker assignments and CAP validation
TEST 4: Symptoms without confirmed diagnosis use safe Assessment wording
TEST 5: Confirmed clinical diagnosis retains grounding
"""

from __future__ import annotations

from src.schemas.soap import (
    Cap,
    Evidence,
    SoapDocument,
    SoapItem,
    SoapSection,
    Transcript,
    TranscriptTurn,
)
from src.services.soap.semantic_validator import check_item_safety
from src.services.soap.validation import validate_caps, validate_soap
from src.services.speaker.role_classifier import SpeakerRoleClassifier


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


def make_soap(
    s_items: list[SoapItem] | None = None,
    o_items: list[SoapItem] | None = None,
    a_items: list[SoapItem] | None = None,
    p_items: list[SoapItem] | None = None,
) -> SoapDocument:
    s_list = s_items or []
    o_list = o_items or []
    a_list = a_items or []
    p_list = p_items or []
    return SoapDocument(
        S=SoapSection(items=s_list, missing=len(s_list) == 0),
        O=SoapSection(items=o_list, missing=len(o_list) == 0),
        A=SoapSection(items=a_list, missing=len(a_list) == 0),
        P=SoapSection(items=p_list, missing=len(p_list) == 0),
    )


# TEST 1 — Label "chẩn đoán" không gây unsupported_diagnosis
def test_1_label_chan_doan_no_false_positive():
    cap = make_cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="thoái hóa khớp gối",
        proposition_text="Theo dõi thoái hóa khớp gối",
        speaker_source="clinician",
        quote="theo dõi thoái hóa khớp gối",
    )
    item = SoapItem(
        item_id="A1",
        text="Chẩn đoán: Theo dõi thoái hóa khớp gối",
        cap_ids=["C1"],
    )
    soap = make_soap(a_items=[item])

    # 1. Safety check produces no violations
    violations = check_item_safety(item, "A", [cap])
    assert not any(v.code == "unsupported_diagnosis" for v in violations)

    # 2. validate_soap marks support_status as pending
    validated = validate_soap(soap, [cap], generated=True)
    assert validated.A.items[0].support_status == "pending"


# TEST 2 — Clinical unsupported diagnosis vẫn bị chặn
def test_2_clinical_unsupported_diagnosis_blocked():
    cap1 = make_cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="buồn nôn",
        proposition_text="Ghi nhận buồn nôn",
        speaker_source="clinician",
        quote="buồn nôn",
    )
    cap2 = make_cap(
        prop_id="C2",
        cap_type="Problem",
        canonical_concept="chóng mặt",
        proposition_text="Ghi nhận chóng mặt",
        speaker_source="clinician",
        quote="chóng mặt",
    )
    item = SoapItem(
        item_id="A1",
        text="Chẩn đoán: viêm phổi",
        cap_ids=["C1", "C2"],
    )
    soap = make_soap(a_items=[item])

    # 1. Safety check catches unsupported diagnosis "viêm phổi"
    violations = check_item_safety(item, "A", [cap1, cap2])
    assert any(v.code == "unsupported_diagnosis" for v in violations)

    # 2. validate_soap flags support_status as unsupported
    validated = validate_soap(soap, [cap1, cap2], generated=True)
    assert validated.A.items[0].support_status == "unsupported"


# TEST 3 — Patient-first transcript
def test_3_patient_first_transcript():
    # Transcript where Speaker 1 is Patient and turns start with Patient
    turns = [
        make_turn("t1", "patient", "Tôi bị buồn nôn và chóng mặt mức độ vừa."),
        make_turn("t2", "clinician", "Chào bạn, bạn bị triệu chứng này lâu chưa?"),
        make_turn("t3", "patient", "Tôi bị khoảng 3 ngày nay rồi bác sĩ."),
    ]
    # Build conversation string
    segments = [
        {"speaker": "1", "text": "Tôi bị buồn nôn và chóng mặt mức độ vừa."},
        {"speaker": "2", "text": "Chào bạn, bạn bị triệu chứng này lâu chưa?"},
    ]
    conv = SpeakerRoleClassifier._build_conversation(segments)
    assert "Speaker 1: Tôi bị buồn nôn và chóng mặt mức độ vừa." in conv

    # CAP validation against patient-first transcript works cleanly without failing due to turn order
    cap = make_cap(
        prop_id="C1",
        cap_type="ChiefComplaint",
        canonical_concept="buồn nôn",
        proposition_text="Cảm thấy buồn nôn",
        speaker_source="patient",
        turn_id="t1",
        quote="buồn nôn",
    )
    val_caps, warnings = validate_caps([cap], Transcript(turns=turns))
    assert len(val_caps) == 1
    assert len(warnings) == 0


# TEST 4 — Symptoms without confirmed diagnosis
def test_4_symptoms_without_confirmed_diagnosis():
    cap1 = make_cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="buồn nôn",
        proposition_text="Theo dõi buồn nôn",
        speaker_source="clinician",
        quote="buồn nôn",
    )
    cap2 = make_cap(
        prop_id="C2",
        cap_type="Problem",
        canonical_concept="chóng mặt",
        proposition_text="Theo dõi chóng mặt",
        speaker_source="clinician",
        quote="chóng mặt",
    )
    # Safe Assessment wording
    item = SoapItem(
        item_id="A1",
        text="Theo dõi triệu chứng buồn nôn và chóng mặt",
        cap_ids=["C1", "C2"],
    )
    soap = make_soap(a_items=[item])

    violations = check_item_safety(item, "A", [cap1, cap2])
    assert not any(v.code == "unsupported_diagnosis" for v in violations)

    validated = validate_soap(soap, [cap1, cap2], generated=True)
    assert validated.A.items[0].support_status == "pending"


# TEST 5 — Confirmed clinical diagnosis
def test_5_confirmed_clinical_diagnosis():
    cap = make_cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="viêm phổi",
        proposition_text="Bệnh nhân bị viêm phổi",
        speaker_source="clinician",
        quote="bị viêm phổi",
    )
    item = SoapItem(
        item_id="A1",
        text="Chẩn đoán: viêm phổi",
        cap_ids=["C1"],
    )
    soap = make_soap(a_items=[item])

    # Clinician supported diagnosis passes grounding
    violations = check_item_safety(item, "A", [cap])
    assert not any(v.code == "unsupported_diagnosis" for v in violations)

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.A.items[0].support_status == "pending"

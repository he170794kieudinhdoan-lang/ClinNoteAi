"""Comprehensive Semantic Scope & Pipeline Hardening Test Suite (Cases A - Q + Cross-CAP Talk)."""

from __future__ import annotations

import json
import pytest

from src.schemas.soap import (
    Cap,
    Evidence,
    SoapDocument,
    SoapItem,
    SoapSection,
    Transcript,
    TranscriptTurn,
)
from src.services.soap.errors import SoapFailure
from src.services.soap.semantic_validator import check_item_safety, _extract_core_concept_tokens
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


# CASE A: Affirmed CAP + unrelated negated CAP in same SOAP item -> PASS
def test_case_a_affirmed_and_unrelated_negated_cap_passes():
    c13 = make_cap("C13", "ProblemHistory", "sử dụng rượu bia", "Uống khoảng 3 đến 4 lon bia mỗi tuần", "patient", verification_status="affirmed")
    c14 = make_cap("C14", "ProblemHistory", "sử dụng chất kích thích", "Không sử dụng chất kích thích", "patient", verification_status="negated")

    item = SoapItem(
        item_id="S6",
        text="Uống khoảng 3–4 lon bia mỗi tuần; không sử dụng chất kích thích hoặc ma túy.",
        cap_ids=["C13", "C14"]
    )
    soap = make_soap(s_items=[item])

    violations = check_item_safety(item, "S", [c13, c14])
    assert not any(v.code == "negation_contradiction" for v in violations)

    validated = validate_soap(soap, [c13, c14], generated=True)
    assert validated.S.items[0].support_status == "pending"


# CASE B: Two affirmed CAPs + one negated CAP in same item -> PASS
def test_case_b_two_affirmed_and_one_negated_cap_passes():
    c12 = make_cap("C12", "ProblemHistory", "hút thuốc lá", "Hút nửa bao thuốc lá mỗi ngày", "patient", verification_status="affirmed")
    c13 = make_cap("C13", "ProblemHistory", "sử dụng rượu bia", "Uống 3-4 lon bia mỗi tuần", "patient", verification_status="affirmed")
    c14 = make_cap("C14", "ProblemHistory", "ma túy", "Không dùng ma túy", "patient", verification_status="negated")

    item = SoapItem(
        item_id="S6",
        text="Hút nửa bao thuốc lá mỗi ngày và uống 3–4 lon bia mỗi tuần; không sử dụng chất kích thích hoặc ma túy.",
        cap_ids=["C12", "C13", "C14"]
    )
    soap = make_soap(s_items=[item])

    violations = check_item_safety(item, "S", [c12, c13, c14])
    assert not any(v.code == "negation_contradiction" for v in violations)

    validated = validate_soap(soap, [c12, c13, c14], generated=True)
    assert validated.S.items[0].support_status == "pending"


# CASE C: Genuine negation of an affirmed CAP -> BLOCK
def test_case_c_genuine_negation_of_affirmed_cap_blocked():
    cap = make_cap("C1", "Problem", "đau ngực", "Bệnh nhân đau ngực", "patient", verification_status="affirmed")
    item = SoapItem(item_id="S1", text="Bệnh nhân không đau ngực", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "negation_contradiction" for v in violations)

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "unsupported"


# CASE D: Negated CAP rendered as affirmed -> BLOCK
def test_case_d_negated_cap_rendered_as_affirmed_blocked():
    cap = make_cap("C1", "Problem", "dị ứng penicillin", "Không dị ứng penicillin", "patient", verification_status="negated")
    item = SoapItem(item_id="S1", text="Bệnh nhân dị ứng penicillin", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "negation_contradiction" for v in violations)

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "unsupported"


# CASE E: Same concept with different vocabulary/paraphrase -> PASS
def test_case_e_paraphrased_concept_handles_negation_correctly():
    cap = make_cap("C1", "Problem", "tăng huyết áp", "Tiền sử cao huyết áp 5 năm", "patient", verification_status="affirmed")
    item = SoapItem(item_id="S1", text="Tiền sử cao huyết áp 5 năm, hiện không có ho hay khó thở", cap_ids=["C1"])

    violations = check_item_safety(item, "S", [cap])
    assert not any(v.code == "negation_contradiction" for v in violations)


# CASE F: Grouped SOAP item with multiple CAPs -> polarity evaluated independently
def test_case_f_grouped_item_independent_polarity():
    c1 = make_cap("C1", "ChiefComplaint", "đau đầu", "Đau đầu nhẹ", "patient", verification_status="affirmed")
    c2 = make_cap("C2", "Problem", "sốt", "Không sốt", "patient", verification_status="negated")

    item = SoapItem(item_id="S1", text="Bệnh nhân bị đau đầu nhẹ; không sốt.", cap_ids=["C1", "C2"])
    violations = check_item_safety(item, "S", [c1, c2])
    assert not violations


# CASE G: Multiple negation phrases in one item -> correct scope attribution
def test_case_g_multiple_negation_phrases_correct_scope():
    c1 = make_cap("C1", "Problem", "đau ngực", "Không đau ngực", "patient", verification_status="negated")
    c2 = make_cap("C2", "Problem", "khó thở", "Không khó thở", "patient", verification_status="negated")
    c3 = make_cap("C3", "ChiefComplaint", "mệt mỏi", "Mệt mỏi 2 tuần", "patient", verification_status="affirmed")

    item = SoapItem(item_id="S1", text="Cảm thấy mệt mỏi 2 tuần; không đau ngực, không khó thở.", cap_ids=["C1", "C2", "C3"])
    violations = check_item_safety(item, "S", [c1, c2, c3])
    assert not violations


# CROSS-CAP TALK TEST 1: CAP A current+affirmed, CAP B past+negated in same item
def test_cross_cap_talk_current_affirmed_and_past_negated():
    c_a = make_cap("CA", "ChiefComplaint", "đau đầu", "Đau đầu 2 ngày nay", "patient", temporality="current", verification_status="affirmed")
    c_b = make_cap("CB", "ProblemHistory", "bệnh mạn tính", "Không biết mình mắc bệnh mạn tính nào", "patient", temporality="past", verification_status="negated")

    item = SoapItem(
        item_id="S1",
        text="Bệnh nhân đau đầu 2 ngày nay; không dùng thuốc hiện tại và không biết mình mắc bệnh mạn tính nào.",
        cap_ids=["CA", "CB"]
    )
    violations = check_item_safety(item, "S", [c_a, c_b])
    assert not any(v.code in {"negation_contradiction", "temporality_contradiction"} for v in violations)


# CROSS-CAP TALK TEST 2: CAP A past+negated, CAP B current+affirmed in same item
def test_cross_cap_talk_past_negated_and_current_affirmed():
    c_a = make_cap("CA", "ProblemHistory", "tiền sử đau thắt lưng", "Chưa từng đau thắt lưng năm ngoái", "patient", temporality="past", verification_status="negated")
    c_b = make_cap("CB", "ChiefComplaint", "đau gối", "Hiện tại đau gối trái cấp", "patient", temporality="current", verification_status="affirmed")

    item = SoapItem(
        item_id="S1",
        text="Chưa từng có tiền sử đau thắt lưng năm ngoái; hiện tại đang bị đau gối trái cấp tính.",
        cap_ids=["CA", "CB"]
    )
    violations = check_item_safety(item, "S", [c_a, c_b])
    assert not any(v.code in {"negation_contradiction", "temporality_contradiction"} for v in violations)


# CROSS-CAP TALK TEST 3: 4 CAPs with different temporality & polarity in same item across sections
def test_cross_cap_talk_four_caps_different_temporality_and_polarity():
    c1 = make_cap("C1", "ChiefComplaint", "đau thắt lưng", "Đau thắt lưng 3 tuần", "patient", temporality="current", verification_status="affirmed")
    c2 = make_cap("C2", "ProblemHistory", "mất ngủ", "Không bị mất ngủ", "patient", temporality="current", verification_status="negated")
    c3 = make_cap("C3", "ProblemHistory", "tiền sử chấn thương", "Tiền sử chấn thương lưng 2 năm trước", "patient", temporality="past", verification_status="affirmed")
    c4 = make_cap("C4", "ProblemHistory", "bệnh lý thần kinh", "Chưa từng bị bệnh lý thần kinh", "patient", temporality="past", verification_status="negated")

    item = SoapItem(
        item_id="S1",
        text="Đau thắt lưng 3 tuần nay, không bị mất ngủ; có tiền sử chấn thương lưng 2 năm trước, chưa từng bị bệnh lý thần kinh.",
        cap_ids=["C1", "C2", "C3", "C4"]
    )
    violations = check_item_safety(item, "S", [c1, c2, c3, c4])
    assert not violations


# CROSS-CAP TALK TEST 4: Objective section exam finding cross-talk
def test_cross_cap_talk_objective_exam_findings():
    c1 = make_cap("C1", "ExamFinding", "sưng khớp gối", "Khớp gối trái sưng nề nhẹ", "clinician", temporality="current", verification_status="affirmed")
    c2 = make_cap("C2", "ExamFinding", "Lachman", "Nghiệm pháp Lachman âm tính", "clinician", temporality="current", verification_status="negated")

    item = SoapItem(
        item_id="O1",
        text="Khớp gối trái sưng nề nhẹ; nghiệm pháp Lachman âm tính, không thấy phát hiện bất thường khác.",
        cap_ids=["C1", "C2"]
    )
    violations = check_item_safety(item, "O", [c1, c2])
    assert not violations


# CASE H: Temporality contradiction -> detected
def test_case_h_temporality_contradiction_detected():
    cap = make_cap("C1", "ProblemHistory", "đau dạ dày", "Tiền sử đau dạ dày 2 năm trước", "patient", temporality="past")
    item = SoapItem(item_id="S1", text="Hiện tại đang bị đau dạ dày cấp tính", cap_ids=["C1"])

    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "temporality_contradiction" for v in violations)


# CASE I: Clinical status contradiction -> detected
def test_case_i_future_temporality_contradiction_detected():
    cap = make_cap("C1", "FollowUp", "tái khám", "Khám lại sau 1 tuần", "clinician", temporality="future", clinical_status="planned")
    item = SoapItem(item_id="P1", text="Đã tái khám và đánh giá lại kết quả", cap_ids=["C1"])

    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "temporality_contradiction" for v in violations)


# CASE J: Medication state contradiction -> detected
def test_case_j_medication_mismatch_detected():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Kê đơn Paracetamol 500mg", "clinician")
    item = SoapItem(item_id="P1", text="Kê đơn Ibuprofen 500mg", cap_ids=["C1"])

    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "medication_mismatch" for v in violations)


# CASE K: Numeric / dosage / unit mismatch -> remains safety blocking
def test_case_k_dosage_mismatch_remains_blocking():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician")
    item = SoapItem(item_id="P1", text="Paracetamol 1000 mg", cap_ids=["C1"])

    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "dosage_mismatch" for v in violations)


# CASE L: Unsupported diagnosis -> remains blocked
def test_case_l_unsupported_diagnosis_remains_blocked():
    cap = make_cap("C1", "Problem", "buồn nôn", "Ghi nhận buồn nôn", "clinician")
    item = SoapItem(item_id="A1", text="Chẩn đoán: viêm phổi", cap_ids=["C1"])

    violations = check_item_safety(item, "A", [cap])
    assert any(v.code == "unsupported_diagnosis" for v in violations)


# CASE M: Important negative finding -> preserved
def test_case_m_important_negative_finding_preserved():
    c1 = make_cap("C1", "ExamFinding", "Lachman", "Nghiệm pháp Lachman âm tính", "clinician", verification_status="negated")
    item = SoapItem(item_id="O1", text="Khám gối: Nghiệm pháp Lachman âm tính", cap_ids=["C1"])

    violations = check_item_safety(item, "O", [c1])
    assert not violations


# CASE N: Duration / frequency / severity modifier -> preserved
def test_case_n_core_tokens_extractor():
    c1 = make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối trái 3 tuần nay", "patient")
    tokens = _extract_core_concept_tokens(c1)
    assert "đau" in tokens or "gối" in tokens or "3" in tokens or "tuần" in tokens


# CASE O: Patient-reported vs clinician-observed distinction -> preserved
def test_case_o_patient_reported_rejected_in_o():
    c1 = make_cap("C1", "ChiefComplaint", "đau đầu", "Đau đầu từ sáng", "patient")
    item = SoapItem(item_id="O1", text="Đau đầu từ sáng", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c1], generated=True)
    assert exc_info.value.code == "objective_source"


# CASE P: CAP coverage -> usable CAPs filtering works cleanly
def test_case_p_usable_caps_filtering():
    c1 = make_cap("C1", "ChiefComplaint", "đau đầu", "Đau đầu từ sáng", "patient", resolution_status="current")
    c2 = make_cap("C2", "ChiefComplaint", "đau đầu", "Đau nhẹ", "patient", resolution_status="superseded")

    usable = filter_usable_caps([c1, c2])
    assert len(usable) == 1
    assert usable[0].prop_id == "C1"


# CASE Q: Superseded / needs_review CAPs -> not incorrectly rendered
def test_case_q_superseded_cap_linking_raises():
    c1 = make_cap("C1", "ChiefComplaint", "đau đầu", "Đau nhẹ", "patient", resolution_status="superseded")
    c2 = make_cap("C2", "ChiefComplaint", "đau đầu", "Đau nặng", "patient", resolution_status="current")

    item = SoapItem(item_id="S1", text="Đau nhẹ", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c1, c2], generated=True)
    assert exc_info.value.code == "invalid_cap_link"

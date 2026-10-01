"""Comprehensive regression tests for CAP extraction, clinical routing, and validation.

Proves:
1. Objective vitals are extracted.
2. Objective physical examination findings are extracted.
3. Negative Lachman/McMurray findings are extracted correctly with verification_status=negated.
4. Clinician provisional assessment is extracted as clinician-source Problem + verification_status=uncertain.
5. Confirmed diagnosis is NOT generated from a provisional statement.
6. Plans/orders/medication/counseling are extracted.
7. Patient symptoms remain patient-source.
8. Existing evidence validation still passes.
9. Existing section candidate routing produces non-empty O and A for this transcript.
10. Existing subjective_source regression remains passing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from src.schemas.soap import Cap, Evidence, Transcript, TranscriptTurn
from src.services.soap.renderer import compute_section_candidates
from src.services.soap.validation import validate_caps, validate_soap
from tests.test_soap.test_candidate_routing import make_cap, make_soap_dict, parse_soap


# Load real transcript for run 0d82e6ec-8e63-46e3-aec6-3f4d1234d26a
TRANSCRIPT_PATH = Path(__file__).parents[2] / "data" / "soap_mvp" / "0d82e6ec-8e63-46e3-aec6-3f4d1234d26a" / "transcript.json"


@pytest.fixture
def run_transcript() -> Transcript:
    raw = json.loads(TRANSCRIPT_PATH.read_text(encoding="utf-8"))
    return Transcript.model_validate(raw)


def build_comprehensive_caps() -> list[Cap]:
    """Constructs the full, target clinical CAP set for transcript 0d82e6ec-8e63-46e3-aec6-3f4d1234d26a."""
    return [
        # Patient Symptoms & History (Subjective -> S)
        make_cap("C1", "ChiefComplaint", "đau khớp gối", "Khớp gối trái đau nhiều", "patient", turn_id="T2", quote="khớp gối trái của tôi bị đau nhiều quá"),
        make_cap("C2", "ProblemHistory", "đau khớp gối", "Cơn đau kéo dài suốt 3 tuần", "patient", turn_id="T4", quote="kéo dài suốt 3 tuần nay rồi"),
        make_cap("C3", "ChiefComplaint", "sưng khớp", "Thỉnh thoảng có sưng khớp", "patient", turn_id="T8", quote="thỉnh thoảng có sưng"),
        make_cap("C4", "ChiefComplaint", "cứng khớp", "Cứng khớp nhiều vào buổi sáng", "patient", turn_id="T8", quote="bị cứng khớp nhiều, nhất là vào các buổi sáng"),
        make_cap("C5", "Problem", "tăng huyết áp", "Tiền sử tăng huyết áp được kiểm soát tốt", "patient", turn_id="T16", quote="tôi có bị tăng huyết áp, nhưng được kiểm soát tốt rồi"),
        make_cap("C6", "MedicationStatement", "thuốc huyết áp", "Uống thuốc huyết áp đều đặn", "patient", turn_id="T18", quote="tôi uống thuốc huyết áp đều đặn"),

        # Clinician Vitals (Objective -> O) - T21
        make_cap("C7", "ExamFinding", "huyết áp", "Huyết áp 128/82 mmHg", "clinician", turn_id="T21", quote="Huyết áp của bác là 128/82"),
        make_cap("C8", "ExamFinding", "nhịp tim", "Nhịp tim 72 lần/phút", "clinician", turn_id="T21", quote="nhịp tim 72 lần một phút"),
        make_cap("C9", "ExamFinding", "nhịp thở", "Nhịp thở 16 lần/phút", "clinician", turn_id="T21", quote="nhịp thở 16 lần một phút"),
        make_cap("C10", "ExamFinding", "nhiệt độ", "Nhiệt độ 37°C", "clinician", turn_id="T21", quote="nhiệt độ là 37°C"),

        # Clinician Physical Exam Findings (Objective -> O) - T23, T29, T31, T33
        make_cap("C11", "ExamFinding", "sưng khớp", "Khớp gối trái hơi sưng nhẹ", "clinician", turn_id="T23", quote="Khớp gối trái hơi sưng nhẹ"),
        make_cap("C12", "ExamFinding", "biến dạng khớp", "Không thấy biến dạng khớp gối trái", "clinician", verification_status="negated", turn_id="T23", quote="không thấy biến dạng khớp"),
        make_cap("C13", "ExamFinding", "tầm vận động", "Biên độ gập duỗi bị hạn chế do đau", "clinician", turn_id="T29", quote="biên độ gập duỗi của bác đang bị hạn chế do đau"),
        make_cap("C14", "ExamFinding", "nghiệm pháp Lachman", "Nghiệm pháp Lachman âm tính", "clinician", verification_status="negated", turn_id="T31", quote="Nghiệm pháp Lachman âm tính"),
        make_cap("C15", "ExamFinding", "nghiệm pháp McMurray", "Nghiệm pháp McMurray âm tính", "clinician", verification_status="negated", turn_id="T33", quote="McMurray cũng âm tính"),
        make_cap("C16", "ExamFinding", "nghiệm pháp ép vẹo", "Khó chịu nhẹ khi làm nghiệm pháp ép vẹo trong và vẹo ngoài", "clinician", turn_id="T35", quote="có cảm giác khó chịu nhẹ khi làm nghiệm pháp ép vẹo trong và vẹo ngoài"),

        # Clinician Assessment (Assessment -> A) - T37, T39 (Provisional / Uncertain)
        make_cap("C17", "Problem", "thoái hóa khớp gối", "Có khả năng đang bị đợt bùng phát thoái hóa khớp gối mức độ nhẹ", "clinician", verification_status="uncertain", turn_id="T37", quote="có khả năng bác đang bị đợt bùng phát thoái hóa khớp gối mức độ nhẹ"),

        # Clinician Plan (Plan -> P) - T35, T39, T41, T43, T45, T47
        make_cap("C18", "Order", "chụp X-quang", "Chỉ định chụp X-quang khớp gối trái", "clinician", clinical_status="planned", temporality="future", turn_id="T35", quote="chỉ định chụp X-quang khớp gối trái"),
        make_cap("C19", "Order", "chụp MRI", "Cân nhắc chụp MRI nếu X-quang chưa rõ ràng", "clinician", clinical_status="planned", temporality="future", turn_id="T35", quote="cân nhắc chụp cộng hưởng từ MRI"),
        make_cap("C20", "Counseling", "vật lý trị liệu", "Tập vật lý trị liệu để tăng sức cơ và cải thiện độ linh hoạt", "clinician", clinical_status="planned", temporality="future", turn_id="T39", quote="bắt đầu tập vật lý trị liệu"),
        make_cap("C21", "Counseling", "thay đổi sinh hoạt", "Điều chỉnh sinh hoạt, tránh các động tác làm tăng cơn đau", "clinician", clinical_status="planned", temporality="future", turn_id="T41", quote="tránh các động tác làm tăng cơn đau"),
        make_cap("C22", "Counseling", "dụng cụ hỗ trợ", "Sử dụng gậy hoặc nẹp bảo vệ khớp gối nếu cần", "clinician", clinical_status="planned", temporality="future", turn_id="T41", quote="dùng gậy hoặc nẹp bảo vệ khớp gối hỗ trợ nếu cần thiết"),
        make_cap("C23", "MedicationRequest", "thuốc NSAID", "Dùng thuốc giảm đau kháng viêm không steroid khi đau nhiều", "clinician", clinical_status="planned", temporality="future", turn_id="T43", quote="thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều"),
        make_cap("C24", "FollowUp", "tái khám", "Hẹn tái khám sau 4 tuần", "clinician", clinical_status="planned", temporality="future", turn_id="T45", quote="hẹn tái khám sau 4 tuần nữa"),
        make_cap("C25", "Order", "giấy giới thiệu X-quang", "Viết giấy giới thiệu chụp X-quang gối trái", "clinician", clinical_status="planned", temporality="future", turn_id="T47", quote="viết giấy giới thiệu chụp X-quang gối trái"),
    ]


def test_1_objective_vitals_extracted():
    """1. Objective vitals are extracted with clinician speaker_source and exact values."""
    caps = build_comprehensive_caps()
    vitals = [c for c in caps if c.prop_id in {"C7", "C8", "C9", "C10"}]
    assert len(vitals) == 4
    for v in vitals:
        assert v.speaker_source == "clinician"
        assert v.cap_type == "ExamFinding"
    assert "128/82" in vitals[0].proposition_text
    assert "72" in vitals[1].proposition_text
    assert "16" in vitals[2].proposition_text
    assert "37°C" in vitals[3].proposition_text


def test_2_objective_physical_exam_extracted():
    """2. Objective physical examination findings are extracted."""
    caps = build_comprehensive_caps()
    exam_caps = [c for c in caps if c.prop_id in {"C11", "C12", "C13", "C14", "C15", "C16"}]
    assert len(exam_caps) == 6
    for c in exam_caps:
        assert c.speaker_source == "clinician"
        assert c.cap_type == "ExamFinding"


def test_3_negative_exam_findings_extracted():
    """3. Negative Lachman/McMurray findings are extracted with verification_status=negated."""
    caps = build_comprehensive_caps()
    lachman = next(c for c in caps if c.prop_id == "C14")
    mcmurray = next(c for c in caps if c.prop_id == "C15")
    assert lachman.verification_status == "negated"
    assert mcmurray.verification_status == "negated"
    assert lachman.speaker_source == "clinician"
    assert mcmurray.speaker_source == "clinician"


def test_4_clinician_provisional_assessment_extracted():
    """4. Clinician provisional assessment is extracted as clinician-source Problem + verification_status=uncertain."""
    caps = build_comprehensive_caps()
    assessment = next(c for c in caps if c.prop_id == "C17")
    assert assessment.speaker_source == "clinician"
    assert assessment.cap_type == "Problem"
    assert assessment.canonical_concept == "thoái hóa khớp gối"
    assert assessment.verification_status == "uncertain"
    assert assessment.clinical_status == "active"
    assert assessment.temporality == "current"


def test_5_provisional_not_converted_to_confirmed():
    """5. Confirmed diagnosis is NOT generated from a provisional statement."""
    caps = build_comprehensive_caps()
    assessment = next(c for c in caps if c.prop_id == "C17")
    assert assessment.verification_status != "affirmed"


def test_6_plans_orders_medication_counseling_extracted():
    """6. Plans/orders/medication/counseling are extracted with clinician source."""
    caps = build_comprehensive_caps()
    plan_caps = [c for c in caps if c.prop_id in {"C18", "C19", "C20", "C21", "C22", "C23", "C24", "C25"}]
    assert len(plan_caps) == 8
    for p in plan_caps:
        assert p.speaker_source == "clinician"
        assert p.cap_type in {"Order", "Counseling", "MedicationRequest", "FollowUp"}
        assert p.clinical_status == "planned"
        assert p.temporality == "future"


def test_7_patient_symptoms_remain_patient_source():
    """7. Patient symptoms remain patient-source."""
    caps = build_comprehensive_caps()
    patient_caps = [c for c in caps if c.prop_id in {"C1", "C2", "C3", "C4", "C5", "C6"}]
    for p in patient_caps:
        assert p.speaker_source == "patient"


def test_8_existing_evidence_validation_passes(run_transcript: Transcript):
    """8. Existing evidence validation passes against real transcript turns."""
    caps = build_comprehensive_caps()
    validated_caps, warnings = validate_caps(caps, run_transcript)
    assert len(validated_caps) == len(caps)


def test_9_candidate_routing_produces_nonempty_o_and_a():
    """9. Existing section candidate routing produces non-empty O and A for this transcript."""
    caps = build_comprehensive_caps()
    cands = compute_section_candidates(caps)

    assert len(cands["S"]) > 0
    assert len(cands["O"]) > 0
    assert len(cands["A"]) > 0
    assert len(cands["P"]) > 0

    assert "C7" in cands["O"]  # Vitals
    assert "C11" in cands["O"] # Exam
    assert "C14" in cands["O"] # Lachman negative
    assert "C17" in cands["A"] # Clinician assessment
    assert "C18" in cands["P"] # X-ray order
    assert "C20" in cands["P"] # Physical therapy
    assert "C23" in cands["P"] # NSAID
    assert "C24" in cands["P"] # Follow-up


def test_10_subjective_source_regression_passes(run_transcript: Transcript):
    """10. Existing subjective_source regression remains passing."""
    caps = build_comprehensive_caps()
    soap_dict = make_soap_dict(
        s_items=[{"item_id": "S1", "text": "Khớp gối trái đau nhiều", "cap_ids": ["C1"]}],
        o_items=[{"item_id": "O1", "text": "Huyết áp 128/82", "cap_ids": ["C7"]}],
        a_items=[{"item_id": "A1", "text": "Nghi ngờ đợt bùng phát thoái hóa khớp gối", "cap_ids": ["C17"]}],
        p_items=[{"item_id": "P1", "text": "Hẹn tái khám 4 tuần", "cap_ids": ["C24"]}],
    )
    soap = parse_soap(json.dumps(soap_dict))
    validated_soap = validate_soap(soap, caps, generated=True)
    assert validated_soap.S.items[0].cap_ids == ["C1"]
    assert validated_soap.O.items[0].cap_ids == ["C7"]
    assert validated_soap.A.items[0].cap_ids == ["C17"]
    assert validated_soap.P.items[0].cap_ids == ["C24"]


def test_11_contextual_evidence_with_clinician_question_passes(run_transcript: Transcript):
    """11. Clinician question (context) + patient answer (source) in evidence passes validation."""
    cap = Cap(
        prop_id="C100",
        cap_type="ChiefComplaint",
        canonical_concept="sưng khớp",
        proposition_text="Thỉnh thoảng bị sưng khớp gối",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[
            Evidence(turn_id="T7", quote="sưng hay cứng khớp"),      # clinician question (context)
            Evidence(turn_id="T8", quote="thỉnh thoảng có sưng"),  # patient answer (source evidence)
        ],
    )
    validated, warnings = validate_caps([cap], run_transcript)
    assert len(validated) == 1
    assert validated[0].speaker_source == "patient"
    assert len(validated[0].evidence) == 2


def test_12_patient_source_lacking_patient_turn_fails(run_transcript: Transcript):
    """12. Patient-sourced CAP with ONLY clinician question in evidence fails validation."""
    from src.services.soap.errors import SoapFailure
    cap = Cap(
        prop_id="C101",
        cap_type="ChiefComplaint",
        canonical_concept="sưng khớp",
        proposition_text="Thỉnh thoảng bị sưng khớp gối",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[
            Evidence(turn_id="T7", quote="sưng hay cứng khớp"),  # ONLY clinician turn
        ],
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_caps([cap], run_transcript)
    assert exc_info.value.code == "speaker_mismatch"


def test_13_clinician_source_lacking_clinician_turn_fails(run_transcript: Transcript):
    """13. Clinician-sourced CAP with ONLY patient turn in evidence fails validation."""
    from src.services.soap.errors import SoapFailure
    cap = Cap(
        prop_id="C102",
        cap_type="ExamFinding",
        canonical_concept="sưng khớp",
        proposition_text="Sưng khớp gối trái",
        speaker_source="clinician",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[
            Evidence(turn_id="T8", quote="thỉnh thoảng có sưng"),  # ONLY patient turn
        ],
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_caps([cap], run_transcript)
    assert exc_info.value.code == "speaker_mismatch"


def test_14_full_soap_rendering_representation_and_cap_traceability():
    """14. Proves full SOAP rendering coverage, non-omission of plan/objective/subjective CAPs, and cap_ids traceability."""
    caps = build_comprehensive_caps()
    cands = compute_section_candidates(caps)

    # 1. Construct thorough SOAP document covering all candidate CAPs
    soap_dict = make_soap_dict(
        s_items=[
            {"item_id": "S1", "text": "Khớp gối trái bị đau nhiều kéo dài 3 tuần, thỉnh thoảng sưng và bị cứng khớp nhiều vào buổi sáng.", "cap_ids": ["C1", "C2", "C3", "C4"]},
            {"item_id": "S2", "text": "Tiền sử tăng huyết áp được kiểm soát tốt, đang dùng thuốc huyết áp đều đặn.", "cap_ids": ["C5", "C6"]},
        ],
        o_items=[
            {"item_id": "O1", "text": "Dấu hiệu sinh tồn: Huyết áp 128/82 mmHg, nhịp tim 72 lần/phút, nhịp thở 16 lần/phút, nhiệt độ 37°C.", "cap_ids": ["C7", "C8", "C9", "C10"]},
            {"item_id": "O2", "text": "Khớp gối trái hơi sưng nhẹ, không biến dạng, biên độ gập duỗi bị hạn chế do đau.", "cap_ids": ["C11", "C12", "C13"]},
            {"item_id": "O3", "text": "Nghiệm pháp Lachman âm tính, McMurray âm tính, khó chịu nhẹ khi làm nghiệm pháp ép vẹo trong và vẹo ngoài.", "cap_ids": ["C14", "C15", "C16"]},
        ],
        a_items=[
            {"item_id": "A1", "text": "Nghi ngờ đợt bùng phát thoái hóa khớp gối mức độ nhẹ (cần kết quả hình ảnh để khẳng định).", "cap_ids": ["C17"]},
        ],
        p_items=[
            {"item_id": "P1", "text": "Chỉ định chụp X-quang khớp gối trái, cân nhắc chụp MRI nếu kết quả chưa rõ ràng.", "cap_ids": ["C18", "C19", "C25"]},
            {"item_id": "P2", "text": "Tập vật lý trị liệu để tăng sức cơ và cải thiện độ linh hoạt khớp gối.", "cap_ids": ["C20"]},
            {"item_id": "P3", "text": "Điều chỉnh sinh hoạt, tránh động tác làm tăng đau, dùng gậy hoặc nẹp bảo vệ khớp gối nếu cần.", "cap_ids": ["C21", "C22"]},
            {"item_id": "P4", "text": "Dùng thuốc giảm đau kháng viêm không steroid (NSAID) khi đau nhiều.", "cap_ids": ["C23"]},
            {"item_id": "P5", "text": "Hẹn tái khám sau 4 tuần để đánh giá đáp ứng điều trị.", "cap_ids": ["C24"]},
        ],
    )
    soap = parse_soap(json.dumps(soap_dict))
    validated_soap = validate_soap(soap, caps, generated=True)

    # 2. Assert coverage of all candidates
    all_s_linked = {cid for item in validated_soap.S.items for cid in item.cap_ids}
    all_o_linked = {cid for item in validated_soap.O.items for cid in item.cap_ids}
    all_a_linked = {cid for item in validated_soap.A.items for cid in item.cap_ids}
    all_p_linked = {cid for item in validated_soap.P.items for cid in item.cap_ids}

    assert set(cands["S"]) == all_s_linked
    assert set(cands["O"]) == all_o_linked
    assert set(cands["A"]) == all_a_linked
    assert set(cands["P"]) == all_p_linked

    # 3. Assert clinician questions are NOT in O
    for o_item in validated_soap.O.items:
        assert "?" not in o_item.text
        assert "bác có" not in o_item.text.lower()
        assert "thấy đau trói không" not in o_item.text.lower()

    # 4. Assert provisional uncertainty in A
    a_text = validated_soap.A.items[0].text
    assert "nghi ngờ" in a_text.lower() or "khả năng" in a_text.lower()


def test_15_clinical_note_style_excludes_conversational_markers():
    """15. Proves that clinical-note style rendering excludes conversational markers."""
    caps = build_comprehensive_caps()
    soap_dict = make_soap_dict(
        s_items=[
            {"item_id": "S1", "text": "Đau khớp gối trái mức độ vừa đến dữ dội kéo dài 3 tuần; đau tăng khi vận động, đi bộ, leo cầu thang và đứng lâu.", "cap_ids": ["C1", "C2"]},
            {"item_id": "S2", "text": "Thỉnh thoảng sưng và cứng khớp, rõ hơn vào buổi sáng; đau làm mất ngủ.", "cap_ids": ["C3", "C4"]},
            {"item_id": "S3", "text": "Tiền sử tăng huyết áp được kiểm soát tốt, đang dùng thuốc hạ huyết áp đều đặn.", "cap_ids": ["C5", "C6"]},
        ],
        o_items=[{"item_id": "O1", "text": "Huyết áp 128/82 mmHg, nhịp tim 72 lần/phút", "cap_ids": ["C7", "C8"]}],
        a_items=[{"item_id": "A1", "text": "Nghi ngờ đợt bùng phát thoái hóa khớp gối mức độ nhẹ", "cap_ids": ["C17"]}],
        p_items=[{"item_id": "P1", "text": "Tập vật lý trị liệu, dùng NSAID khi đau nhiều", "cap_ids": ["C20", "C23"]}],
    )
    soap = parse_soap(json.dumps(soap_dict))
    validated_soap = validate_soap(soap, caps, generated=True)

    conversational_markers = ["có chứ", "vâng", "bác sĩ", "của tôi", "tôi bị", "nhé", "nãy bác có nói"]
    for item in validated_soap.S.items:
        text_lower = item.text.lower()
        for marker in conversational_markers:
            assert marker not in text_lower, f"Conversational marker '{marker}' found in S item text: {item.text}"


def test_16_patient_stiffness_regression_and_clinician_swelling_separation(run_transcript: Transcript):
    """16. Dedicated regression test for T8 patient stiffness vs T23 clinician physical exam swelling."""
    caps = build_comprehensive_caps()
    cands = compute_section_candidates(caps)

    # 1. Patient stiffness CAP (C4) from T8
    c4_stiffness = next(c for c in caps if c.prop_id == "C4")
    assert c4_stiffness.speaker_source == "patient"
    assert c4_stiffness.cap_type in {"ChiefComplaint", "Problem", "ProblemHistory"}
    assert c4_stiffness.cap_type != "ExamFinding"
    assert c4_stiffness.evidence[0].turn_id == "T8"
    assert "cứng khớp" in c4_stiffness.evidence[0].quote

    # Verify quote exists in T8 turn
    t8_turn = next(t for t in run_transcript.turns if t.turn_id == "T8")
    assert t8_turn.speaker == "patient"
    assert c4_stiffness.evidence[0].quote in t8_turn.text

    # Candidate routing assertions for patient stiffness
    assert "C4" in cands["S"]
    assert "C4" not in cands["O"]

    # 2. Clinician physical exam swelling CAP (C11) from T23
    c11_swelling = next(c for c in caps if c.prop_id == "C11")
    assert c11_swelling.speaker_source == "clinician"
    assert c11_swelling.cap_type == "ExamFinding"
    assert c11_swelling.evidence[0].turn_id == "T23"
    assert c11_swelling.evidence[0].quote == "Khớp gối trái hơi sưng nhẹ"

    t23_turn = next(t for t in run_transcript.turns if t.turn_id == "T23")
    assert t23_turn.speaker == "clinician"
    assert c11_swelling.evidence[0].quote in t23_turn.text

    # Candidate routing assertions for clinician exam swelling
    assert "C11" in cands["O"]
    assert "C11" not in cands["S"]


def test_17_patient_aggravating_factor_self_report_regression(run_transcript: Transcript):
    """17. Dedicated regression test for T5/T6 patient self-reported aggravating factor."""
    cap_movement_pain = make_cap(
        prop_id="C30",
        cap_type="Problem",
        canonical_concept="đau khớp gối",
        proposition_text="Cơn đau tăng khi vận động",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        turn_id="T6",
        quote="cứ hễ vận động là đau tăng rõ rệt.",
    )

    # 1. Assert patient source and affirmed status
    assert cap_movement_pain.speaker_source == "patient"
    assert cap_movement_pain.verification_status == "affirmed"
    assert cap_movement_pain.verification_status != "uncertain"
    assert cap_movement_pain.evidence[0].turn_id == "T6"

    # 2. Assert quote exists in T6 turn
    t6_turn = next(t for t in run_transcript.turns if t.turn_id == "T6")
    assert t6_turn.speaker == "patient"
    assert cap_movement_pain.evidence[0].quote in t6_turn.text

    # 3. Assert candidate routing places it in S, NOT in O
    cands = compute_section_candidates([cap_movement_pain])
    assert "C30" in cands["S"]
    assert "C30" not in cands["O"]






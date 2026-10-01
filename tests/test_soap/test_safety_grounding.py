"""Phase 5 Unit Tests: Deterministic Safety & Grounding Engine."""

from __future__ import annotations

import pytest

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.semantic_validator import check_item_safety
from src.services.soap.validation import validate_soap


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
    turn_id: str = "turn_1",
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


# TEST 1: Numbers match -> PASS
def test_numbers_match_pass():
    cap = make_cap("C1", "ExamFinding", "Đường huyết", "Đường huyết 120 mg/dL", "clinician", quote="Đường huyết 120 mg/dL")
    item = SoapItem(item_id="O1", text="Đường huyết 120 mg/dL", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "pending"


# TEST 2: Numbers mismatch -> unsupported / warning
def test_numbers_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "Đường huyết", "Đường huyết 120 mg/dL", "clinician", quote="Đường huyết 120 mg/dL")
    item = SoapItem(item_id="O1", text="Đường huyết 180 mg/dL", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"


# TEST 3: Dosage match -> PASS
def test_dosage_match_pass():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician", quote="Paracetamol 500 mg")
    item = SoapItem(item_id="P1", text="Paracetamol 500 mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "pending"


# TEST 4: Dosage mismatch -> dosage_mismatch
def test_dosage_mismatch_detected():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician", quote="Paracetamol 500 mg")
    item = SoapItem(item_id="P1", text="Paracetamol 1000 mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "dosage_mismatch" for v in violations)


# TEST 5: Units mismatch -> units-related violation
def test_units_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "Huyết áp", "Huyết áp 120 mmHg", "clinician", quote="Huyết áp 120 mmHg")
    item = SoapItem(item_id="O1", text="Huyết áp 120 kg", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code in {"units_mismatch", "numbers_mismatch"} for v in violations)


# TEST 6: Medication match -> PASS
def test_medication_match_pass():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Cho uống Paracetamol 500 mg", "clinician", quote="Cho uống Paracetamol 500 mg")
    item = SoapItem(item_id="P1", text="Cho uống Paracetamol 500 mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "pending"


# TEST 7: Medication mismatch -> medication_mismatch
def test_medication_mismatch_detected():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Cho uống Paracetamol 500 mg", "clinician", quote="Cho uống Paracetamol 500 mg")
    item = SoapItem(item_id="P1", text="Cho uống Ibuprofen 500 mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "medication_mismatch" for v in violations)


# TEST 8: Blood pressure mismatch -> detected
def test_blood_pressure_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "Huyết áp", "HA 120/80 mmHg", "clinician", quote="HA 120/80 mmHg")
    item = SoapItem(item_id="O1", text="HA 150/90 mmHg", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code == "bp_mismatch" for v in violations)


# TEST 9: Heart rate mismatch -> detected
def test_heart_rate_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "Mạch", "Mạch 80 lần/phút", "clinician", quote="Mạch 80 lần/phút")
    item = SoapItem(item_id="O1", text="Mạch 110 lần/phút", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code == "heart_rate_mismatch" for v in violations)


# TEST 10: Temperature mismatch -> detected
def test_temperature_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "Thân nhiệt", "Nhiệt độ 37.5 độ C", "clinician", quote="Nhiệt độ 37.5 độ C")
    item = SoapItem(item_id="O1", text="Nhiệt độ 39.0 độ C", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code == "temperature_mismatch" for v in violations)


# TEST 11: SpO2 mismatch -> detected
def test_spo2_mismatch_detected():
    cap = make_cap("C1", "ExamFinding", "SpO2", "SpO2 98%", "clinician", quote="SpO2 98%")
    item = SoapItem(item_id="O1", text="SpO2 88%", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code == "spo2_mismatch" for v in violations)


# TEST 12: Lab value mismatch -> detected
def test_lab_value_mismatch_detected():
    cap = make_cap("C1", "TestResult", "Đường huyết", "đường huyết 120 mg/dL", "clinician", quote="đường huyết 120 mg/dL")
    item = SoapItem(item_id="O1", text="đường huyết 200 mg/dL", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.O.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "O", [cap])
    assert any(v.code == "lab_value_mismatch" for v in violations)


# TEST 13: Affirmed vs negated contradiction -> negation_contradiction
def test_affirmed_vs_negated_contradiction():
    cap = make_cap("C1", "Problem", "Dị ứng Penicillin", "Không dị ứng penicillin", "patient", verification_status="negated", quote="khai không dị ứng")
    item = SoapItem(item_id="S1", text="Bệnh nhân dị ứng penicillin", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "negation_contradiction" for v in violations)


# TEST 14: Negated vs affirmed contradiction -> negation_contradiction
def test_negated_vs_affirmed_contradiction():
    cap = make_cap("C1", "Problem", "Đau ngực", "Bệnh nhân đau ngực", "patient", verification_status="affirmed", quote="tôi đau ngực")
    item = SoapItem(item_id="S1", text="Bệnh nhân không đau ngực", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "negation_contradiction" for v in violations)


# TEST 15: Past vs current contradiction -> temporality_contradiction
def test_past_vs_current_contradiction():
    cap = make_cap("C1", "ProblemHistory", "Đau dạ dày", "Đã từng đau dạ dày năm ngoái", "patient", temporality="past", quote="năm ngoái bị đau dạ dày")
    item = SoapItem(item_id="S1", text="Hiện tại bệnh nhân đau dạ dày cấp", cap_ids=["C1"])
    soap = make_soap(s_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "S", [cap])
    assert any(v.code == "temporality_contradiction" for v in violations)


# TEST 16: Future vs completed/current contradiction -> temporality_contradiction
def test_future_vs_completed_contradiction():
    cap = make_cap("C1", "FollowUp", "Tái khám", "Khám lại tuần sau", "clinician", temporality="future", clinical_status="planned", quote="tuần sau tái khám")
    item = SoapItem(item_id="P1", text="Đã tái khám tuần trước", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "P", [cap])
    assert any(v.code == "temporality_contradiction" for v in violations)


# TEST 17: Unsupported diagnosis -> unsupported_diagnosis
def test_unsupported_diagnosis_detected():
    cap = make_cap("C1", "Problem", "Đau đầu", "Bệnh nhân đau đầu", "clinician", quote="bệnh nhân bị đau đầu")
    item = SoapItem(item_id="A1", text="Chẩn đoán viêm màng não", cap_ids=["C1"])
    soap = make_soap(a_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.A.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "A", [cap])
    assert any(v.code == "unsupported_diagnosis" for v in violations)


# TEST 18: Unsupported treatment -> unsupported_treatment
def test_unsupported_treatment_detected():
    cap = make_cap("C1", "MedicationRequest", "Nghỉ ngơi", "Khuyên nghỉ ngơi tại nhà", "clinician", quote="khuyên nghỉ ngơi")
    item = SoapItem(item_id="P1", text="Cho bệnh nhân uống amoxicillin 500mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "unsupported"
    violations = check_item_safety(item, "P", [cap])
    assert any(v.code in {"unsupported_treatment", "numbers_mismatch"} for v in violations)


# TEST 19: Valid clinician assessment -> no false-positive
def test_valid_clinician_assessment_pass():
    cap = make_cap("C1", "Problem", "Viêm họng cấp", "Nghi ngờ viêm họng cấp", "clinician", quote="nghi viêm họng cấp")
    item = SoapItem(item_id="A1", text="Nghi ngờ viêm họng cấp", cap_ids=["C1"])
    soap = make_soap(a_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.A.items[0].support_status == "pending"


# TEST 20: Valid clinician treatment plan -> no false-positive
def test_valid_clinician_treatment_plan_pass():
    cap = make_cap("C1", "MedicationRequest", "Amoxicillin 500mg", "Kê đơn amoxicillin 500mg", "clinician", quote="kê amoxicillin 500mg")
    item = SoapItem(item_id="P1", text="Kê đơn amoxicillin 500mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "pending"


# TEST 21: SOAP item without CAP link -> caught by structural validation
def test_soap_item_without_cap_link():
    item = SoapItem(item_id="S1", text="Bệnh nhân đau đầu", cap_ids=[])
    soap = make_soap(s_items=[item])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [], generated=True)

    assert exc_info.value.code == "missing_cap_link"


# TEST 22: Deterministic safety violation DOES NOT trigger LLM repair
def test_safety_violation_no_llm_repair_trigger():
    cap = make_cap("C1", "MedicationRequest", "Paracetamol", "Paracetamol 500 mg", "clinician", quote="Paracetamol 500 mg")
    item = SoapItem(item_id="P1", text="Paracetamol 1000 mg", cap_ids=["C1"])
    soap = make_soap(p_items=[item])

    # validate_soap completes without raising invalid_model_output (which triggers LLM repair)
    validated = validate_soap(soap, [cap], generated=True)
    assert validated.P.items[0].support_status == "unsupported"


# TEST 23: CAP evidence chain is traceable
def test_cap_evidence_chain_traceability():
    turn = make_turn("t1", "clinician", "Bệnh nhân đường huyết 120 mg/dL")
    transcript = Transcript(turns=[turn])
    cap = make_cap("C1", "TestResult", "Đường huyết", "Đường huyết 120 mg/dL", "clinician", turn_id="t1", quote="đường huyết 120 mg/dL")
    item = SoapItem(item_id="O1", text="Đường huyết 120 mg/dL", cap_ids=["C1"])
    soap = make_soap(o_items=[item])

    # SOAP -> cap_ids -> CAP -> evidence -> transcript turn
    assert item.cap_ids == ["C1"]
    assert cap.prop_id == item.cap_ids[0]
    assert cap.evidence[0].turn_id == turn.turn_id
    assert cap.evidence[0].quote.casefold() in turn.text.casefold()

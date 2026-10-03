"""Debug & Trace Mandatory Cases A through F for SOAP Audit Report."""

import sys
sys.stdout.reconfigure(encoding='utf-8')

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.validation import check_item_semantic_coverage, validate_soap, validate_and_partition_caps
from src.services.soap.semantic_validator import check_item_safety, _check_unsupported_claim
from src.services.soap.errors import SoapFailure


def make_turn(turn_id: str, speaker: str, text: str) -> TranscriptTurn:
    return TranscriptTurn(turn_id=turn_id, speaker=speaker, text=text)


def make_cap(prop_id: str, cap_type: str, concept: str, text: str, speaker: str, turn_id: str, quote: str, verif: str = "affirmed") -> Cap:
    return Cap(
        prop_id=prop_id,
        cap_type=cap_type,  # type: ignore
        canonical_concept=concept,
        proposition_text=text,
        speaker_source=speaker,  # type: ignore
        verification_status=verif,  # type: ignore
        evidence=[Evidence(turn_id=turn_id, quote=quote)],
    )


def test_case_a():
    print("\n=================== CASE A: Doctor speaks first ===================")
    t = Transcript(turns=[
        make_turn("T1", "clinician", "Chào bác, bác bị sao vậy?"),
        make_turn("T2", "patient", "Tôi bị đau gối 3 tuần nay."),
    ])
    usable, quarantined, warnings = validate_and_partition_caps([
        make_cap("C1", "ChiefComplaint", "đau gối", "Tôi bị đau gối 3 tuần nay.", "patient", "T2", "Tôi bị đau gối 3 tuần nay.")
    ], t)
    print(f"Usable CAPs: {len(usable)}, Quarantined: {len(quarantined)}, Warnings: {warnings}")


def test_case_b():
    print("\n=================== CASE B: Patient speaks first ===================")
    t = Transcript(turns=[
        make_turn("T1", "patient", "Tôi cảm thấy buồn nôn và chóng mặt từ sáng nay."),
        make_turn("T2", "clinician", "Bác bị như vậy từ khi nào?"),
    ])
    usable, quarantined, warnings = validate_and_partition_caps([
        make_cap("C1", "ChiefComplaint", "buồn nôn", "Cảm thấy buồn nôn từ sáng nay", "patient", "T1", "buồn nôn"),
        make_cap("C2", "ChiefComplaint", "chóng mặt", "Cảm thấy chóng mặt từ sáng nay", "patient", "T1", "chóng mặt"),
    ], t)
    print(f"Usable CAPs: {len(usable)}, Quarantined: {len(quarantined)}, Warnings: {warnings}")


def test_case_c():
    print("\n=================== CASE C: Patient symptoms only, no diagnosis ===================")
    t = Transcript(turns=[
        make_turn("T1", "patient", "Tôi bị buồn nôn và chóng mặt."),
        make_turn("T2", "clinician", "Để tôi kiểm tra."),
    ])
    caps = [
        make_cap("C1", "ChiefComplaint", "buồn nôn", "Bị buồn nôn", "patient", "T1", "buồn nôn"),
        make_cap("C2", "ChiefComplaint", "chóng mặt", "Bị chóng mặt", "patient", "T1", "chóng mặt"),
    ]
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Buồn nôn và chóng mặt", cap_ids=["C1", "C2"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, caps, generated=True)
    print(f"SOAP A missing: {validated.A.missing}, items count: {len(validated.A.items)}")


def test_case_d():
    print("\n=================== CASE D: Doctor explicitly confirms a diagnosis ===================")
    t = Transcript(turns=[
        make_turn("T1", "patient", "Tôi đau gối."),
        make_turn("T2", "clinician", "Bác bị đợt bùng phát thoái hóa khớp gối."),
    ])
    caps = [
        make_cap("C1", "ChiefComplaint", "đau gối", "Đau gối", "patient", "T1", "đau gối"),
        make_cap("C2", "Problem", "thoái hóa khớp gối", "Đợt bùng phát thoái hóa khớp gối", "clinician", "T2", "thoái hóa khớp gối", verif="uncertain"),
    ]
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau gối", cap_ids=["C1"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[SoapItem(item_id="A1", text="Theo dõi đợt bùng phát thoái hóa khớp gối", cap_ids=["C2"])]),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, caps, generated=True)
    print(f"Validated A item support status: {validated.A.items[0].support_status}")


def test_case_e():
    print("\n=================== CASE E: Assessment contains unsupported diagnosis ===================")
    caps = [
        make_cap("C1", "ChiefComplaint", "buồn nôn", "Bị buồn nôn", "patient", "T1", "buồn nôn"),
    ]
    soap_item = SoapItem(item_id="A1", text="Chẩn đoán: Viêm màng não", cap_ids=["C1"])
    violations = check_item_safety(soap_item, "A", caps)
    print(f"Safety violations for unsupported diagnosis 'Viêm màng não': {violations}")

    soap_item_label = SoapItem(item_id="A1", text="Chẩn đoán: Theo dõi buồn nôn", cap_ids=["C1"])
    violations_label = check_item_safety(soap_item_label, "A", caps)
    print(f"Safety violations for label 'chẩn đoán': {violations_label}")


def test_case_f():
    print("\n=================== CASE F: Transcript with partial information ===================")
    t = Transcript(turns=[
        make_turn("T1", "patient", "Tôi mệt mỏi."),
    ])
    caps = [make_cap("C1", "ChiefComplaint", "mệt mỏi", "Mệt mỏi", "patient", "T1", "mệt mỏi")]
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Mệt mỏi", cap_ids=["C1"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, caps, generated=True)
    print(f"Partial SOAP S: {validated.S.items[0].text}, O missing: {validated.O.missing}, A missing: {validated.A.missing}, P missing: {validated.P.missing}")


if __name__ == "__main__":
    test_case_a()
    test_case_b()
    test_case_c()
    test_case_d()
    test_case_e()
    test_case_f()

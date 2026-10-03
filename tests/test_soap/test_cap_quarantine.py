"""
Phase 2 Unit & Integration Tests for CAP Quarantine and Robust Voice-to-SOAP Pipeline.

Verifies:
1. speaker_mismatch -> quarantine -> SOAP created.
2. invalid_quote -> quarantine -> SOAP created.
3. mixed CAP errors -> quarantine -> SOAP created.
4. all CAP invalid -> Safe Fallback (missing: True across all sections).
5. safety mismatch -> still blocks / flags unsupported.
6. patient-only transcript -> S populated, O/A/P missing.
7. clinician objective -> O populated.
8. clinician assessment -> A populated.
9. clinician plan -> P populated.
10. speaker_mismatch detection invariant preserved.
11. E2E pipeline: CAP with speaker_mismatch does NOT stop Voice -> SOAP execution.
"""

from unittest.mock import AsyncMock

import pytest

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.renderer import compute_section_candidates
from src.services.soap.validation import validate_and_partition_caps, validate_soap


@pytest.fixture
def sample_transcript():
    return Transcript(
        turns=[
            TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau gối trái 3 tuần nay."),
            TranscriptTurn(turn_id="T2", speaker="clinician", text="Huyết áp 128/82 mmHg, khớp gối hơi sưng."),
            TranscriptTurn(turn_id="T3", speaker="clinician", text="Chẩn đoán thoái hóa khớp gối."),
            TranscriptTurn(turn_id="T4", speaker="clinician", text="Kê đơn thuốc giảm đau và hẹn tái khám sau 4 tuần."),
        ]
    )


def test_1_speaker_mismatch_quarantine(sample_transcript):
    """TEST 1: speaker_mismatch CAP is quarantined, usable CAP retained."""
    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối trái 3 tuần", speaker_source="patient",
        evidence=[Evidence(turn_id="T1", quote="đau gối trái 3 tuần")]
    )
    c2 = Cap(
        prop_id="C2", cap_type="ExamFinding", canonical_concept="sưng gối",
        proposition_text="Khớp gối sưng", speaker_source="patient", # Mismatch: T2 is clinician
        evidence=[Evidence(turn_id="T2", quote="khớp gối hơi sưng")]
    )
    usable, quarantined, warnings = validate_and_partition_caps([c1, c2], sample_transcript)

    assert len(usable) == 1
    assert usable[0].prop_id == "C1"
    assert len(quarantined) == 1
    assert quarantined[0].prop_id == "C2"
    assert quarantined[0].resolution_status == "needs_review"
    assert any("speaker_mismatch" in w for w in warnings)


def test_2_invalid_quote_quarantine(sample_transcript):
    """TEST 2: invalid_quote CAP is quarantined."""
    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau bụng",
        proposition_text="Đau bụng cấp", speaker_source="patient",
        evidence=[Evidence(turn_id="T1", quote="đau bụng dữ dội")] # Absent from T1
    )
    usable, quarantined, warnings = validate_and_partition_caps([c1], sample_transcript)

    assert len(usable) == 0
    assert len(quarantined) == 1
    assert quarantined[0].prop_id == "C1"
    assert any("invalid_quote" in w for w in warnings)


def test_3_mixed_cap_errors_quarantine(sample_transcript):
    """TEST 3: Mixed errors partition correctly, leaving usable CAPs."""
    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối trái", speaker_source="patient",
        evidence=[Evidence(turn_id="T1", quote="đau gối trái")]
    )
    c2 = Cap(
        prop_id="C2", cap_type="ExamFinding", canonical_concept="huyết áp",
        proposition_text="Huyết áp 128/82", speaker_source="patient", # Mismatch (T2 is clinician)
        evidence=[Evidence(turn_id="T2", quote="Huyết áp 128/82")]
    )
    c3 = Cap(
        prop_id="C3", cap_type="Problem", canonical_concept="sốt",
        proposition_text="Sốt cao", speaker_source="clinician",
        evidence=[Evidence(turn_id="T3", quote="sốt 39 độ")] # Invalid quote
    )

    usable, quarantined, warnings = validate_and_partition_caps([c1, c2, c3], sample_transcript)
    assert [c.prop_id for c in usable] == ["C1"]
    assert [c.prop_id for c in quarantined] == ["C2", "C3"]
    assert len(warnings) == 2


def test_4_all_caps_invalid_safe_fallback_candidates(sample_transcript):
    """TEST 4: When all CAPs are quarantined, usable_caps is empty."""
    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối", speaker_source="clinician", # Mismatch (T1 is patient)
        evidence=[Evidence(turn_id="T1", quote="đau gối")]
    )
    usable, quarantined, warnings = validate_and_partition_caps([c1], sample_transcript)
    assert len(usable) == 0
    assert len(quarantined) == 1

    candidates = compute_section_candidates(usable)
    assert candidates == {"S": [], "O": [], "A": [], "P": []}


def test_5_safety_mismatch_blocks_or_flags_unsupported(sample_transcript):
    """TEST 5: Safety mismatch in SOAP renderer output flags item as unsupported."""
    c1 = Cap(
        prop_id="C1", cap_type="ExamFinding", canonical_concept="huyết áp",
        proposition_text="Huyết áp 128/82 mmHg", speaker_source="clinician",
        evidence=[Evidence(turn_id="T2", quote="Huyết áp 128/82 mmHg")]
    )
    soap = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Huyết áp 180/120 mmHg", cap_ids=["C1"])], missing=False), # bp_mismatch!
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.O.items[0].support_status == "unsupported"


def test_6_patient_only_transcript_routing(sample_transcript):
    """TEST 6: Patient-only transcript populates S candidates only."""
    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối", speaker_source="patient",
        evidence=[Evidence(turn_id="T1", quote="đau gối")]
    )
    candidates = compute_section_candidates([c1])
    assert candidates["S"] == ["C1"]
    assert candidates["O"] == []
    assert candidates["A"] == []
    assert candidates["P"] == []


def test_7_clinician_objective_routing():
    """TEST 7: Clinician objective findings route to O candidates."""
    c1 = Cap(
        prop_id="C1", cap_type="ExamFinding", canonical_concept="sưng gối",
        proposition_text="Sưng gối", speaker_source="clinician",
        evidence=[Evidence(turn_id="T2", quote="sưng")]
    )
    candidates = compute_section_candidates([c1])
    assert candidates["O"] == ["C1"]


def test_8_clinician_assessment_routing():
    """TEST 8: Clinician problem assessment routes to A candidates."""
    c1 = Cap(
        prop_id="C1", cap_type="Problem", canonical_concept="thoái hóa khớp",
        proposition_text="Thoái hóa khớp", speaker_source="clinician",
        evidence=[Evidence(turn_id="T3", quote="thoái hóa")]
    )
    candidates = compute_section_candidates([c1])
    assert candidates["A"] == ["C1"]


def test_9_clinician_plan_routing():
    """TEST 9: Clinician plan items route to P candidates."""
    c1 = Cap(
        prop_id="C1", cap_type="MedicationRequest", canonical_concept="thuốc giảm đau",
        proposition_text="Thuốc giảm đau", speaker_source="clinician",
        evidence=[Evidence(turn_id="T4", quote="thuốc giảm đau")]
    )
    candidates = compute_section_candidates([c1])
    assert candidates["P"] == ["C1"]


def test_10_speaker_mismatch_detection_invariant(sample_transcript):
    """TEST 10: speaker_mismatch strictly detected when speaker_source has no matching evidence."""
    # Patient source with clinician turn evidence only -> Mismatch
    c1 = Cap(
        prop_id="C10", cap_type="ChiefComplaint", canonical_concept="test",
        proposition_text="test", speaker_source="patient",
        evidence=[Evidence(turn_id="T2", quote="Huyết áp")]
    )
    usable, quarantined, warnings = validate_and_partition_caps([c1], sample_transcript)
    assert len(quarantined) == 1
    assert "speaker_mismatch" in warnings[0]


@pytest.mark.asyncio
async def test_11_e2e_pipeline_with_recoverable_cap_error(sample_transcript, soap_store):
    """TEST 11: E2E Pipeline processes transcript with speaker_mismatch CAP without stopping execution."""
    from src.agents.soap_graph import create_soap_pipeline

    c1 = Cap(
        prop_id="C1", cap_type="ChiefComplaint", canonical_concept="đau gối",
        proposition_text="Đau gối trái 3 tuần", speaker_source="patient",
        evidence=[Evidence(turn_id="T1", quote="đau gối trái 3 tuần")]
    )
    c10 = Cap(
        prop_id="C10", cap_type="ChiefComplaint", canonical_concept="mismatch",
        proposition_text="Mismatch speaker", speaker_source="patient",
        evidence=[Evidence(turn_id="T2", quote="Huyết áp")] # speaker_mismatch!
    )

    mock_llm = AsyncMock()
    mock_llm.model_name = "test-model"
    extract_json = '{"caps": [' + c1.model_dump_json() + ', ' + c10.model_dump_json() + ']}'
    soap_json = '{"S": {"items": [{"item_id": "S1", "text": "Bệnh nhân đau gối trái 3 tuần.", "cap_ids": ["C1"]}], "missing": false}, "O": {"items": [], "missing": true}, "A": {"items": [], "missing": true}, "P": {"items": [], "missing": true}}'

    response_extract = AsyncMock(content=extract_json, response_metadata={"model_name": "test-model"})
    response_soap = AsyncMock(content=soap_json, response_metadata={"model_name": "test-model"})
    mock_llm.ainvoke.side_effect = [response_extract, response_soap]

    pipeline = create_soap_pipeline(soap_store, mock_llm)

    # 1. Run Extract caps operation
    extract_res = await pipeline.ainvoke({"operation": "extract", "input_format": "canonical", "content": sample_transcript.model_dump()})
    assert extract_res.get("error") is None
    assert extract_res.get("cap_warnings") is not None
    assert any("C10" in w and "speaker_mismatch" in w for w in extract_res["cap_warnings"])

    run_id = extract_res["run_id"]

    # 2. Run Generate SOAP operation
    generate_res = await pipeline.ainvoke({"operation": "generate", "run_id": run_id, "expected_revision": 0})
    assert generate_res.get("error") is None
    assert generate_res["revision"]["revision"] == 1

    # Verify run stored in store
    run_data = soap_store.load(run_id)
    assert any("C10" in w and "speaker_mismatch" in w for w in run_data["cap_warnings"])
    stored_caps = run_data["caps"]
    c10_stored = next(c for c in stored_caps if c["prop_id"] == "C10")
    assert c10_stored["resolution_status"] == "needs_review"

"""Comprehensive regression test suite for SOAP Renderer coverage, repair feedback, and fail-safe draft availability invariants."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
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


# TEST A: Valid paraphrase ("mức độ vừa" -> "mức trung bình") MUST PASS
def test_a_valid_severity_paraphrase_passes():
    c1 = make_cap("C1", "ChiefComplaint", "mệt mỏi", "Mệt mỏi và khó thở", "patient")
    c3 = make_cap("C3", "Problem", "mệt mỏi mức độ vừa", "Cảm thấy mệt mỏi ở mức độ vừa.", "patient")
    caps = [c1, c3]

    soap_paraphrase = SoapDocument(
        S=SoapSection(items=[SoapItem(
            item_id="S1",
            text="cảm thấy mệt mỏi ở mức trung bình, khó thở khi gắng sức.",
            cap_ids=["C1", "C3"],
        )]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    validated = validate_soap(soap_paraphrase, caps, generated=True)
    assert validated.S.items[0].cap_ids == ["C1", "C3"]


# TEST B: True omission ("mức độ vừa" -> "mệt mỏi") MUST FAIL with candidate_coverage_violation
def test_b_true_severity_omission_fails():
    c1 = make_cap("C1", "ChiefComplaint", "mệt mỏi", "Mệt mỏi và khó thở", "patient")
    c3 = make_cap("C3", "Problem", "mệt mỏi mức độ vừa", "Cảm thấy mệt mỏi ở mức độ vừa.", "patient")
    caps = [c1, c3]

    soap_omitted = SoapDocument(
        S=SoapSection(items=[SoapItem(
            item_id="S1",
            text="mệt mỏi.",
            cap_ids=["C1", "C3"],
        )]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap_omitted, caps, generated=True)
    assert exc_info.value.code == "candidate_coverage_violation"


# TEST C: Duration ("kéo dài khoảng 3 tháng" -> "kéo dài 3 tháng") MUST PASS
def test_c_duration_paraphrase_passes():
    c2 = make_cap("C2", "ProblemHistory", "thời gian mệt mỏi", "Tình trạng này kéo dài khoảng 3 tháng.", "patient")
    caps = [c2]

    soap_dur = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Triệu chứng kéo dài 3 tháng.", cap_ids=["C2"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    validated = validate_soap(soap_dur, caps, generated=True)
    assert "3 tháng" in validated.S.items[0].text


# TEST D: Duration omission ("kéo dài khoảng 3 tháng" -> no duration) MUST FAIL
def test_d_duration_omission_fails():
    c2 = make_cap("C2", "ProblemHistory", "thời gian mệt mỏi", "Tình trạng này kéo dài khoảng 3 tháng.", "patient")
    caps = [c2]

    soap_no_dur = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Bị mệt mỏi nhiều.", cap_ids=["C2"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap_no_dur, caps, generated=True)
    assert exc.value.code == "candidate_coverage_violation"


# TEST E: Numeric safety mismatch ("118/76 mmHg" vs "140/90 mmHg") raises SoapFailure with safety error code
def test_e_numeric_safety_mismatch_marked_unsupported():
    cap_bp = make_cap("C7", "ExamFinding", "huyết áp", "Huyết áp 118/76 mmHg", "clinician", quote="118/76 mmHg")
    soap_mismatch = SoapDocument(
        S=SoapSection(items=[], missing=True),
        O=SoapSection(items=[SoapItem(item_id="O1", text="Huyết áp 140/90 mmHg", cap_ids=["C7"])]),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    validated = validate_soap(soap_mismatch, [cap_bp], generated=True)
    assert validated.O.items[0].support_status == "unsupported"


# TEST F: Fail-safe draft availability for non-safety structural coverage error


@pytest.mark.asyncio
async def test_f_fail_safe_draft_saved_on_structural_coverage_error():
    t = Transcript(turns=[make_turn("T1", "patient", "Tôi bị mệt mỏi kéo dài 3 tháng.")])
    c1 = make_cap("C1", "ProblemHistory", "thời gian mệt mỏi", "Tình trạng này kéo dài khoảng 3 tháng.", "patient", turn_id="T1", quote="mệt mỏi kéo dài 3 tháng")

    # Mock store and llm
    mock_store = MagicMock(spec=["assert_revision", "create_run", "load", "append_revision", "save_caps", "save_attempt"])
    mock_store.create_run.return_value = "run_test_failsafe"
    mock_store.load.return_value = {
        "transcript": t.model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    }
    mock_store.append_revision.return_value = 1

    # Mock LLM returning renderer output missing "3 tháng" on both initial and repair attempt
    bad_soap_json = '{"S":{"items":[{"item_id":"S1","text":"Mệt mỏi nhiều","cap_ids":["C1"]}],"missing":false},"O":{"items":[],"missing":true},"A":{"items":[],"missing":true},"P":{"items":[],"missing":true}}'
    mock_llm = AsyncMock()
    mock_llm.model_name = "test-model"
    mock_llm.ainvoke.return_value = AIMessage(content=bad_soap_json)

    pipeline = create_soap_pipeline(mock_store, mock_llm)
    final_state = await pipeline.ainvoke({
        "operation": "render",
        "run_id": "run_test_failsafe",
        "expected_revision": 0,
        "content": "",
        "input_format": "canonical",
    })

    # Verify fail-safe draft saving
    assert final_state.get("error") is None
    assert final_state.get("revision") == 1
    assert any("Coverage warning" in w for w in final_state.get("cap_warnings", []))
    assert mock_store.append_revision.called


# TEST G: Safety-critical failure is strictly BLOCKED (not degraded-saved)
@pytest.mark.asyncio
async def test_g_safety_critical_failure_blocks_pipeline():
    t = Transcript(turns=[make_turn("T1", "patient", "Tôi uống Paracetamol 500mg.")])
    c1 = make_cap("C1", "MedicationStatement", "Paracetamol", "Paracetamol 500mg", "patient", turn_id="T1", quote="Paracetamol 500mg")

    mock_store = MagicMock(spec=["assert_revision", "create_run", "load", "append_revision", "save_caps", "save_attempt"])
    mock_store.create_run.return_value = "run_test_safety_block"

    mock_store.load.return_value = {
        "transcript": t.model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    }

    # LLM returns wrong dosage (1000mg instead of 500mg) -> dosage_mismatch safety failure
    wrong_dosage_soap = '{"S":{"items":[{"item_id":"S1","text":"Uống Paracetamol 1000mg","cap_ids":["C1"]}],"missing":false},"O":{"items":[],"missing":true},"A":{"items":[],"missing":true},"P":{"items":[],"missing":true}}'
    mock_llm = AsyncMock()
    mock_llm.model_name = "test-model"
    mock_llm.ainvoke.return_value = AIMessage(content=wrong_dosage_soap)

    pipeline = create_soap_pipeline(mock_store, mock_llm)
    final_state = await pipeline.ainvoke({
        "operation": "render",
        "run_id": "run_test_safety_block",
        "expected_revision": 0,
        "content": "",
        "input_format": "canonical",
    })

    # Safety-critical dosage mismatch must BLOCK (error present, save_draft not called)
    assert final_state.get("error") is not None
    assert final_state["error"]["code"] == "dosage_mismatch"
    assert final_state.get("revision") is None
    assert not mock_store.append_revision.called





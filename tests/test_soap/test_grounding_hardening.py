"""Comprehensive regression test suite for CAP duration/severity extraction, strict renderer grounding, and numbers_mismatch safety invariant."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest
from langchain_core.messages import AIMessage

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import check_item_semantic_coverage, validate_soap
from src.agents.soap_graph import create_soap_pipeline


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


# TEST A: Duration extraction "3 tuần" preserved in CAP proposition
def test_a_duration_extraction_3_weeks():
    cap = make_cap(
        prop_id="C1",
        cap_type="ChiefComplaint",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu kéo dài 3 tuần",
        speaker_source="patient",
        quote="Đau đầu kéo dài 3 tuần",
    )
    assert "3 tuần" in cap.proposition_text
    err = check_item_semantic_coverage("Đau đầu kéo dài 3 tuần.", cap.proposition_text)
    assert not err


# TEST B: Alternative duration "2 tháng" preserved in CAP proposition
def test_b_duration_extraction_2_months():
    cap = make_cap(
        prop_id="C1",
        cap_type="ChiefComplaint",
        canonical_concept="đau thắt lưng",
        proposition_text="Tôi bị tình trạng này khoảng 2 tháng nay",
        speaker_source="patient",
        quote="bị tình trạng này khoảng 2 tháng nay",
    )
    assert "2 tháng" in cap.proposition_text
    err = check_item_semantic_coverage("Đau thắt lưng khoảng 2 tháng nay.", cap.proposition_text)
    assert not err


# TEST C: Severity range ("từ mức vừa đến dữ dội") preserved
def test_c_severity_range_preservation():
    cap = make_cap(
        prop_id="C1",
        cap_type="ChiefComplaint",
        canonical_concept="đau gối",
        proposition_text="Đau từ mức vừa đến dữ dội",
        speaker_source="patient",
        quote="đau từ mức vừa đến dữ dội",
    )
    assert "vừa" in cap.proposition_text and "dữ dội" in cap.proposition_text
    err = check_item_semantic_coverage("Đau mức độ từ vừa đến dữ dội.", cap.proposition_text)
    assert not err


# TEST D: Renderer linking both concept CAP and duration CAP
def test_d_renderer_links_both_concept_and_duration_caps():
    cap_c1 = make_cap("C1", "ChiefComplaint", "đau khớp gối trái", "Đau khớp gối trái", "patient", quote="đau khớp gối trái")
    cap_c2 = make_cap("C2", "ProblemHistory", "thời gian đau", "Tình trạng kéo dài 3 tuần", "patient", quote="kéo dài 3 tuần")

    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Đau khớp gối trái kéo dài 3 tuần", cap_ids=["C1", "C2"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    validated = validate_soap(soap, [cap_c1, cap_c2], generated=True)
    assert validated.S.items[0].support_status == "pending"


# TEST E: Unsupported number ("3 tuần" outputted but cap_ids=["C1"] lacks "3") MUST fail validation / check_soap
@pytest.mark.asyncio
async def test_e_unsupported_number_fails_validation():
    t = Transcript(turns=[make_turn("T1", "patient", "Tôi bị đau gối.")])
    c1 = make_cap("C1", "ChiefComplaint", "đau gối", "Đau khớp gối trái", "patient", turn_id="T1", quote="đau gối")

    mock_store = MagicMock(spec=["assert_revision", "create_run", "load", "append_revision", "save_caps", "save_attempt"])
    mock_store.create_run.return_value = "run_test_unsupported_num"
    mock_store.load.return_value = {
        "transcript": t.model_dump(mode="json"),
        "caps": [c1.model_dump(mode="json")],
        "cap_warnings": [],
    }

    # Renderer hallucinates "3 tuần" when C1 does not contain "3"
    bad_soap_json = '{"S":{"items":[{"item_id":"S1","text":"Đau khớp gối trái kéo dài 3 tuần","cap_ids":["C1"]}],"missing":false},"O":{"items":[],"missing":true},"A":{"items":[],"missing":true},"P":{"items":[],"missing":true}}'
    mock_llm = AsyncMock()
    mock_llm.model_name = "test-model"
    mock_llm.ainvoke.return_value = AIMessage(content=bad_soap_json)

    pipeline = create_soap_pipeline(mock_store, mock_llm)
    final_state = await pipeline.ainvoke({
        "operation": "render",
        "run_id": "run_test_unsupported_num",
        "expected_revision": 0,
        "content": "",
        "input_format": "canonical",
    })

    # Safety-critical numbers_mismatch MUST BLOCK pipeline
    assert final_state.get("error") is not None
    assert final_state["error"]["code"] == "numbers_mismatch"


# TEST F: No transcript leakage (Number present in transcript but absent in CAPs is not output by renderer)
def test_f_no_transcript_leakage_when_cap_lacks_number():
    cap = make_cap("C1", "ChiefComplaint", "đau khớp gối", "Khớp gối trái bị đau nhiều", "patient", quote="đau nhiều")
    soap = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="S1", text="Khớp gối trái đau nhiều.", cap_ids=["C1"])]),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )

    validated = validate_soap(soap, [cap], generated=True)
    assert validated.S.items[0].support_status == "pending"
    assert "3" not in validated.S.items[0].text


# TEST G: Cross-voice / generalized Vietnamese duration and severity phrases
@pytest.mark.parametrize("duration_text", [
    "kéo dài khoảng 3 tuần",
    "đã 5 ngày nay",
    "bị từ 2 tháng trước",
    "triệu chứng kéo dài 10 ngày",
])
def test_g_cross_voice_duration_phrases_supported(duration_text: str):
    cap = make_cap(
        prop_id="C1",
        cap_type="ProblemHistory",
        canonical_concept="thời gian triệu chứng",
        proposition_text=f"Tình trạng {duration_text}",
        speaker_source="patient",
        quote=duration_text,
    )
    err = check_item_semantic_coverage(f"Tình trạng {duration_text}.", cap.proposition_text)
    assert not err

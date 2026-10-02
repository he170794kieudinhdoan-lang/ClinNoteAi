import json
from pathlib import Path

import pytest

from src.agents.soap_graph import create_soap_pipeline
from src.schemas.soap import Cap, Transcript
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import validate_caps
from src.services.transcript.normalizer import TranscriptNormalizationError, parse_soap_transcript
from tests.test_soap.conftest import FakeLLM


@pytest.mark.asyncio
async def test_graph_extract_then_render_separately(soap_store, sample):
    transcript, caps, soap = sample
    llm = FakeLLM([json.dumps(caps), json.dumps(soap)])
    graph = create_soap_pipeline(soap_store, llm)
    extracted = await graph.ainvoke({"operation": "extract", "input_format": "canonical", "content": transcript})
    assert "error" not in extracted
    assert llm.calls == 1
    assert extracted["caps"][0]["evidence"][0]["speaker"] == "patient"
    assert soap_store.load(extracted["run_id"])["latest_revision"] is None
    rendered = await graph.ainvoke({"operation": "render", "run_id": extracted["run_id"], "expected_revision": 0})
    assert not rendered.get("error")
    assert llm.calls == 2
    assert rendered["revision"]["soap"]["A"]["items"][0]["support_status"] == "pending"
    assert soap_store.latest_number(extracted["run_id"]) == 1


@pytest.mark.asyncio
async def test_repair_once_and_quote_mismatch_fails(soap_store, sample):
    transcript, caps, _ = sample
    broken = json.loads(json.dumps(caps))
    broken["caps"][0]["evidence"][0]["quote"] = "not in transcript"
    llm = FakeLLM(["not-json", json.dumps(broken)])
    result = await create_soap_pipeline(soap_store, llm).ainvoke(
        {"operation": "extract", "input_format": "canonical", "content": transcript})
    assert result.get("error") is None
    assert any("invalid_quote" in w for w in result["cap_warnings"])
    assert llm.calls == 2
    assert soap_store.load(result["run_id"])["caps"] is not None


@pytest.mark.asyncio
async def test_provider_timeout_keeps_input_without_caps(soap_store, sample):
    transcript, _, _ = sample
    llm = FakeLLM([TimeoutError()])
    result = await create_soap_pipeline(soap_store, llm).ainvoke(
        {"operation": "extract", "input_format": "canonical", "content": transcript})
    assert result["error"]["code"] == "provider_timeout"
    assert result["error"]["stage"] == "extract_caps"
    assert llm.calls == 1
    stored = soap_store.load(result["run_id"])
    assert stored["transcript"]["turns"][0]["turn_id"] == "T1"
    assert stored["caps"] is None


@pytest.mark.asyncio
async def test_render_repair_is_bounded_and_does_not_reextract(soap_store, sample):
    transcript, caps, soap = sample
    llm = FakeLLM([json.dumps(caps), "invalid-json", json.dumps(soap)])
    graph = create_soap_pipeline(soap_store, llm)
    extracted = await graph.ainvoke({"operation": "extract", "input_format": "canonical", "content": transcript})
    rendered = await graph.ainvoke({"operation": "render", "run_id": extracted["run_id"], "expected_revision": 0})
    assert not rendered.get("error")
    assert rendered["soap_repair_count"] == 1
    assert llm.calls == 3
    assert soap_store.load(extracted["run_id"])["latest_revision"]["revision"] == 1


def test_supersedes_and_contradiction(sample):
    transcript, caps, _ = sample
    corrected = dict(caps["caps"][0], prop_id="C5", proposition_text="Không đau gối trái",
                     verification_status="negated", supersedes=["C1"])
    checked, warnings = validate_caps([Cap.model_validate(c) for c in caps["caps"] + [corrected]],
                                      Transcript.model_validate(transcript))
    assert checked[0].resolution_status == "superseded"
    assert any("correction" in warning for warning in warnings)


def test_qwen_adapter_keeps_source_identity():
    raw = json.loads((Path(__file__).parents[2] / "SOAP" / "qwen_role_result.json").read_text(encoding="utf-8"))
    transcript = parse_soap_transcript(raw)
    assert len(transcript.turns) == 55
    assert transcript.turns[21].turn_id == "T22"
    assert transcript.turns[21].speaker == "clinician"
    assert (transcript.turns[21].start_ms, transcript.turns[21].end_ms) == (105030, 117930)
    assert transcript.turns[21].source_segment_id == 22


def test_uploaded_json_text_is_preserved_byte_for_byte(soap_store):
    raw = json.loads((Path(__file__).parents[2] / "SOAP" / "qwen_role_result.json").read_text(encoding="utf-8"))
    content = json.dumps(raw, ensure_ascii=False, indent=2)
    transcript = parse_soap_transcript(content)
    run_id = soap_store.create_run(content, transcript, "qwen_role_result")
    stored = json.loads((soap_store.root / run_id / "input_raw.json").read_text(encoding="utf-8"))
    assert stored["content"] == content
    assert soap_store.load(run_id)["metadata"]["raw_hash_mode"] == "text_bytes"


def test_qwen_role_conflict_rejected():
    raw = {"speaker_roles": {"1": {"role": "patient"}},
           "segments": [{"id": 1, "speaker": 1, "role": "doctor", "text": "a"}]}
    with pytest.raises(TranscriptNormalizationError):
        parse_soap_transcript(raw)


def test_future_order_cannot_be_recorded_as_completed(sample):
    transcript, caps, _ = sample
    invalid = dict(caps["caps"][3], cap_type="Order", clinical_status="active")
    with pytest.raises(SoapFailure) as error:
        validate_caps([Cap.model_validate(invalid)], Transcript.model_validate(transcript))
    assert error.value.code == "future_action_state"

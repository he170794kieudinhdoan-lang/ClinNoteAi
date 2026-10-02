"""Single SOAP model invocation and strict response parsing."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from src.config import get_settings
from src.schemas.soap import Cap, SoapDocument, Transcript
from src.services.soap.errors import SoapFailure

PROMPT_VERSION = "soap-1"
PROMPT = (Path(__file__).parent / "prompts" / "soap_renderer.txt").read_text(encoding="utf-8")


def compute_section_candidates(caps: list[Cap]) -> dict[str, list[str]]:
    """
    Computes deterministic section candidates for S, O, A, and P sections:
    - S: speaker_source == 'patient'
    - O: speaker_source == 'clinician' AND cap_type in {'ExamFinding', 'TestResult'}
    - A: speaker_source == 'clinician' AND cap_type in {'Problem', 'ProblemHistory'}
    - P: speaker_source == 'clinician' AND cap_type in {'MedicationRequest', 'Order', 'FollowUp', 'Counseling'}
    """
    return {
        "S": [c.prop_id for c in caps if c.speaker_source == "patient"],
        "O": [c.prop_id for c in caps if c.speaker_source == "clinician" and c.cap_type in {"ExamFinding", "TestResult"}],
        "A": [c.prop_id for c in caps if c.speaker_source == "clinician" and c.cap_type in {"Problem", "ProblemHistory"}],
        "P": [c.prop_id for c in caps if c.speaker_source == "clinician" and c.cap_type in {"MedicationRequest", "Order", "FollowUp", "Counseling"}],
    }


async def render_once(llm, transcript: Transcript, caps: list[Cap], warnings: list[str], timeout: float, repair: str | None = None) -> tuple[str, dict]:
    payload = {
        "transcript": transcript.model_dump(mode="json"),
        "caps": [cap.model_dump(mode="json") for cap in caps],
        "section_candidates": compute_section_candidates(caps),
        "valid_cap_ids": sorted({c.prop_id for c in caps}),
        "warnings": warnings,
    }
    if repair is not None:
        payload["previous_invalid_output"] = repair[:12_000]
        payload["repair_instruction"] = (
            "Return corrected JSON only. Link each item ONLY to CAP IDs present in section_candidates/valid_cap_ids; "
            "remove any cap_id not in those lists. Keep all text and clinical meaning unchanged."
        )
    try:
        started = time.monotonic()
        response = await asyncio.wait_for(llm.ainvoke([
            SystemMessage(content=PROMPT),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
        ]), timeout=timeout)
    except TimeoutError as exc:
        raise SoapFailure("render_soap", "provider_timeout", "SOAP model timed out", 504) from exc
    except Exception as exc:
        raise SoapFailure("render_soap", "provider_error", f"SOAP model failed: {type(exc).__name__}", 502) from exc
    if not isinstance(response.content, str):
        raise SoapFailure("render_soap", "invalid_model_output", "SOAP model returned non-text output")
    settings = get_settings()
    return response.content, {"usage": getattr(response, "usage_metadata", None),
                              "model": getattr(response, "response_metadata", {}).get("model_name") or getattr(llm, "model_name", None) or settings.soap_llm_model or None,
                              "provider": (getattr(llm, "metadata", None) or {}).get("pipeline_provider", settings.llm_provider), "duration_ms": round((time.monotonic() - started) * 1000)}


def assign_deterministic_item_ids(soap: SoapDocument) -> SoapDocument:
    """
    Overwrite all SoapItem item_ids with deterministic section-prefixed IDs:
    S -> S1, S2, S3...
    O -> O1, O2, O3...
    A -> A1, A2, A3...
    P -> P1, P2, P3...
    """
    for section_name in ("S", "O", "A", "P"):
        section = getattr(soap, section_name)
        for index, item in enumerate(section.items, start=1):
            item.item_id = f"{section_name}{index}"
    return soap


def parse_soap(text: str) -> SoapDocument:
    cleaned = text.strip()
    if cleaned.startswith("```json\n") and cleaned.endswith("```"):
        cleaned = cleaned[8:-3].strip()
    elif cleaned.startswith("```\n") and cleaned.endswith("```"):
        cleaned = cleaned[4:-3].strip()
    try:
        soap = SoapDocument.model_validate(json.loads(cleaned))
        return assign_deterministic_item_ids(soap)
    except (ValueError, ValidationError) as exc:
        raise SoapFailure("parse_soap", "invalid_model_output", "SOAP model returned invalid JSON/schema") from exc

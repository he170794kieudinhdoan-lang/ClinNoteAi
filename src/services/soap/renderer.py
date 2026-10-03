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


async def render_once(
    llm, transcript: Transcript, caps: list[Cap], warnings: list[str], timeout: float,
    repair: str | None = None, error_message: str | None = None, error_code: str | None = None,
) -> tuple[str, dict]:
    compact_turns = [{"turn_id": t.turn_id, "speaker": t.speaker, "text": t.text} for t in transcript.turns]
    compact_caps = [
        {
            "prop_id": c.prop_id,
            "cap_type": c.cap_type,
            "canonical_concept": c.canonical_concept,
            "proposition_text": c.proposition_text,
            "speaker_source": c.speaker_source,
            "temporality": c.temporality,
            "verification_status": c.verification_status,
            "clinical_status": c.clinical_status,
            "medication_state": c.medication_state,
            "evidence": [{"turn_id": e.turn_id, "quote": e.quote} for e in c.evidence],
        }
        for c in caps
    ]
    payload = {
        "transcript": {"turns": compact_turns},
        "caps": compact_caps,
        "section_candidates": compute_section_candidates(caps),
        "valid_cap_ids": sorted({c.prop_id for c in caps}),
        "warnings": warnings,
    }
    if repair is not None:
        payload["previous_invalid_output"] = repair[:12_000]
        instruction_lines = [
            "Return corrected JSON only.",
            "Fix the following validation error from the previous attempt:",
        ]
        if error_code:
            instruction_lines.append(f"- Error Code: {error_code}")
        if error_message:
            instruction_lines.append(f"- Error Details: {error_message}")
        instruction_lines.extend([
            "Strict Rules:",
            "1. S, O, A, P items MUST ONLY link CAP IDs listed in section_candidates for THAT specific section.",
            "2. You MUST preserve the semantic meaning and essential modifiers (duration, severity, numbers, units, negations) of EVERY linked CAP ID in the rendered text string.",
            "3. If section_candidates for a section is empty, set items: [] and missing: true for that section.",
            "4. Do NOT invent new CAP IDs or alter clinical meaning.",
        ])
        payload["repair_instruction"] = "\n".join(instruction_lines)
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

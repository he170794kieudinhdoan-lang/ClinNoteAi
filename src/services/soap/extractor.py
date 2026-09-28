"""Single CAP model invocation and strict response parsing."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from src.config import get_settings
from src.schemas.soap import CapsPayload, Transcript
from src.services.soap.errors import SoapFailure

PROMPT_VERSION = "cap-2"
PROMPT = (Path(__file__).parent / "prompts" / "cap_extraction.txt").read_text(encoding="utf-8")


async def extract_once(llm, transcript: Transcript, timeout: float, repair: str | None = None) -> tuple[str, dict]:
    prompt = {"transcript": transcript.model_dump(mode="json")}
    if repair is not None:
        prompt["previous_invalid_output"] = repair[:12_000]
        prompt["repair_instruction"] = "Return corrected JSON only. Evidence must match the transcript."
    try:
        started = time.monotonic()
        response = await asyncio.wait_for(llm.ainvoke([
            SystemMessage(content=PROMPT),
            HumanMessage(content=json.dumps(prompt, ensure_ascii=False)),
        ]), timeout=timeout)
    except TimeoutError as exc:
        raise SoapFailure("extract_caps", "provider_timeout", "CAP model timed out", 504) from exc
    except Exception as exc:
        raise SoapFailure("extract_caps", "provider_error", f"CAP model failed: {type(exc).__name__}", 502) from exc
    if not isinstance(response.content, str):
        raise SoapFailure("extract_caps", "invalid_model_output", "CAP model returned non-text output")
    settings = get_settings()
    return response.content, {"usage": getattr(response, "usage_metadata", None),
                              "model": getattr(response, "response_metadata", {}).get("model_name") or getattr(llm, "model_name", None) or settings.soap_llm_model or None,
                              "provider": settings.llm_provider, "duration_ms": round((time.monotonic() - started) * 1000)}


def parse_caps(text: str) -> CapsPayload:
    cleaned = text.strip()
    if cleaned.startswith("```json\n") and cleaned.endswith("```"):
        cleaned = cleaned[8:-3].strip()
    elif cleaned.startswith("```\n") and cleaned.endswith("```"):
        cleaned = cleaned[4:-3].strip()
    try:
        return CapsPayload.model_validate(json.loads(cleaned))
    except (ValueError, ValidationError) as exc:
        raise SoapFailure("parse_caps", "invalid_model_output", "CAP model returned invalid JSON/schema") from exc

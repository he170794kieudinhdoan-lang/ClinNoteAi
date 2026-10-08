"""ICD-10 suggestion: LLM proposes codes grounded in stored CAPs, verified against icd.kcb.vn."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from src.config import get_settings
from src.schemas.soap import Cap, Transcript
from src.services.icd_kcb import IcdNotFoundError, lookup_code
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import filter_usable_caps

PROMPT_VERSION = "icd-1"
PROMPT = (Path(__file__).parent / "soap" / "prompts" / "icd_suggestion.txt").read_text(encoding="utf-8")
MAX_SUGGESTIONS = 4
_CODE_RE = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")
# Parse free tier allows 5 requests/minute; verify runs throttled and cached upstream.
_VERIFY_SEMAPHORE = asyncio.Semaphore(2)


def _clean_json(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json\n") and cleaned.endswith("```"):
        cleaned = cleaned[8:-3].strip()
    elif cleaned.startswith("```\n") and cleaned.endswith("```"):
        cleaned = cleaned[4:-3].strip()
    return cleaned


def normalize_candidate_code(code: str) -> str:
    """Uppercase, strip whitespace, cap decimals at 2 like icd.kcb.vn query_code."""
    cleaned = code.strip().upper().replace(" ", "")
    match = re.fullmatch(r"([A-Z][0-9]{2})\.[0-9]{3,4}[0-9A-Z]?", cleaned)
    if match:
        cleaned = f"{match.group(1)}.{cleaned.split('.', 1)[1][:2]}"
    return cleaned


def parse_suggestions(text: str) -> dict:
    """Parse the raw LLM response into {suggestions, unsure}; invalid JSON is a SoapFailure."""
    try:
        payload = json.loads(_clean_json(text))
    except ValueError as exc:
        raise SoapFailure("parse_icd_suggestion", "invalid_model_output",
                          "ICD suggestion model returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise SoapFailure("parse_icd_suggestion", "invalid_model_output",
                          "ICD suggestion model returned non-object output")
    suggestions = payload.get("suggestions") if isinstance(payload.get("suggestions"), list) else []
    unsure = payload.get("unsure") if isinstance(payload.get("unsure"), list) else []
    return {"suggestions": suggestions, "unsure": unsure}


def ground_suggestions(raw_suggestions: list[dict], usable_caps: list[Cap]) -> tuple[list[dict], list[dict]]:
    """Deterministic grounding: every suggestion must cite existing, usable CAP IDs.

    Returns (grounded, demoted). Items without valid code/rationale/cap_ids are demoted
    and never reach icd.kcb.vn verification, so unverifiable claims cost no credits.
    """
    cap_ids = {c.prop_id for c in usable_caps}
    cap_uncertain = {c.prop_id for c in usable_caps if c.verification_status == "uncertain"}
    grounded: list[dict] = []
    demoted: list[dict] = []
    seen: set[str] = set()

    for raw in raw_suggestions:
        if not isinstance(raw, dict):
            continue
        code = normalize_candidate_code(str(raw.get("code") or ""))
        rationale = str(raw.get("rationale") or "").strip()
        cap_links = {cid for cid in (raw.get("cap_ids") or []) if isinstance(cid, str)}
        try:
            confidence = int(raw.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0
        confidence = max(0, min(100, confidence))

        if not code or not _CODE_RE.fullmatch(code) or not rationale:
            demoted.append({"code": code, "reason": "invalid_code_or_rationale"})
            continue
        if not cap_links or any(cid not in cap_ids for cid in cap_links):
            demoted.append({"code": code, "reason": "not_grounded"})
            continue
        if code in seen:
            continue
        seen.add(code)
        if cap_links & cap_uncertain:
            confidence = min(confidence, 50)
        grounded.append({
            "code": code,
            "rationale": rationale,
            "cap_ids": sorted(cap_links),
            "confidence": confidence,
        })

    grounded.sort(key=lambda item: (-item["confidence"], item["code"]))
    return grounded[:MAX_SUGGESTIONS], demoted


async def _verify(code: str) -> dict:
    async with _VERIFY_SEMAPHORE:
        return await lookup_code(code)


async def verify_suggestions(grounded: list[dict]) -> tuple[list[dict], list[dict]]:
    """Verify each candidate against icd.kcb.vn; attach official titles or drop."""
    tasks = [asyncio.create_task(_verify(item["code"])) for item in grounded]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    suggestions: list[dict] = []
    dropped: list[dict] = []
    for item, result in zip(grounded, results):
        if isinstance(result, IcdNotFoundError):
            dropped.append({"code": item["code"], "reason": "not_in_catalog"})
            continue
        if isinstance(result, BaseException):
            dropped.append({"code": item["code"], "reason": "verification_unavailable"})
            continue
        suggestions.append({**item,
                            "title": result["disease_name_vi"],
                            "description_vi": result["description_vi"],
                            "chapter": result["chapter"],
                            "section": result["section"],
                            "parent_group": result["parent_group"],
                            "verified": True})
    return suggestions, dropped


def build_payload(transcript: Transcript, caps: list[Cap], assessment_text: str | None) -> dict:
    compact_caps = [{
        "prop_id": c.prop_id,
        "cap_type": c.cap_type,
        "canonical_concept": c.canonical_concept,
        "proposition_text": c.proposition_text,
        "temporality": c.temporality,
        "verification_status": c.verification_status,
        "clinical_status": c.clinical_status,
    } for c in caps]
    return {
        "turns": [{"turn_id": t.turn_id, "speaker": t.speaker, "text": t.text} for t in transcript.turns],
        "caps": compact_caps,
        "valid_cap_ids": sorted({c.prop_id for c in caps}),
        "assessment_text": (assessment_text or "").strip() or None,
    }


async def suggest_codes(run_id: str, assessment_text: str | None = None, *, store,
                        llm=None, model_config_override=None) -> dict:
    """Full suggest flow for one run: load -> LLM propose -> ground -> verify."""
    if llm is None:
        from src.services.llm import get_soap_llm
        llm = get_soap_llm(model_config_override)

    loaded = store.load(run_id)
    if loaded.get("caps") is None:
        raise SoapFailure("icd_suggestion", "caps_not_ready",
                          "Run has no CAPs yet; extract CAPs before suggesting ICD.", 409, run_id)
    transcript = Transcript.model_validate(loaded["transcript"])
    usable = filter_usable_caps(Cap.model_validate(c) for c in loaded["caps"])
    if not usable:
        raise SoapFailure("icd_suggestion", "no_usable_caps",
                          "No current CAPs available for suggestion.", 409, run_id)

    payload = build_payload(transcript, usable, assessment_text)
    try:
        started = time.monotonic()
        response = await asyncio.wait_for(llm.ainvoke([
            SystemMessage(content=PROMPT),
            HumanMessage(content=json.dumps(payload, ensure_ascii=False)),
        ]), timeout=get_settings().soap_llm_timeout)
    except TimeoutError as exc:
        raise SoapFailure("icd_suggestion", "provider_timeout", "ICD suggestion model timed out", 504) from exc
    except SoapFailure:
        raise
    except Exception as exc:
        raise SoapFailure("icd_suggestion", "provider_error",
                          f"ICD suggestion model failed: {type(exc).__name__}", 502) from exc
    if not isinstance(response.content, str):
        raise SoapFailure("icd_suggestion", "invalid_model_output", "ICD suggestion model returned non-text")

    parsed = parse_suggestions(response.content)
    grounded, demoted = ground_suggestions(parsed["suggestions"], usable)
    suggestions, dropped = await verify_suggestions(grounded)
    unsure = []
    for raw in parsed["unsure"]:
        if isinstance(raw, dict) and raw.get("term"):
            unsure.append({"term": str(raw["term"]), "reason": str(raw.get("reason") or "unknown")})
    for item in demoted + dropped:
        unsure.append({"term": item["code"], "reason": item["reason"]})

    metadata = {"usage": getattr(response, "usage_metadata", None),
                "model": getattr(response, "response_metadata", {}).get("model_name")
                         or getattr(llm, "model_name", None) or get_settings().soap_llm_model or None,
                "provider": (getattr(llm, "metadata", None) or {}).get("pipeline_provider",
                                                                       get_settings().llm_provider),
                "duration_ms": round((time.monotonic() - started) * 1000)}
    return {"run_id": run_id, "prompt_version": PROMPT_VERSION,
            "suggestions": suggestions, "unsure": unsure, "model_metadata": metadata}

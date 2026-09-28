#!/usr/bin/env python3
"""Validate SOAP eval fixtures, or run a bounded live-provider comparison."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CASES = Path(__file__).resolve().with_name("cases.json")
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "data" / "soap_mvp" / "eval"
SECTIONS = {"S", "O", "A", "P"}
SECTION_KEYS = {
    "subjective": "S",
    "objective": "O",
    "assessment": "A",
    "plan": "P",
}


class EvalError(Exception):
    """An evaluator setup or contract error safe to show to the operator."""


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds")


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_new_json(path: Path, value: Any) -> None:
    """Create one artifact exclusively; never overwrite an earlier result."""
    with path.open("x", encoding="utf-8") as artifact:
        artifact.write(dump_json(value))


def redact(text: str) -> str:
    text = re.sub(r"(?i)Bearer\s+\S+", "Bearer [REDACTED]", text)
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{12,}\b", "[REDACTED]", text)
    return text[:4000]


def load_cases(path: Path) -> list[dict[str, Any]]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EvalError(f"Không đọc được JSON bộ ca: {exc}") from exc

    if not isinstance(document, dict) or document.get("schema_version") != "soap-eval-cases/1.0":
        raise EvalError("schema_version của bộ ca không được hỗ trợ.")
    if "synthetic" not in document.get("notice", "").lower() and "tổng hợp" not in document.get("notice", "").lower():
        raise EvalError("Bộ ca phải ghi rõ đây là dữ liệu tổng hợp.")
    cases = document.get("cases")
    if not isinstance(cases, list) or len(cases) < 8:
        raise EvalError("Cần tối thiểu 8 ca đánh giá.")

    seen_case_ids: set[str] = set()
    for case in cases:
        validate_case(case, seen_case_ids)
    return cases


def validate_case(case: Any, seen_case_ids: set[str]) -> None:
    if not isinstance(case, dict):
        raise EvalError("Mỗi ca phải là một object JSON.")
    case_id = case.get("case_id")
    if not isinstance(case_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,79}", case_id):
        raise EvalError("case_id phải dùng chữ thường, số, dấu gạch ngang hoặc gạch dưới.")
    if case_id in seen_case_ids:
        raise EvalError(f"case_id bị trùng: {case_id}")
    seen_case_ids.add(case_id)

    transcript = case.get("transcript")
    if not isinstance(transcript, dict) or transcript.get("schema_version") != "1.0":
        raise EvalError(f"{case_id}: transcript không đúng profile canonical.")
    turns = transcript.get("turns")
    if not isinstance(turns, list) or not turns:
        raise EvalError(f"{case_id}: cần ít nhất một turn.")
    turn_map: dict[str, dict[str, Any]] = {}
    total_chars = 0
    for turn in turns:
        if not isinstance(turn, dict):
            raise EvalError(f"{case_id}: turn phải là object JSON.")
        turn_id = turn.get("turn_id")
        if not isinstance(turn_id, str) or turn_id in turn_map:
            raise EvalError(f"{case_id}: turn_id trống hoặc trùng.")
        if turn.get("speaker") not in {"patient", "clinician"}:
            raise EvalError(f"{case_id}/{turn_id}: speaker phải là patient hoặc clinician.")
        if not isinstance(turn.get("text"), str) or not turn["text"].strip():
            raise EvalError(f"{case_id}/{turn_id}: text trống.")
        if not isinstance(turn.get("source_segment_id"), str) or not isinstance(turn.get("source_speaker_id"), str):
            raise EvalError(f"{case_id}/{turn_id}: thiếu ID nguồn tổng hợp.")
        total_chars += len(turn["text"])
        turn_map[turn_id] = turn
    if total_chars > 30_000:
        raise EvalError(f"{case_id}: transcript vượt giới hạn 30.000 ký tự.")
    if len(json.dumps(transcript, ensure_ascii=False).encode("utf-8")) > 1_000_000:
        raise EvalError(f"{case_id}: JSON transcript vượt giới hạn 1 MB.")

    expected = case.get("expected")
    if not isinstance(expected, dict):
        raise EvalError(f"{case_id}: thiếu expected.")
    section_policy = expected.get("section_policy")
    if not isinstance(section_policy, dict) or set(section_policy) != SECTIONS:
        raise EvalError(f"{case_id}: section_policy phải có S/O/A/P.")
    if any(value not in {"required", "may_be_missing"} for value in section_policy.values()):
        raise EvalError(f"{case_id}: section_policy chỉ nhận required hoặc may_be_missing.")
    allowed_missing = expected.get("allowed_missing_sections")
    if not isinstance(allowed_missing, list) or set(allowed_missing) != {
        section for section, policy in section_policy.items() if policy == "may_be_missing"
    }:
        raise EvalError(f"{case_id}: allowed_missing_sections không khớp section_policy.")

    facts = expected.get("facts")
    if not isinstance(facts, list) or not facts:
        raise EvalError(f"{case_id}: cần facts kỳ vọng.")
    fact_ids: set[str] = set()
    for fact in facts:
        if not isinstance(fact, dict):
            raise EvalError(f"{case_id}: fact phải là object JSON.")
        fact_id = fact.get("fact_id")
        if not isinstance(fact_id, str) or fact_id in fact_ids:
            raise EvalError(f"{case_id}: fact_id trống hoặc trùng.")
        fact_ids.add(fact_id)
        if fact.get("section") not in SECTIONS:
            raise EvalError(f"{case_id}/{fact_id}: section phải là S/O/A/P.")
        if fact.get("section") != "S" and section_policy[fact["section"]] == "may_be_missing" and fact.get("required_in_soap"):
            raise EvalError(f"{case_id}/{fact_id}: fact bắt buộc nằm trong phần được phép thiếu.")
        evidence = fact.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise EvalError(f"{case_id}/{fact_id}: cần evidence.")
        for item in evidence:
            if not isinstance(item, dict) or item.get("turn_id") not in turn_map:
                raise EvalError(f"{case_id}/{fact_id}: evidence trỏ tới turn không tồn tại.")
            turn = turn_map[item["turn_id"]]
            quote_text = item.get("quote")
            if not isinstance(quote_text, str) or not quote_text or quote_text not in turn["text"]:
                raise EvalError(f"{case_id}/{fact_id}: quote không phải chuỗi con nguyên văn của turn.")
            if item.get("speaker") != turn["speaker"]:
                raise EvalError(f"{case_id}/{fact_id}: speaker của evidence không khớp turn.")
        if not isinstance(fact.get("status"), dict):
            raise EvalError(f"{case_id}/{fact_id}: cần trạng thái kỳ vọng.")

    if not isinstance(expected.get("forbidden_additions"), list) or not expected["forbidden_additions"]:
        raise EvalError(f"{case_id}: cần forbidden_additions.")


def local_api_base(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise EvalError("Demo evaluator chỉ gửi API tới localhost/127.0.0.1/::1 qua HTTP.")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise EvalError("--api-base không được chứa thông tin đăng nhập, query hoặc fragment.")
    return value.rstrip("/")


def request_json(method: str, url: str, body: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read(2_000_001)
            if len(response_body) > 2_000_000:
                raise EvalError("Phản hồi API vượt giới hạn lưu 2 MB.")
            parsed = json.loads(response_body.decode("utf-8"))
            if not isinstance(parsed, dict):
                raise EvalError("Phản hồi API phải là JSON object.")
            return {"http_status": response.status, "body": parsed}
    except HTTPError as exc:
        response_body = exc.read(2_000_001)
        try:
            parsed_error: Any = json.loads(response_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            parsed_error = redact(response_body.decode("utf-8", errors="replace"))
        return {"http_status": exc.code, "body": parsed_error}
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        raise EvalError(f"Lỗi gọi API ({type(exc).__name__}): {redact(str(exc))}") from exc


def usage_metadata(message: Any) -> dict[str, Any] | None:
    response_meta = getattr(message, "response_metadata", {})
    allowed: dict[str, Any] = {}
    for raw_usage in (
        getattr(message, "usage_metadata", None),
        response_meta.get("token_usage"),
    ):
        if isinstance(raw_usage, dict):
            allowed.update({key: value for key, value in raw_usage.items() if key in {"input_tokens", "output_tokens", "total_tokens", "prompt_tokens", "completion_tokens"} and isinstance(value, (int, float))})
    for key in ("cost", "cost_usd", "total_cost"):
        cost = response_meta.get(key)
        if isinstance(cost, (int, float)):
            allowed[key] = cost
    currency = response_meta.get("currency")
    if isinstance(currency, str):
        allowed["currency"] = redact(currency)
    return allowed or None


def safe_model_metadata(raw: Any) -> dict[str, Any] | None:
    """Keep token/time/model details while excluding credentials and raw provider metadata."""
    if not isinstance(raw, dict):
        return None
    safe: dict[str, Any] = {}
    for key in ("provider", "model", "prompt_version"):
        value = raw.get(key)
        if isinstance(value, str):
            safe[key] = redact(value)
    for key in ("duration_ms", "latency_ms", "cost", "cost_usd", "total_cost"):
        value = raw.get(key)
        if isinstance(value, (int, float)):
            safe[key] = value
    usage = raw.get("usage")
    if isinstance(usage, dict):
        allowed_usage = {
            key: value
            for key, value in usage.items()
            if key in {"input_tokens", "output_tokens", "total_tokens", "prompt_tokens", "completion_tokens"}
            and isinstance(value, (int, float))
        }
        if allowed_usage:
            safe["usage"] = allowed_usage
    currency = raw.get("currency")
    if isinstance(currency, str):
        safe["currency"] = redact(currency)
    return safe or None


def summarize_attempts(attempts: Any) -> dict[str, Any] | None:
    if not isinstance(attempts, list):
        return None
    stages = {
        "extract_caps": 0,
        "repair_cap_json": 0,
        "render_soap": 0,
        "repair_soap_json": 0,
    }
    metadata_by_stage: dict[str, list[dict[str, Any]]] = {stage: [] for stage in stages}
    usage_total: dict[str, float] = {}
    durations: list[float] = []
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        stage = attempt.get("stage")
        if stage in stages:
            stages[stage] += 1
        metadata = safe_model_metadata(attempt.get("metadata"))
        if not metadata:
            continue
        if stage in metadata_by_stage:
            metadata_by_stage[stage].append(metadata)
        if isinstance(metadata.get("duration_ms"), (int, float)):
            durations.append(float(metadata["duration_ms"]))
        usage = metadata.get("usage")
        if isinstance(usage, dict):
            for key, value in usage.items():
                usage_total[key] = usage_total.get(key, 0) + value
    observed = sum(stages.values())
    return {
        "observed_attempt_count": observed,
        "by_stage": stages,
        "repair_attempts": stages["repair_cap_json"] + stages["repair_soap_json"],
        "metadata_by_stage": metadata_by_stage,
        "usage_total": usage_total or None,
        "model_duration_ms_total": round(sum(durations), 1) if durations else None,
        "source": "GET run attempt_summary",
    }


def message_content(message: Any) -> str:
    value = getattr(message, "content", message)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        chunks = []
        for part in value:
            if isinstance(part, str):
                chunks.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                chunks.append(part["text"])
        return "\n".join(chunks)
    return str(value)


def parse_baseline_json(raw: str) -> dict[str, Any] | None:
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE)
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def safe_provider_config() -> dict[str, Any]:
    sys.path.insert(0, str(REPO_ROOT))
    try:
        from src.config import get_settings

        settings = get_settings()
    except Exception:
        return {"provider": "not_available", "model": "not_available"}

    provider = getattr(settings, "llm_provider", "unknown")
    soap_model = getattr(settings, "soap_llm_model", "")
    if provider == "9router":
        model = soap_model or getattr(settings, "ninerouter_model", "unknown")
    elif provider == "ollama":
        model = soap_model or getattr(settings, "ollama_model", "unknown")
    else:
        model = soap_model or getattr(settings, "model_name", "unknown")
    return {
        "provider": provider,
        "model": model,
        "temperature": getattr(settings, "soap_llm_temperature", getattr(settings, "llm_temperature", None)),
        "timeout_seconds": getattr(settings, "soap_llm_timeout", None),
    }


def build_llm() -> Any:
    sys.path.insert(0, str(REPO_ROOT))
    try:
        from src.services.llm import get_soap_llm
    except ImportError as exc:
        raise EvalError("Chưa có src.services.llm.get_soap_llm(); chưa thể chạy baseline provider.") from exc
    try:
        return get_soap_llm()
    except Exception as exc:
        raise EvalError(f"Không tạo được SOAP LLM ({type(exc).__name__}): {redact(str(exc))}") from exc


def call_baseline(
    llm: Any,
    case: dict[str, Any],
    timeout: float,
    provider_config: dict[str, Any],
) -> dict[str, Any]:
    del timeout  # The SOAP provider factory owns its finite provider timeout.
    prompt_path = Path(__file__).resolve().parent / "prompts" / "direct_soap.txt"
    template = prompt_path.read_text(encoding="utf-8")
    transcript_json = json.dumps(case["transcript"], ensure_ascii=False, separators=(",", ":"))
    prompt = template.replace("{{TRANSCRIPT_JSON}}", transcript_json)
    started = time.monotonic()
    try:
        response = llm.invoke(prompt)
    except Exception as exc:
        return {
            "status": "error",
            "error": {"type": type(exc).__name__, "message": redact(str(exc))},
            "duration_ms": round((time.monotonic() - started) * 1000, 1),
            "provider_invocation_attempts": 1,
        }
    raw = message_content(response)
    parsed = parse_baseline_json(raw)
    response_meta = getattr(response, "response_metadata", {})
    model_name = response_meta.get("model_name") or response_meta.get("model") or provider_config.get("model")
    metadata = {
        "provider": provider_config.get("provider"),
        "model": redact(model_name) if isinstance(model_name, str) else None,
        "duration_ms": round((time.monotonic() - started) * 1000, 1),
    }
    cost = next((response_meta[key] for key in ("cost", "cost_usd", "total_cost") if isinstance(response_meta.get(key), (int, float))), None)
    if cost is not None:
        metadata["cost"] = cost
    currency = response_meta.get("currency")
    if isinstance(currency, str):
        metadata["currency"] = redact(currency)
    return {
        "status": "success" if parsed is not None else "invalid_json",
        "raw_output": raw,
        "parsed_output": parsed,
        "usage": usage_metadata(response),
        "model_metadata": metadata,
        "duration_ms": metadata["duration_ms"],
        "provider_invocation_attempts": 1,
    }


def pipeline_result(api_base: str, case: dict[str, Any], timeout: float, artifact_dir: Path) -> dict[str, Any]:
    case_id = case["case_id"]
    result: dict[str, Any] = {
        "status": "failed",
        "primary_stage_requests": 0,
        "provider_invocations_observed": None,
        "stages": [],
        "model_metadata": {},
        "repair_budget": {"extract_max": 1, "render_max": 1, "observed_repairs": None},
    }
    started = time.monotonic()

    stage_started = time.monotonic()
    try:
        extraction = request_json(
            "POST",
            f"{api_base}/extract-caps",
            {"input_format": "canonical", "content": case["transcript"]},
            timeout,
        )
        result["primary_stage_requests"] += 1
        stage_record = {
            "stage": "extract",
            **extraction,
            "duration_ms": round((time.monotonic() - stage_started) * 1000, 1),
        }
        result["stages"].append(stage_record)
        write_new_json(artifact_dir / f"{case_id}.extract.json", stage_record)
        body = extraction["body"]
        metadata = safe_model_metadata(body.get("model_metadata")) if isinstance(body, dict) else None
        if metadata:
            result["model_metadata"]["extract"] = metadata
        repair_count = body.get("cap_repair_count") if isinstance(body, dict) else None
        if isinstance(repair_count, int) and 0 <= repair_count <= 1:
            result["repair_budget"]["extract_observed"] = repair_count
        if not 200 <= extraction["http_status"] < 300:
            result["error"] = {"stage": "extract", "http_status": extraction["http_status"]}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
        run_id = body.get("run_id") if isinstance(body, dict) else None
        if not isinstance(run_id, str):
            result["error"] = {"stage": "extract", "message": "Response thiếu run_id."}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
        try:
            uuid.UUID(run_id)
        except ValueError:
            result["error"] = {"stage": "extract", "message": "run_id không phải UUID."}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
        result["run_id"] = run_id
    except Exception as exc:
        result["stages"].append({"stage": "extract", "error": {"type": type(exc).__name__, "message": redact(str(exc))}})
        write_new_json(artifact_dir / f"{case_id}.extract.json", result["stages"][-1])
        result["error"] = {"stage": "extract", "type": type(exc).__name__, "message": redact(str(exc))}
        result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
        return result

    stage_started = time.monotonic()
    try:
        generation = request_json(
            "POST",
            f"{api_base}/runs/{quote(run_id, safe='')}/generate",
            {"expected_revision": 0},
            timeout,
        )
        result["primary_stage_requests"] += 1
        stage_record = {
            "stage": "render",
            **generation,
            "duration_ms": round((time.monotonic() - stage_started) * 1000, 1),
        }
        result["stages"].append(stage_record)
        write_new_json(artifact_dir / f"{case_id}.generate.json", stage_record)
        if not 200 <= generation["http_status"] < 300:
            result["error"] = {"stage": "render", "http_status": generation["http_status"]}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
        revision_value = generation["body"].get("revision")
        revision = revision_value.get("revision") if isinstance(revision_value, dict) else revision_value
        if not isinstance(revision, int) or revision < 1:
            result["error"] = {"stage": "render", "message": "Response thiếu revision hợp lệ."}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
        result["revision"] = revision
        metadata = safe_model_metadata(generation["body"].get("model_metadata"))
        if metadata:
            result["model_metadata"]["render"] = metadata
        repair_count = generation["body"].get("soap_repair_count")
        if isinstance(repair_count, int) and 0 <= repair_count <= 1:
            result["repair_budget"]["render_observed"] = repair_count
    except Exception as exc:
        result["stages"].append({"stage": "render", "error": {"type": type(exc).__name__, "message": redact(str(exc))}})
        write_new_json(artifact_dir / f"{case_id}.generate.json", result["stages"][-1])
        result["error"] = {"stage": "render", "type": type(exc).__name__, "message": redact(str(exc))}
        result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
        return result

    stage_started = time.monotonic()
    try:
        run_snapshot = request_json(
            "GET",
            f"{api_base}/runs/{quote(run_id, safe='')}",
            None,
            timeout,
        )
        read_record = {
            "stage": "read_run",
            **run_snapshot,
            "duration_ms": round((time.monotonic() - stage_started) * 1000, 1),
        }
        result["stages"].append(read_record)
        write_new_json(artifact_dir / f"{case_id}.run.json", read_record)
        if 200 <= run_snapshot["http_status"] < 300:
            body = run_snapshot["body"]
            attempts = body.get("attempt_summary") if isinstance(body, dict) else None
            attempt_summary = summarize_attempts(attempts)
            if attempt_summary is not None:
                result["attempt_summary"] = attempt_summary
                result["provider_invocations_observed"] = attempt_summary["observed_attempt_count"]
                result["repair_budget"]["observed_repairs"] = attempt_summary["repair_attempts"]
                for stage, entries in attempt_summary["metadata_by_stage"].items():
                    if entries:
                        result["model_metadata"][stage] = entries
            if isinstance(body, dict):
                expected_repairs = {"cap_repair_count": "extract", "soap_repair_count": "render"}
                for response_key, stage in expected_repairs.items():
                    repair_count = body.get(response_key)
                    if isinstance(repair_count, int) and 0 <= repair_count <= 1:
                        result["repair_budget"][f"{stage}_observed"] = repair_count
    except Exception as exc:
        read_record = {"stage": "read_run", "error": {"type": type(exc).__name__, "message": redact(str(exc))}}
        result["stages"].append(read_record)
        write_new_json(artifact_dir / f"{case_id}.run.json", read_record)

    stage_started = time.monotonic()
    try:
        exported = request_json(
            "GET",
            f"{api_base}/runs/{quote(run_id, safe='')}/export?revision={revision}",
            None,
            timeout,
        )
        export_record = {
            "stage": "export",
            **exported,
            "duration_ms": round((time.monotonic() - stage_started) * 1000, 1),
        }
        result["stages"].append(export_record)
        write_new_json(artifact_dir / f"{case_id}.export.json", export_record)
        if not 200 <= exported["http_status"] < 300:
            result["error"] = {"stage": "export", "http_status": exported["http_status"]}
            result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            return result
    except Exception as exc:
        result["stages"].append({"stage": "export", "error": {"type": type(exc).__name__, "message": redact(str(exc))}})
        write_new_json(artifact_dir / f"{case_id}.export.json", result["stages"][-1])
        result["error"] = {"stage": "export", "type": type(exc).__name__, "message": redact(str(exc))}
        result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
        return result

    result["status"] = "success"
    result["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
    return result


def review_template(case: dict[str, Any]) -> dict[str, Any]:
    facts = case["expected"]["facts"]
    methods = {}
    for method in ("baseline_direct", "cap_pipeline"):
        methods[method] = {
            "facts": [
                {
                    "fact_id": fact["fact_id"],
                    "soap_presence_expected": "present" if fact.get("required_in_soap", True) else "not_currently_required",
                    "soap_present": None,
                    "section_correct": None,
                    "soap_state_correct": None,
                    "cap_status_correct": None if method == "cap_pipeline" else "not_applicable",
                    "evidence_supported": None,
                    "notes": "",
                }
                for fact in facts
            ],
            "unsupported_assertions": None,
            "assertions_reviewed": None,
            "items_requiring_edit": None,
            "items_reviewed": None,
        }
    return {
        "case_id": case["case_id"],
        "review_status": "pending_human_review",
        "reviewer": None,
        "reviewed_at": None,
        "methods": methods,
        "cap_link_checks": {"valid_links": None, "links_checked": None, "not_applicable_to_baseline": True},
        "review_duration_seconds": None,
        "approval_duration_seconds": None,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_CASES, help="JSON ca tổng hợp (mặc định: eval/soap/cases.json).")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT, help="Gốc artifacts; mỗi lần chạy tạo thư mục UUID mới.")
    parser.add_argument("--run-model", action="store_true", help="Cho phép gọi baseline provider và API SOAP local.")
    parser.add_argument("--limit", type=int, help="Số ca tối đa (1..8); bắt buộc khi dùng --run-model.")
    parser.add_argument("--case-id", help="Chỉ chạy một case_id cụ thể; vẫn cần --run-model để gọi model.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8000/api/v1/soap", help="API SOAP local.")
    parser.add_argument("--timeout", type=float, default=60.0, help="Timeout mỗi request HTTP, giây (1..180). Timeout model lấy từ cấu hình SOAP backend.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        cases = load_cases(args.cases)
        if args.timeout < 1 or args.timeout > 180:
            raise EvalError("--timeout phải trong khoảng 1..180 giây.")
        if args.run_model:
            if args.limit is None or args.limit < 1 or args.limit > 8:
                raise EvalError("Khi gọi model, cần --limit trong khoảng 1..8 để giới hạn số ca.")
            api_base = local_api_base(args.api_base)
            if args.case_id:
                selected = [case for case in cases if case["case_id"] == args.case_id]
                if not selected:
                    raise EvalError(f"Không tìm thấy case_id: {args.case_id}")
                selected = selected[:1]
            else:
                selected = cases[: args.limit]
            llm = build_llm()
            provider = safe_provider_config()
        else:
            if args.case_id or args.limit is not None:
                raise EvalError("--case-id và --limit chỉ dùng cùng --run-model.")
            selected = cases
            api_base = None
            llm = None
            provider = None
    except EvalError as exc:
        print(f"Lỗi: {exc}", file=sys.stderr)
        return 2

    if not args.run_model:
        print(f"Đã xác thực {len(selected)} ca tổng hợp; không gọi API, không nạp provider và không ghi artifacts.")
        return 0

    args.output_root.mkdir(parents=True, exist_ok=True)
    evaluation_id = str(uuid.uuid4())
    artifact_dir = args.output_root / evaluation_id
    artifact_dir.mkdir(mode=0o700, exist_ok=False)
    write_new_json(
        artifact_dir / "manifest.json",
        {
            "evaluation_id": evaluation_id,
            "created_at": utc_now(),
            "case_ids": [case["case_id"] for case in selected],
            "synthetic_cases_only": True,
            "api_base": api_base,
            "timeout_seconds_http": args.timeout,
            "provider_config_non_secret": provider,
            "call_budget": {
                "expected_primary_model_calls": 3 * len(selected),
                "primary_model_calls_if_all_calls_succeed_max": 3 * len(selected),
                "per_case": {"baseline_direct": 1, "cap_extract": 1, "soap_render": 1},
                "repairs_max_per_case": {"extract": 1, "render": 1},
                "repair_calls_max": 2 * len(selected),
                "actual_pipeline_invocations": "recorded from GET run attempt_summary when available; otherwise unavailable",
                "http_export_reads_are_not_model_calls": True,
            },
            "scores": "not computed; human review required",
        },
    )

    successes = {"baseline_direct": 0, "cap_pipeline": 0}
    for case in selected:
        case_id = case["case_id"]
        baseline = call_baseline(llm, case, args.timeout, provider)
        write_new_json(artifact_dir / f"{case_id}.baseline.json", baseline)
        if baseline["status"] == "success":
            successes["baseline_direct"] += 1

        pipeline = pipeline_result(api_base, case, args.timeout, artifact_dir)
        write_new_json(artifact_dir / f"{case_id}.pipeline-summary.json", pipeline)
        if pipeline["status"] == "success":
            successes["cap_pipeline"] += 1

        write_new_json(artifact_dir / f"{case_id}.review.json", review_template(case))
        print(f"{case_id}: baseline={baseline['status']}, CAP pipeline={pipeline['status']}")

    write_new_json(
        artifact_dir / "summary.json",
        {
            "evaluation_id": evaluation_id,
            "completed_at": utc_now(),
            "cases_selected": len(selected),
            "successes": successes,
            "failed_or_invalid_cases": {
                "baseline_direct": len(selected) - successes["baseline_direct"],
                "cap_pipeline": len(selected) - successes["cap_pipeline"],
            },
            "scores": "not computed; complete review files and report numerators/denominators",
            "review_time": "not measured by this runner",
        },
    )
    print(f"Artifacts mới: {artifact_dir}")
    print("Chưa có điểm chất lượng: cần reviewer chấm các file *.review.json.")
    return 0 if all(count == len(selected) for count in successes.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

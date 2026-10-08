"""ICD-10 lookup against icd.kcb.vn through Parse. The key never leaves the server."""

from __future__ import annotations

import asyncio
import re
import unicodedata
from typing import Any

import httpx

from src.config import get_settings

CODE_RE = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")
# ponytail: the chapter index lives in this process. A restart spends another query_all_code credit. Persist the JSON if that cost matters.
_details: dict[str, dict[str, Any]] = {}
_index: list[dict[str, str]] | None = None
_seeded_rows: list[dict[str, str]] | None = None
_index_lock = asyncio.Lock()


class IcdNotFoundError(Exception):
    pass


class IcdUnavailableError(Exception):
    pass


class IcdUpstreamError(Exception):
    pass


def fold(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn").lower()


def node(value: Any) -> dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    return {"code": str(raw.get("code") or ""), "title": str(raw.get("title") or "")}


def detail_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    if not isinstance(data, dict) or not data.get("icd10_code"):
        raise IcdNotFoundError
    if str(payload.get("status") or "success") not in {"success", ""}:
        raise IcdNotFoundError
    return {
        "icd10_code": str(data["icd10_code"]),
        "disease_name_vi": str(data.get("disease_name_vi") or ""),
        "description_vi": str(data.get("description_vi") or ""),
        "chapter": node(data.get("chapter")),
        "section": node(data.get("section")),
        "parent_group": node(data.get("parent_group")),
    }


def rows_from_payload(payload: dict[str, Any]) -> list[dict[str, str]]:
    data = payload.get("data")
    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("items") or data.get("codes")
    else:
        items = None
    if items is None and isinstance(data, dict) and data.get("icd10_code"):
        items = [data]
    rows: list[dict[str, str]] = []
    for item in items or []:
        if not isinstance(item, dict) or not item.get("icd10_code"):
            continue
        rows.append({"code": str(item["icd10_code"]), "title": str(item.get("disease_name_vi") or "")})
    return rows


def match_rows(rows: list[dict[str, str]], query: str, limit: int = 12) -> list[dict[str, str]]:
    needle = fold(query.strip())
    if len(needle) < 2:
        return []
    return [row for row in rows if needle in fold(row["code"]) or needle in fold(row["title"])][:limit]


def normalize_code(code: str) -> str:
    cleaned = code.strip().upper().replace(" ", "")
    if not CODE_RE.fullmatch(cleaned):
        raise IcdNotFoundError
    return cleaned


def query_code_param(code: str) -> str:
    """Param tra cứu chỉ giữ 2 số sau dấu chấm khi phần thập phân dài hơn."""
    head, dot, tail = code.partition(".")
    if not dot:
        return code
    digits = ""
    for char in tail:
        if not char.isdigit():
            break
        digits += char
    if len(digits) <= 2:
        return code
    return f"{head}.{digits[:2]}"


async def _get(endpoint: str, params: dict[str, str], timeout: float) -> dict[str, Any]:
    settings = get_settings()
    if not settings.parse_api_key.strip():
        raise IcdUnavailableError("Chưa có PARSE_API_KEY trên server.")
    url = f"{settings.parse_icd_base_url.rstrip('/')}/{endpoint}"
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(url, params=params, headers={"X-API-Key": settings.parse_api_key})
                response.raise_for_status()
                payload = response.json()
        except httpx.HTTPStatusError as exc:
            # Parse returns 422/stale_input for codes missing in the kcb database; that is
            # "not found", not an upstream outage — downstream search falls back to the index.
            if exc.response.status_code == 422:
                try:
                    body = exc.response.json()
                except ValueError:
                    body = {}
                if str((body.get("error") or {}).get("status") or "") == "stale_input" \
                   or str((body.get("error") or {}).get("kind") or "") == "input_not_found":
                    raise IcdNotFoundError from exc
            last_error = exc
            if exc.response.status_code < 500 and attempt == 0:
                break  # non-retryable upstream refusal
        except httpx.HTTPError as exc:
            last_error = exc
        else:
            if not isinstance(payload, dict):
                raise IcdUpstreamError("ICD trả về dữ liệu không đọc được.") from None
            if payload.get("status") in {None, "success"}:
                return payload
            raise IcdNotFoundError from None
        if attempt == 0:
            await asyncio.sleep(1.5)
    # Transient upstream failures (Parse cp_transport/5xx) must not echo the raw body.
    raise IcdUpstreamError("Danh mục ICD tạm không truy cập được. Thử lại sau ít phút.") from last_error


async def lookup_code(code: str) -> dict[str, Any]:
    cleaned = normalize_code(code)
    cached = _details.get(cleaned)
    if cached is not None:
        return cached
    payload = await _get("query_code", {"code": query_code_param(cleaned)}, 25)
    detail = detail_from_payload(payload)
    _details[cleaned] = detail
    return detail


async def _load_index() -> list[dict[str, str]]:
    global _index
    if _index is not None:
        return _index
    async with _index_lock:
        if _index is None:
            # 3-char categories only: with subcategories the upstream call takes minutes.
            # Detail (description/hierarchy) is fetched lazily per code via lookup_code.
            payload = await _get("query_all_code", {"include_subcategories": "false", "limit_chapters": "22"}, 60)
            _index = rows_from_payload(payload)
    return _index


async def search_codes(query: str) -> list[dict[str, str]]:
    text = query.strip()
    if len(text) < 2:
        return []
    try:
        detail = await lookup_code(text)
    except IcdNotFoundError:
        detail = None
    if detail is not None:
        return [{"code": detail["icd10_code"], "title": detail["disease_name_vi"]}]
    return match_rows(await _load_index(), text)

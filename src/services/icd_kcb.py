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
_index_lock = asyncio.Lock()


class IcdNotFound(Exception):
    pass


class IcdUnavailable(Exception):
    pass


class IcdUpstream(Exception):
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
        raise IcdNotFound
    if str(payload.get("status") or "success") not in {"success", ""}:
        raise IcdNotFound
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
    items = data if isinstance(data, list) else data.get("items") if isinstance(data, dict) else None
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
        raise IcdNotFound
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
        raise IcdUnavailable("Chưa có PARSE_API_KEY trên server.")
    url = f"{settings.parse_icd_base_url.rstrip('/')}/{endpoint}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, params=params, headers={"X-API-Key": settings.parse_api_key})
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:180]
        raise IcdUpstream(f"ICD từ chối ({exc.response.status_code}). {body}") from exc
    except httpx.HTTPError as exc:
        raise IcdUpstream("Không gọi được danh mục ICD.") from exc
    if not isinstance(payload, dict):
        raise IcdUpstream("ICD trả về dữ liệu không đọc được.")
    if payload.get("status") not in {None, "success"}:
        raise IcdNotFound
    return payload


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
            payload = await _get("query_all_code", {"include_subcategories": "true", "limit_chapters": "22"}, 90)
            _index = rows_from_payload(payload)
    return _index


async def search_codes(query: str) -> list[dict[str, str]]:
    text = query.strip()
    if len(text) < 2:
        return []
    try:
        detail = await lookup_code(text)
    except IcdNotFound:
        detail = None
    if detail is not None:
        return [{"code": detail["icd10_code"], "title": detail["disease_name_vi"]}]
    return match_rows(await _load_index(), text)

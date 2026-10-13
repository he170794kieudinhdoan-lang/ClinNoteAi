"""Deterministic and structural heuristics for Clinical Relevance Gate."""

from __future__ import annotations

import re
from typing import Any
from pydantic import BaseModel, Field


class HeuristicResult(BaseModel):
    is_unusable: bool
    status: str = "UNCERTAIN"
    reason: str
    confidence: float = 1.0
    evidence_signals: list[str] = Field(default_factory=list)


def evaluate_heuristics(segments_or_text: list[dict[str, Any]] | str) -> HeuristicResult | None:
    """
    Check for clearly unusable, empty, or corrupted ASR transcripts.
    Returns HeuristicResult if definitively unusable; returns None if model evaluation is needed.
    """
    if isinstance(segments_or_text, str):
        raw_text = segments_or_text.strip()
        segments_count = len([line for line in raw_text.splitlines() if line.strip()])
    elif isinstance(segments_or_text, list):
        texts = [str(seg.get("text", "")).strip() for seg in segments_or_text if isinstance(seg, dict)]
        raw_text = " ".join([t for t in texts if t])
        segments_count = len([t for t in texts if t])
    else:
        return HeuristicResult(
            is_unusable=True,
            status="UNCERTAIN",
            reason="Dữ liệu transcript không đúng định dạng.",
            evidence_signals=["Invalid input type"],
        )

    # 1. Empty transcript
    if not raw_text:
        return HeuristicResult(
            is_unusable=True,
            status="UNCERTAIN",
            reason="Bản ghi hội thoại rỗng, không có nội dung âm thanh/chữ.",
            evidence_signals=["Empty transcript content"],
        )

    # Clean text to measure alphanumeric content
    clean_words = re.findall(r"\b\w+\b", raw_text, flags=re.UNICODE)
    
    # 2. Ultra-short / single token only
    if len(clean_words) < 2 or len(raw_text) < 6:
        return HeuristicResult(
            is_unusable=True,
            status="UNCERTAIN",
            reason="Bản ghi quá ngắn hoặc thiếu từ ngữ có nghĩa để kết luận.",
            evidence_signals=[f"Raw content: '{raw_text[:50]}'"],
        )

    # 3. Severe ASR garble or repeated single token
    if len(clean_words) >= 6:
        word_freq: dict[str, int] = {}
        for w in clean_words:
            w_lower = w.lower()
            word_freq[w_lower] = word_freq.get(w_lower, 0) + 1
        most_common_count = max(word_freq.values())
        if most_common_count / len(clean_words) > 0.85 and len(set(clean_words)) <= 2:
            return HeuristicResult(
                is_unusable=True,
                status="UNCERTAIN",
                reason="Bản ghi ASR chứa chuỗi từ lặp bất thường hoặc nhiễu âm thanh.",
                evidence_signals=[f"Repeated token detected in {raw_text[:80]}"],
            )

    return None

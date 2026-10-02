"""Conservative text normalization and exact/single-span evidence quote resolution utilities."""

from __future__ import annotations

import re
import unicodedata

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_STRIP = " .,?!;:\"'-\u201c\u201d\u2018\u2019"


def conservative_normalize(text: str) -> str:
    """
    Apply strict conservative normalization to string:
    1. Unicode NFC normalization.
    2. Convert whitespace sequences to single space.
    3. Strip leading and trailing punctuation and whitespace.

    Does NOT modify case, words, synonyms, spelling, or word order.
    """
    if not text:
        return ""
    normalized = unicodedata.normalize("NFC", text)
    normalized = _WHITESPACE_RE.sub(" ", normalized).strip()
    normalized = normalized.strip(_PUNCT_STRIP)
    return normalized


def _is_word_char(char: str) -> bool:
    return char.isalnum()


def resolve_conservative_evidence_quote(quote: str, turn_text: str) -> tuple[str | None, str]:
    """
    Resolve evidence quote against turn_text with precision over recall:

    Priority 1: Exact Substring Match
      - If quote is an exact substring of turn_text:
        - If exactly 1 occurrence -> locked & returned.
        - If >1 occurrences -> returns (None, "ambiguous_quote") - DO NOT GUESS.

    Priority 2: Conservative Normalization (spacing, punctuation trim, NFC)
      - Construct strict word pattern matching conservative words in turn_text.
      - If exactly 1 valid candidate span -> locked & returned as original transcript slice.
      - If 0 candidates -> returns (None, "unresolved_quote").
      - If >1 candidates -> returns (None, "ambiguous_quote").

    NO fuzzy matching, NO Levenshtein distance, NO paraphrase, NO typo tolerance.
    """
    raw_quote = quote.strip()
    if not raw_quote or not turn_text:
        return None, "empty_quote_or_text"

    # Priority 1: Exact Substring Match
    exact_count = turn_text.count(raw_quote)
    if exact_count == 1:
        return raw_quote, "exact_match"
    if exact_count > 1:
        return None, "ambiguous_quote"

    # Priority 2: Conservative Word-based Span Matching
    norm_quote = conservative_normalize(raw_quote)
    if not norm_quote:
        return None, "unresolved_quote"

    quote_tokens = norm_quote.split()
    if not quote_tokens:
        return None, "unresolved_quote"

    # Normalize turn_text Unicode (NFC) for matching
    nfc_turn = unicodedata.normalize("NFC", turn_text)

    # Join escaped tokens with whitespace pattern \s+
    pattern_str = r"\s+".join(re.escape(token) for token in quote_tokens)
    try:
        pattern = re.compile(pattern_str, re.IGNORECASE)
    except re.error:
        return None, "unresolved_quote"

    valid_matches = []
    for match in pattern.finditer(nfc_turn):
        start, end = match.span()
        # Verify word boundaries (not embedded inside a longer alphanumeric word)
        before_char = nfc_turn[start - 1] if start > 0 else ""
        after_char = nfc_turn[end] if end < len(nfc_turn) else ""

        if _is_word_char(before_char) or _is_word_char(after_char):
            # Mid-word partial match, reject
            continue

        resolved_slice = nfc_turn[start:end]
        if conservative_normalize(resolved_slice).casefold() == norm_quote.casefold():
            valid_matches.append(resolved_slice)

    if len(valid_matches) == 1:
        return valid_matches[0], "conservative_normalized_match"

    if len(valid_matches) > 1:
        return None, "ambiguous_quote"

    return None, "unresolved_quote"

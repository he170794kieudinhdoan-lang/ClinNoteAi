"""Phase 2 Unit Tests for Conservative Evidence Matcher.

Tests cover:
TEST 1: Exact substring match -> PASS.
TEST 2: Whitespace-only difference -> resolved via conservative normalization.
TEST 3: Unicode normalization difference -> resolved via conservative normalization.
TEST 4: Non-existent quote -> NOT auto-fixed, fails resolution.
TEST 5: Duplicate quote in same turn (>1 candidate) -> AMBIGUOUS, fails resolution.
TEST 6: Typo altering token -> NO fuzzy match, fails resolution.
TEST 7: Paraphrased quote -> NO semantic match, fails resolution.
TEST 8: "gối trái sưng vừa" vs "gối trái sưng nhẹ" -> NO match.
TEST 9: Resolved evidence preserves turn_id.
TEST 10: Resolved quote traces back exactly to transcript text.
TEST 11: CAP semantic fields (proposition_text, canonical_concept, etc.) are unmutated.
"""

import pytest

from src.schemas.soap import Cap, Transcript, TranscriptTurn
from src.services.soap.errors import SoapFailure
from src.services.soap.text_utils import conservative_normalize, resolve_conservative_evidence_quote
from src.services.soap.validation import validate_caps


@pytest.fixture
def sample_transcript():
    return Transcript(turns=[
        TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau đầu từ sáng nay."),
        TranscriptTurn(turn_id="T2", speaker="clinician", text="Khám thấy gối trái sưng nhẹ. gối trái sưng nhẹ."),  # Duplicate quote
        TranscriptTurn(turn_id="T3", speaker="clinician", text="Đã kiểm tra khớp gối."),
    ])


def test_exact_substring_match():
    """TEST 1: Exact substring match resolves cleanly."""
    quote = "đau đầu từ sáng"
    turn_text = "Tôi bị đau đầu từ sáng nay."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert status == "exact_match"
    assert resolved == "đau đầu từ sáng"


def test_whitespace_difference_resolution():
    """TEST 2: Whitespace-only difference resolved via conservative normalization."""
    quote = "  đau  đầu   từ sáng  "
    turn_text = "Tôi bị đau đầu từ sáng nay."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is not None
    assert status in ("exact_match", "conservative_normalized_match")
    assert resolved in turn_text


def test_unicode_normalization_resolution():
    """TEST 3: Unicode NFD vs NFC difference resolved via conservative normalization."""
    import unicodedata

    # NFD encoded Vietnamese string
    quote_nfd = unicodedata.normalize("NFD", "đau đầu từ sáng")
    turn_nfc = unicodedata.normalize("NFC", "Tôi bị đau đầu từ sáng nay.")

    resolved, status = resolve_conservative_evidence_quote(quote_nfd, turn_nfc)
    assert resolved is not None
    assert conservative_normalize(resolved) == conservative_normalize(quote_nfd)


def test_non_existent_quote_rejected():
    """TEST 4: Non-existent quote is not auto-fixed and returns None."""
    quote = "ho hoàn toàn không có trong transcript"
    turn_text = "Tôi bị đau đầu từ sáng nay."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is None
    assert status == "unresolved_quote"


def test_duplicate_quote_in_same_turn_ambiguous():
    """TEST 5: Quote appearing >1 times in same turn is AMBIGUOUS and rejected."""
    quote = "gối trái sưng nhẹ"
    turn_text = "Khám thấy gối trái sưng nhẹ. gối trái sưng nhẹ."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is None
    assert status == "ambiguous_quote"


def test_typo_altering_token_no_fuzzy_match():
    """TEST 6: Typo altering tokens (e.g. 'đâu' instead of 'đau') is NOT fuzzy matched."""
    quote = "Tôi bị đâu đầu"  # typo: đâu vs đau
    turn_text = "Tôi bị đau đầu từ sáng nay."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is None


def test_paraphrase_no_semantic_match():
    """TEST 7: Paraphrased quote is NOT semantically matched."""
    quote = "Bệnh nhân bị nhức đầu từ buổi sáng"
    turn_text = "Tôi bị đau đầu từ sáng nay."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is None


def test_sưng_vừa_vs_sưng_nhẹ_no_match():
    """TEST 8: 'gối trái sưng vừa' vs 'gối trái sưng nhẹ' MUST NOT match."""
    quote = "gối trái sưng vừa"
    turn_text = "Khám thấy gối trái sưng nhẹ."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved is None


def test_resolved_evidence_preserves_turn_id(sample_transcript):
    """TEST 9 & 10: Evidence after resolution preserves turn_id and traces exactly to transcript text."""
    cap = Cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu từ sáng nay",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T1", "quote": "  đau đầu từ sáng  "}],
        supersedes=[],
        resolution_status="current",
    )
    validated_caps, _ = validate_caps([cap], sample_transcript)
    assert validated_caps[0].evidence[0].turn_id == "T1"
    # Resolved quote is an exact substring of T1 text
    assert validated_caps[0].evidence[0].quote in sample_transcript.turns[0].text


def test_cap_semantic_fields_unmutated(sample_transcript):
    """TEST 11: Evidence Matcher does NOT mutate CAP semantic fields."""
    cap = Cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu từ sáng nay",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T1", "quote": "  đau đầu từ sáng  "}],
        supersedes=[],
        resolution_status="current",
    )
    validated_caps, _ = validate_caps([cap], sample_transcript)
    res = validated_caps[0]

    assert res.prop_id == "C1"
    assert res.cap_type == "Problem"
    assert res.canonical_concept == "đau đầu"
    assert res.proposition_text == "Đau đầu từ sáng nay"
    assert res.speaker_source == "patient"
    assert res.temporality == "current"
    assert res.verification_status == "affirmed"
    assert res.clinical_status == "active"


def test_initial_capital_case_normalization_resolution():
    """Initial capital letter in quote matches lowercase in turn text and locks exact transcript slice."""
    quote = "Bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều"
    turn_text = "Về kiểm soát cơn đau, bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều. Thuốc này sẽ giúp làm dịu cơn đau và giảm viêm."
    resolved, status = resolve_conservative_evidence_quote(quote, turn_text)
    assert resolved == "bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều"
    assert status == "conservative_normalized_match"


def test_quote_exists_in_another_turn_not_selected_turn():
    """Quote present in T1 but evidence points to T2 raises invalid_quote and is NOT auto-moved."""
    transcript = Transcript(turns=[
        TranscriptTurn(turn_id="T1", speaker="patient", text="Tôi bị đau đầu từ sáng nay."),
        TranscriptTurn(turn_id="T2", speaker="patient", text="Khám thấy gối trái sưng nhẹ."),
    ])
    cap = Cap(
        prop_id="C1",
        cap_type="Problem",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu từ sáng",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T2", "quote": "Tôi bị đau đầu từ sáng nay."}],
        supersedes=[],
        resolution_status="current",
    )
    with pytest.raises(SoapFailure) as exc_info:
        validate_caps([cap], transcript)
    assert exc_info.value.code == "invalid_quote"
    assert "CAP C1 quote is absent from turn T2" in exc_info.value.message


def test_real_regression_run_60c3daf9_77e3_4ce8_a4c4_77f04109fd5a():
    """Real regression test for run 60c3daf9-77e3-4ce8-a4c4-77f04109fd5a (CAP C6 in T43)."""
    transcript = Transcript(turns=[
        TranscriptTurn(turn_id="T43", speaker="clinician", text="Về kiểm soát cơn đau, bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều. Thuốc này sẽ giúp làm dịu cơn đau và giảm viêm."),
    ])
    cap = Cap(
        prop_id="C6",
        cap_type="MedicationRequest",
        canonical_concept="thuốc giảm đau kháng viêm",
        proposition_text="Bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều.",
        speaker_source="clinician",
        temporality="future",
        verification_status="unknown",
        clinical_status="planned",
        evidence=[{"turn_id": "T43", "quote": "Bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều"}],
        supersedes=[],
        resolution_status="current",
    )
    validated_caps, warnings = validate_caps([cap], transcript)
    assert len(validated_caps) == 1
    assert validated_caps[0].evidence[0].turn_id == "T43"
    assert validated_caps[0].evidence[0].quote == "bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều"
    assert validated_caps[0].evidence[0].quote in transcript.turns[0].text


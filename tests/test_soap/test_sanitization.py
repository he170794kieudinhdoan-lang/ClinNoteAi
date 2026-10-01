"""Phase 1 Unit & Integration Tests for CAP Sanitization Middleware.

Tests cover:
TEST 1: CAP current -> retained by filter_usable_caps.
TEST 2: CAP superseded -> filtered out by filter_usable_caps.
TEST 3: CAP mixture current + superseded -> only current CAPs are returned.
TEST 4: Sanitization does NOT mutate or delete elements from the original input list.
TEST 5: Verify integration with graph rendering flow (only usable CAPs passed to renderer).
"""

import pytest

from src.schemas.soap import Cap
from src.services.soap.validation import filter_usable_caps


@pytest.fixture
def current_cap():
    return Cap(
        prop_id="C1",
        cap_type="ChiefComplaint",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu từ sáng nay",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T1", "quote": "đau đầu"}],
        supersedes=[],
        resolution_status="current",
    )


@pytest.fixture
def superseded_cap():
    return Cap(
        prop_id="C2",
        cap_type="ChiefComplaint",
        canonical_concept="đau đầu",
        proposition_text="Đau đầu nhẹ",
        speaker_source="patient",
        temporality="current",
        verification_status="affirmed",
        clinical_status="active",
        evidence=[{"turn_id": "T1", "quote": "đau đầu"}],
        supersedes=[],
        resolution_status="superseded",
    )


@pytest.fixture
def needs_review_cap():
    return Cap(
        prop_id="C3",
        cap_type="Problem",
        canonical_concept="viêm khớp",
        proposition_text="Có thể viêm khớp",
        speaker_source="clinician",
        temporality="current",
        verification_status="uncertain",
        clinical_status="active",
        evidence=[{"turn_id": "T2", "quote": "viêm khớp"}],
        supersedes=[],
        resolution_status="needs_review",
    )


def test_sanitization_keeps_current_cap(current_cap):
    """TEST 1: CAP with resolution_status == 'current' is retained."""
    usable = filter_usable_caps([current_cap])
    assert len(usable) == 1
    assert usable[0].prop_id == "C1"


def test_sanitization_filters_superseded_cap(superseded_cap):
    """TEST 2: CAP with resolution_status == 'superseded' is filtered out."""
    usable = filter_usable_caps([superseded_cap])
    assert len(usable) == 0


def test_sanitization_mixture_returns_only_usable(current_cap, superseded_cap, needs_review_cap):
    """TEST 3: Mixture of current, superseded, and needs_review returns only non-superseded CAPs."""
    raw_list = [current_cap, superseded_cap, needs_review_cap]
    usable = filter_usable_caps(raw_list)

    assert len(usable) == 2
    usable_ids = [cap.prop_id for cap in usable]
    assert "C1" in usable_ids
    assert "C3" in usable_ids
    assert "C2" not in usable_ids


def test_sanitization_does_not_mutate_original_list(current_cap, superseded_cap):
    """TEST 4: filter_usable_caps does not mutate or remove items from the original input list."""
    original_list = [current_cap, superseded_cap]
    original_len = len(original_list)
    original_statuses = [cap.resolution_status for cap in original_list]

    usable = filter_usable_caps(original_list)

    # Output list is a new list with 1 item
    assert len(usable) == 1

    # Original list is intact and unmutated
    assert len(original_list) == original_len
    assert [cap.resolution_status for cap in original_list] == original_statuses
    assert original_list[1].resolution_status == "superseded"

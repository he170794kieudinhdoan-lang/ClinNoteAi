"""Phase 3 Unit Tests for Deterministic SOAP item_id Generation.

Tests cover:
TEST 1: Valid LLM item_id is overwritten by backend (S1, O1, A1, P1).
TEST 2: Duplicate item_id from LLM is overwritten with unique section IDs (S1, S2...).
TEST 3: LLM using wrong prefix or format is overwritten with correct prefix.
TEST 4: Multiple items in the same section receive sequence S1, S2, S3...
TEST 5: Different sections receive section-indexed IDs (S1, O1, A1, P1) and document is valid.
TEST 6: assign_deterministic_item_ids helper preserves all other fields (text, cap_ids, support_status).
"""

import json

from src.schemas.soap import SoapDocument, SoapItem, SoapSection
from src.services.soap.renderer import assign_deterministic_item_ids, parse_soap


def test_valid_llm_item_id_is_overwritten():
    """TEST 1: Valid LLM item_id (e.g. 'custom-1') is overwritten with S1, O1."""
    raw_json = json.dumps({
        "S": {"items": [{"item_id": "custom-s1", "text": "Đau đầu", "cap_ids": ["C1"]}], "missing": False},
        "O": {"items": [{"item_id": "custom-o1", "text": "Gối sưng", "cap_ids": ["C2"]}], "missing": False},
        "A": {"items": [], "missing": True},
        "P": {"items": [], "missing": True},
    })
    soap = parse_soap(raw_json)
    assert soap.S.items[0].item_id == "S1"
    assert soap.O.items[0].item_id == "O1"


def test_duplicate_llm_item_id_is_overwritten_uniquely():
    """TEST 2: Duplicate item_id from LLM is overwritten with unique sequential IDs (S1, S2)."""
    raw_json = json.dumps({
        "S": {
            "items": [
                {"item_id": "dup-id", "text": "Đau đầu", "cap_ids": ["C1"]},
                {"item_id": "dup-id", "text": "Chóng mặt", "cap_ids": ["C2"]},
            ],
            "missing": False,
        },
        "O": {"items": [], "missing": True},
        "A": {"items": [], "missing": True},
        "P": {"items": [], "missing": True},
    })
    soap = parse_soap(raw_json)
    assert soap.S.items[0].item_id == "S1"
    assert soap.S.items[1].item_id == "S2"
    assert len({item.item_id for item in soap.S.items}) == 2


def test_wrong_prefix_or_format_overwritten_correctly():
    """TEST 3: LLM using wrong prefix or format (e.g. 'C6', '123') is overwritten with correct prefix."""
    raw_json = json.dumps({
        "S": {"items": [{"item_id": "123", "text": "Đau đầu", "cap_ids": ["C1"]}], "missing": False},
        "O": {"items": [], "missing": True},
        "A": {"items": [{"item_id": "C6", "text": "Viêm khớp", "cap_ids": ["C3"]}], "missing": False},
        "P": {"items": [{"item_id": "PLAN_01", "text": "Tái khám", "cap_ids": ["C4"]}], "missing": False},
    })
    soap = parse_soap(raw_json)
    assert soap.S.items[0].item_id == "S1"
    assert soap.A.items[0].item_id == "A1"
    assert soap.P.items[0].item_id == "P1"


def test_multiple_items_sequence():
    """TEST 4: Multiple items in same section receive correct sequence (S1, S2, S3...)."""
    raw_json = json.dumps({
        "S": {
            "items": [
                {"item_id": "a", "text": "Item 1", "cap_ids": ["C1"]},
                {"item_id": "b", "text": "Item 2", "cap_ids": ["C2"]},
                {"item_id": "c", "text": "Item 3", "cap_ids": ["C3"]},
            ],
            "missing": False,
        },
        "O": {"items": [], "missing": True},
        "A": {"items": [], "missing": True},
        "P": {"items": [], "missing": True},
    })
    soap = parse_soap(raw_json)
    assert [item.item_id for item in soap.S.items] == ["S1", "S2", "S3"]


def test_section_indexed_ids_are_globally_unique():
    """TEST 5: S1, O1, A1, P1 are assigned per section and all items in document have unique IDs."""
    raw_json = json.dumps({
        "S": {"items": [{"item_id": "x", "text": "Item S", "cap_ids": ["C1"]}], "missing": False},
        "O": {"items": [{"item_id": "x", "text": "Item O", "cap_ids": ["C2"]}], "missing": False},
        "A": {"items": [{"item_id": "x", "text": "Item A", "cap_ids": ["C3"]}], "missing": False},
        "P": {"items": [{"item_id": "x", "text": "Item P", "cap_ids": ["C4"]}], "missing": False},
    })
    soap = parse_soap(raw_json)
    assert soap.S.items[0].item_id == "S1"
    assert soap.O.items[0].item_id == "O1"
    assert soap.A.items[0].item_id == "A1"
    assert soap.P.items[0].item_id == "P1"

    all_ids = [
        item.item_id
        for section in (soap.S, soap.O, soap.A, soap.P)
        for item in section.items
    ]
    assert len(all_ids) == len(set(all_ids)) == 4


def test_assign_deterministic_item_ids_preserves_other_fields():
    """TEST 6: Text, cap_ids, origin, review_status, and support_status remain unchanged."""
    original = SoapDocument(
        S=SoapSection(items=[SoapItem(item_id="llm-random", text="Đau đầu", cap_ids=["C1", "C2"])], missing=False),
        O=SoapSection(items=[], missing=True),
        A=SoapSection(items=[], missing=True),
        P=SoapSection(items=[], missing=True),
    )
    assigned = assign_deterministic_item_ids(original)

    assert assigned.S.items[0].item_id == "S1"
    assert assigned.S.items[0].text == "Đau đầu"
    assert assigned.S.items[0].cap_ids == ["C1", "C2"]
    assert assigned.S.items[0].origin == "ai"
    assert assigned.S.items[0].review_status == "needs_review"

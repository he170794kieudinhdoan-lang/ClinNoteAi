"""
Comprehensive test suite for deterministic CAP link resolution and invalid_cap_link safety.

Verifies:
1. Valid CAP link -> remains unchanged.
2. Superseded C5 with unique active replacement C8 -> resolved to C8 & passes validation.
3. Missing C99 -> not auto-fixed -> fail-safe (raises invalid_cap_link).
4. Superseded C5 without replacement -> fail-safe (raises invalid_cap_link).
5. Superseded C5 with multiple replacements (C8, C9) -> ambiguous -> fail-safe (raises invalid_cap_link).
6. Replacement CAP itself is superseded (C5 -> C8 (superseded) -> C12 (active)) -> resolved to C12.
7. Quarantined CAP (resolution_status="needs_review") -> excluded by filter_usable_caps.
8. Existing invalid_cap_link behavior is preserved (not weakened).
9. Real-world scenario regression for S5 -> invalid_cap_link.
"""

import pytest

from src.schemas.soap import Cap, Evidence, SoapDocument, SoapItem, SoapSection
from src.services.soap.errors import SoapFailure
from src.services.soap.repair_policy import REPAIRABLE_STRUCTURAL_CODES, is_repairable_error
from src.services.soap.validation import filter_usable_caps, validate_soap


def make_cap(prop_id: str, cap_type: str = "ChiefComplaint", speaker: str = "patient", status: str = "current", supersedes: list[str] | None = None) -> Cap:
    return Cap(
        prop_id=prop_id,
        cap_type=cap_type,
        canonical_concept="test concept",
        proposition_text="Test proposition",
        speaker_source=speaker,
        resolution_status=status,
        supersedes=supersedes or [],
        evidence=[Evidence(turn_id="T1", quote="test quote")],
    )


def make_soap(item_id: str = "S1", section: str = "S", cap_ids: list[str] | None = None) -> SoapDocument:
    item = SoapItem(item_id=item_id, text="Test item text", cap_ids=cap_ids or ["C1"])
    blank = SoapSection(items=[], missing=True)
    target = SoapSection(items=[item], missing=False)

    return SoapDocument(
        S=target if section == "S" else blank,
        O=target if section == "O" else blank,
        A=target if section == "A" else blank,
        P=target if section == "P" else blank,
    )


def test_1_valid_cap_link_unchanged():
    c1 = make_cap("C1")
    soap = make_soap(cap_ids=["C1"])
    validated = validate_soap(soap, [c1], generated=True)
    assert validated.S.items[0].cap_ids == ["C1"]


def test_2_superseded_cap_single_active_replacement():
    c5 = make_cap("C5", status="superseded")
    c8 = make_cap("C8", status="current", supersedes=["C5"])
    soap = make_soap(item_id="S5", cap_ids=["C5"])

    validated = validate_soap(soap, [c5, c8], generated=True)
    assert validated.S.items[0].cap_ids == ["C8"]


def test_3_missing_cap_link_failsafe():
    c1 = make_cap("C1")
    soap = make_soap(item_id="S5", cap_ids=["C99"])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c1], generated=True)

    assert exc_info.value.code == "invalid_cap_link"
    assert not is_repairable_error("invalid_cap_link")


def test_4_superseded_cap_without_replacement_failsafe():
    c5 = make_cap("C5", status="superseded")
    c1 = make_cap("C1", status="current")
    soap = make_soap(item_id="S5", cap_ids=["C5"])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c5, c1], generated=True)

    assert exc_info.value.code == "invalid_cap_link"


def test_5_superseded_cap_multiple_replacements_failsafe():
    c5 = make_cap("C5", status="superseded")
    c8 = make_cap("C8", status="current", supersedes=["C5"])
    c9 = make_cap("C9", status="current", supersedes=["C5"])
    soap = make_soap(item_id="S5", cap_ids=["C5"])

    with pytest.raises(SoapFailure) as exc_info:
        validate_soap(soap, [c5, c8, c9], generated=True)

    assert exc_info.value.code == "invalid_cap_link"


def test_6_replacement_cap_itself_superseded_chained_resolution():
    c5 = make_cap("C5", status="superseded")
    c8 = make_cap("C8", status="superseded", supersedes=["C5"])
    c12 = make_cap("C12", status="current", supersedes=["C8"])
    soap = make_soap(item_id="S5", cap_ids=["C5"])

    validated = validate_soap(soap, [c5, c8, c12], generated=True)
    assert validated.S.items[0].cap_ids == ["C12"]


def test_7_quarantined_cap_partitioning_and_filtering():
    c1 = make_cap("C1", status="current")
    c2 = make_cap("C2", status="needs_review")
    c3 = make_cap("C3", status="superseded")

    usable = filter_usable_caps([c1, c2, c3])
    assert [c.prop_id for c in usable] == ["C1"]


def test_8_existing_invalid_cap_link_behavior_not_weakened():
    assert "invalid_cap_link" not in REPAIRABLE_STRUCTURAL_CODES
    assert not is_repairable_error("invalid_cap_link")

    c1 = make_cap("C1")
    soap = make_soap(cap_ids=["UNKNOWN"])
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap, [c1], generated=True)
    assert exc.value.code == "invalid_cap_link"


def test_9_real_world_s5_invalid_cap_link_regression():
    # Scenario A: S5 links C5, C5 was superseded by active C8 -> deterministic fix
    c5 = make_cap("C5", status="superseded")
    c8 = make_cap("C8", status="current", supersedes=["C5"])
    soap_superseded = make_soap(item_id="S5", cap_ids=["C5"])
    fixed = validate_soap(soap_superseded, [c5, c8], generated=True)
    assert fixed.S.items[0].cap_ids == ["C8"]

    # Scenario B: S5 links C99, C99 is missing -> raises invalid_cap_link, NO LLM guessing
    soap_missing = make_soap(item_id="S5", cap_ids=["C99"])
    with pytest.raises(SoapFailure) as exc:
        validate_soap(soap_missing, [c8], generated=True)
    assert exc.value.code == "invalid_cap_link"

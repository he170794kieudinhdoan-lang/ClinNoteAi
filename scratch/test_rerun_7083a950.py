"""Verification script for real run 7083a950-be8c-4205-a1c2-a96d94c9e963."""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from src.schemas.soap import Cap, SoapDocument
from src.services.soap.renderer import parse_soap
from src.services.soap.validation import filter_usable_caps, validate_soap


def verify_real_run():
    run_dir = Path("data/soap_mvp/7083a950-be8c-4205-a1c2-a96d94c9e963")
    
    # Load caps
    with (run_dir / "caps.json").open("r", encoding="utf-8") as f:
        caps_data = json.load(f)
    caps = [Cap.model_validate(c) for c in caps_data["caps"]]
    usable_caps = filter_usable_caps(caps)
    
    # Load rendered SOAP attempt
    render_attempt = run_dir / "attempts/20261003T112827815970_render_soap_afe56297-fc92-478f-b8c1-b13e2df638b5.json"
    with render_attempt.open("r", encoding="utf-8") as f:
        attempt_data = json.load(f)
    
    soap_raw = attempt_data["output"]
    soap_doc = parse_soap(soap_raw)
    
    print(f"Total CAPs loaded: {len(caps)}")
    print(f"Usable CAPs: {len(usable_caps)}")
    
    # Check C13 and C14 specifically
    c13 = next(c for c in usable_caps if c.prop_id == "C13")
    c14 = next(c for c in usable_caps if c.prop_id == "C14")
    print(f"C13: {c13.canonical_concept} ({c13.verification_status}) -> {c13.proposition_text}")
    print(f"C14: {c14.canonical_concept} ({c14.verification_status}) -> {c14.proposition_text}")
    
    # Validate SOAP
    validated_soap = validate_soap(soap_doc, usable_caps, generated=True)
    
    s6_item = next(item for item in validated_soap.S.items if item.item_id == "S6")
    print(f"\nItem S6 Text:\n  {s6_item.text}")
    print(f"Item S6 cap_ids: {s6_item.cap_ids}")
    print(f"Item S6 support_status: {s6_item.support_status}")
    
    assert s6_item.support_status == "pending", f"S6 support status is {s6_item.support_status}"
    print("\nSUCCESS: Real run 7083a950-be8c-4205-a1c2-a96d94c9e963 PASSED validation!")


if __name__ == "__main__":
    verify_real_run()

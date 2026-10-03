"""Verification script for real run fe46bb82-f13c-4d71-bde2-37f8fd310f0d."""

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from src.schemas.soap import Cap, SoapDocument
from src.services.soap.renderer import parse_soap
from src.services.soap.validation import filter_usable_caps, validate_soap


def verify_real_run_fe46bb82():
    run_dir = Path("data/soap_mvp/fe46bb82-f13c-4d71-bde2-37f8fd310f0d")
    
    # Load caps
    with (run_dir / "caps.json").open("r", encoding="utf-8") as f:
        caps_data = json.load(f)
    caps = [Cap.model_validate(c) for c in caps_data["caps"]]
    usable_caps = filter_usable_caps(caps)
    
    # Load rendered SOAP attempt
    render_attempt = run_dir / "attempts/20261003T114655361839_render_soap_e957ca2d-92ca-4e15-8e82-7b4b63369343.json"
    with render_attempt.open("r", encoding="utf-8") as f:
        attempt_data = json.load(f)
    
    soap_raw = attempt_data["output"]
    soap_doc = parse_soap(soap_raw)
    
    print(f"Total CAPs loaded: {len(caps)}")
    print(f"Usable CAPs: {len(usable_caps)}")
    
    c50 = next(c for c in usable_caps if c.prop_id == "C50")
    print(f"C50: {c50.canonical_concept} ({c50.temporality}) -> {c50.proposition_text}")
    
    # Validate SOAP
    validated_soap = validate_soap(soap_doc, usable_caps, generated=True)
    
    s6_item = next(item for item in validated_soap.S.items if item.item_id == "S6")
    print(f"\nItem S6 Text:\n  {s6_item.text}")
    print(f"Item S6 cap_ids: {s6_item.cap_ids}")
    print(f"Item S6 support_status: {s6_item.support_status}")
    
    assert s6_item.support_status == "pending", f"S6 support status is {s6_item.support_status}"
    print("\nSUCCESS: Real run fe46bb82-f13c-4d71-bde2-37f8fd310f0d PASSED validation!")


if __name__ == "__main__":
    verify_real_run_fe46bb82()

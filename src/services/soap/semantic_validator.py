"""Tier 1 Deterministic Safety & Grounding Engine for SOAP items."""

from __future__ import annotations

import re
from typing import NamedTuple

from src.schemas.soap import Cap, SoapItem


class SafetyViolation(NamedTuple):
    code: str
    message: str


def _normalize_text(text: str) -> str:
    """Normalize text for case-insensitive and whitespace-clean comparison."""
    return re.sub(r"\s+", " ", text.casefold().strip())


def _extract_vital_signs(text: str) -> dict[str, str]:
    """Extract blood pressure, heart rate, temperature, SpO2 from text."""
    vitals = {}
    norm = _normalize_text(text)

    # Blood pressure: HA 120/80, huyết áp 120/80, or 120/80 mmHg
    bp_match = re.search(r"(?:huyết áp|ha:?|ha\b)\s*:?\s*(\d{2,3}\s*/\s*\d{2,3})", norm)
    if not bp_match:
        bp_match = re.search(r"\b(\d{2,3}\s*/\s*\d{2,3})\s*(?:mmhg)?\b", norm)
    if bp_match:
        vitals["bp"] = re.sub(r"\s+", "", bp_match.group(1))

    # Heart rate / pulse: mạch 80, nhịp tim 80, hr 80
    hr_match = re.search(r"(?:mạch|nhịp tim|hr|heart rate)\s*:?\s*(\d{2,3})\b", norm)
    if hr_match:
        vitals["hr"] = hr_match.group(1)

    # Temperature: nhiệt độ 37.5, thân nhiệt 38, 39 °C
    temp_match = re.search(r"(?:nhiệt độ|thân nhiệt|sốt|t:?)\s*:?\s*(\d{2}(?:\.\d)?)\b", norm)
    if temp_match:
        vitals["temp"] = temp_match.group(1)

    # SpO2: SpO2 98%, SPO2 88
    spo2_match = re.search(r"(?:spo2|độ bão hòa ô xy)\s*:?\s*(\d{2,3})\b", norm)
    if spo2_match:
        vitals["spo2"] = spo2_match.group(1)

    return vitals


def _check_vital_signs(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    soap_vitals = _extract_vital_signs(soap_text)
    if not soap_vitals:
        return violations

    # Extract all vitals across linked CAPs
    cap_vitals: dict[str, set[str]] = {}
    for cap in linked_caps:
        combined_text = f"{cap.proposition_text} {cap.canonical_concept} " + " ".join(ev.quote for ev in cap.evidence)
        vits = _extract_vital_signs(combined_text)
        for k, v in vits.items():
            cap_vitals.setdefault(k, set()).add(v)

    if "bp" in soap_vitals:
        c_bps = cap_vitals.get("bp", set())
        if c_bps and soap_vitals["bp"] not in c_bps:
            violations.append(SafetyViolation("bp_mismatch", f"BP mismatch: SOAP has {soap_vitals['bp']} but CAP has {', '.join(c_bps)}"))

    if "hr" in soap_vitals:
        c_hrs = cap_vitals.get("hr", set())
        if c_hrs and soap_vitals["hr"] not in c_hrs:
            violations.append(SafetyViolation("heart_rate_mismatch", f"Heart rate mismatch: SOAP has {soap_vitals['hr']} but CAP has {', '.join(c_hrs)}"))

    if "temp" in soap_vitals:
        c_temps = cap_vitals.get("temp", set())
        if c_temps and soap_vitals["temp"] not in c_temps:
            violations.append(SafetyViolation("temperature_mismatch", f"Temperature mismatch: SOAP has {soap_vitals['temp']} but CAP has {', '.join(c_temps)}"))

    if "spo2" in soap_vitals:
        c_spo2s = cap_vitals.get("spo2", set())
        if c_spo2s and soap_vitals["spo2"] not in c_spo2s:
            violations.append(SafetyViolation("spo2_mismatch", f"SpO2 mismatch: SOAP has {soap_vitals['spo2']} but CAP has {', '.join(c_spo2s)}"))

    return violations


LAB_CONCEPTS = ["đường huyết", "glycemic", "glucose", "hba1c", "hemoglobin", "hgb", "creatinine", "alt", "ast"]


def _extract_lab_values(text: str) -> dict[str, tuple[str, str | None]]:
    labs = {}
    norm = _normalize_text(text)
    for concept in LAB_CONCEPTS:
        pattern = re.compile(rf"\b{re.escape(concept)}\s*(?:là|:)?\s*(\d+(?:\.\d+)?)\s*([a-zA-Z/%°]+)?\b")
        match = pattern.search(norm)
        if match:
            val = match.group(1)
            unit = match.group(2)
            labs[concept] = (val, unit)
    return labs


def _check_lab_values(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    soap_labs = _extract_lab_values(soap_text)
    if not soap_labs:
        return violations

    for cap in linked_caps:
        combined_text = f"{cap.proposition_text} {cap.canonical_concept} " + " ".join(ev.quote for ev in cap.evidence)
        cap_labs = _extract_lab_values(combined_text)
        for concept, (s_val, s_unit) in soap_labs.items():
            if concept in cap_labs:
                c_val, c_unit = cap_labs[concept]
                if s_val != c_val:
                    violations.append(SafetyViolation("lab_value_mismatch", f"Lab value mismatch for {concept}: SOAP has {s_val} but CAP has {c_val}"))
                elif s_unit and c_unit and _normalize_text(s_unit) != _normalize_text(c_unit):
                    violations.append(SafetyViolation("units_mismatch", f"Units mismatch for {concept}: SOAP has {s_unit} but CAP has {c_unit}"))
    return violations


def _check_dosage_and_units(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)

    # Extract dosages and physical quantities (e.g. 500 mg, 1000 mg, 120 mmHg, 120 kg, 1 viên, 2 viên)
    dosage_pattern = re.compile(r"\b(\d+(?:\.\d+)?)\s*(mg|g|mcg|ml|viên|gói|ống|chai|kg|mmhg|mmol/l|mg/dl|g/dl|%|°c|độ c)\b")
    soap_dosages = dosage_pattern.findall(norm_soap)
    if not soap_dosages:
        return violations

    cap_combined_texts = [
        _normalize_text(f"{cap.proposition_text} {cap.canonical_concept} " + " ".join(ev.quote for ev in cap.evidence))
        for cap in linked_caps
    ]

    for val, unit in soap_dosages:
        for cap_text in cap_combined_texts:
            cap_dosages = dosage_pattern.findall(cap_text)
            for c_val, c_unit in cap_dosages:
                if unit == c_unit and val != c_val:
                    violations.append(SafetyViolation("dosage_mismatch", f"Dosage mismatch: SOAP has {val} {unit} but CAP has {c_val} {c_unit}"))
                elif val == c_val and unit != c_unit:
                    violations.append(SafetyViolation("units_mismatch", f"Units mismatch: SOAP has {val} {unit} but CAP has {c_val} {c_unit}"))

    return violations


KNOWN_DRUGS = [
    "paracetamol", "ibuprofen", "amoxicillin", "aspirin", "metformin",
    "augmentin", "panadol", "efrem", "berberin", "cephalexin", "omeprazole", "ciprofloxacin"
]


def _check_medication_mismatch(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)
    soap_drugs = [drug for drug in KNOWN_DRUGS if re.search(rf"\b{re.escape(drug)}\b", norm_soap)]
    if not soap_drugs:
        return violations

    combined_cap_text = _normalize_text(" ".join(
        f"{cap.proposition_text} {cap.canonical_concept} " + " ".join(ev.quote for ev in cap.evidence)
        for cap in linked_caps
    ))

    cap_drugs = [drug for drug in KNOWN_DRUGS if re.search(rf"\b{re.escape(drug)}\b", combined_cap_text)]

    for drug in soap_drugs:
        if drug not in cap_drugs and cap_drugs:
            violations.append(SafetyViolation("medication_mismatch", f"Medication mismatch: SOAP mentions {drug.capitalize()} but linked CAP mentions {', '.join(d.capitalize() for d in cap_drugs)}"))

    return violations


def _check_numbers_mismatch(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)
    # Extract numbers
    numbers = re.findall(r"\b\d+(?:\.\d+)?\b", norm_soap)
    # Filter out non-clinical / index numbers
    numbers = [n for n in numbers if n not in {"2026", "2025"}]

    if not numbers:
        return violations

    combined_cap_text = _normalize_text(" ".join(
        f"{cap.proposition_text} {cap.canonical_concept} " + " ".join(ev.quote for ev in cap.evidence)
        for cap in linked_caps
    ))

    for num in numbers:
        if not re.search(rf"\b{re.escape(num)}\b", combined_cap_text):
            violations.append(SafetyViolation("numbers_mismatch", f"Number {num} in SOAP item is not supported by linked CAPs"))

    return violations


def _check_negation_contradiction(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)
    neg_kws = ["không", "chưa", "âm tính", "âm", "không có"]

    for cap in linked_caps:
        norm_cap_prop = _normalize_text(cap.proposition_text)
        is_cap_negated = cap.verification_status == "negated" or any(kw in norm_cap_prop for kw in neg_kws)

        if is_cap_negated:
            # CAP is negated -> SOAP must express negation or negative finding
            soap_has_negation = any(kw in norm_soap for kw in neg_kws)
            if not soap_has_negation:
                violations.append(SafetyViolation("negation_contradiction", f"CAP {cap.prop_id} is negated, but SOAP item asserts affirmation"))
        elif cap.verification_status == "affirmed":
            # CAP is affirmed -> check if SOAP explicitly negates this specific concept
            concepts = [w for w in cap.canonical_concept.casefold().split() if len(w) > 2]
            for c in concepts:
                # Direct negation pattern: "không [c]", "chưa [c]", "không có [c]"
                if re.search(rf"\b(?:không|chưa|không có)\s+(?:\w+\s+){{0,2}}{re.escape(c)}\b", norm_soap):
                    violations.append(SafetyViolation("negation_contradiction", f"CAP {cap.prop_id} is affirmed, but SOAP item asserts negation"))
                    break

    return violations


def _check_temporality_contradiction(soap_text: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)

    for cap in linked_caps:
        norm_cap_prop = _normalize_text(cap.proposition_text)
        if cap.temporality == "past" or any(kw in norm_cap_prop for kw in ["năm ngoái", "tiền sử", "đã từng"]):
            if any(kw in norm_soap for kw in ["hiện tại", "đang", "cấp"]):
                violations.append(SafetyViolation("temporality_contradiction", f"CAP {cap.prop_id} is past temporality, but SOAP asserts current active condition"))

        if cap.temporality == "future" or cap.clinical_status == "planned" or any(kw in norm_cap_prop for kw in ["tái khám", "tuần sau", "khám lại"]):
            if any(kw in norm_soap for kw in ["đã tái khám", "đã khám lại", "đã thực hiện", "tuần trước"]):
                violations.append(SafetyViolation("temporality_contradiction", f"CAP {cap.prop_id} is future temporality, but SOAP asserts completed action"))

    return violations


DIAGNOSIS_KEYWORDS = ["chẩn đoán", "viêm màng não", "viêm phổi", "viêm họng", "đái tháo đường", "tăng huyết áp"]


def _check_unsupported_claim(soap_text: str, section_name: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    violations = []
    norm_soap = _normalize_text(soap_text)

    if section_name == "A":
        for diag in DIAGNOSIS_KEYWORDS:
            if diag in norm_soap:
                grounded = any(
                    diag in _normalize_text(cap.proposition_text) or
                    diag in _normalize_text(cap.canonical_concept) or
                    (cap.speaker_source == "clinician" and cap.cap_type in {"Problem", "ProblemHistory", "ExamFinding"} and any(w in _normalize_text(cap.canonical_concept) for w in diag.split()))
                    for cap in linked_caps
                )
                if not grounded:
                    violations.append(SafetyViolation("unsupported_diagnosis", f"Assessment '{diag}' in SOAP is not supported by linked CAPs"))
                    break

    elif section_name == "P":
        drugs = [d for d in KNOWN_DRUGS if d in norm_soap]
        for drug in drugs:
            grounded = any(
                drug in _normalize_text(cap.proposition_text) or
                drug in _normalize_text(cap.canonical_concept)
                for cap in linked_caps
            )
            if not grounded:
                violations.append(SafetyViolation("unsupported_treatment", f"Treatment '{drug}' in SOAP is not supported by linked CAPs"))

    return violations


def check_item_safety(item: SoapItem, section_name: str, linked_caps: list[Cap]) -> list[SafetyViolation]:
    """
    Tier 1 Deterministic Safety & Grounding Checker.

    Executes rule-based validation over numbers, dosages, units, medications,
    vital signs, lab values, negation, temporality, and clinical claim grounding.
    """
    violations: list[SafetyViolation] = []

    # 1. Vital Signs Mismatches (BP, HR, Temp, SpO2)
    violations.extend(_check_vital_signs(item.text, linked_caps))

    # 2. Lab Value Mismatches
    violations.extend(_check_lab_values(item.text, linked_caps))

    # 3. Dosage & Units Mismatches
    violations.extend(_check_dosage_and_units(item.text, linked_caps))

    # 4. Medication Mismatches
    violations.extend(_check_medication_mismatch(item.text, linked_caps))

    # 5. General Numbers Mismatch (if not caught above)
    if not violations:
        violations.extend(_check_numbers_mismatch(item.text, linked_caps))

    # 6. Negation Contradiction
    violations.extend(_check_negation_contradiction(item.text, linked_caps))

    # 7. Temporality Contradiction
    violations.extend(_check_temporality_contradiction(item.text, linked_caps))

    # 8. Unsupported Diagnosis / Treatment (Grounding)
    violations.extend(_check_unsupported_claim(item.text, section_name, linked_caps))

    return violations

"""Strict LLM Repair Policy Classifier for SOAP pipeline."""

from __future__ import annotations

REPAIRABLE_STRUCTURAL_CODES = {
    "invalid_model_output",
    "missing_cap_link",
    "invalid_cap_link",
    "candidate_boundary_violation",
    "candidate_coverage_violation",
    "subjective_source",
    "assessment_source",
    "objective_source",
    "plan_source",
}

NON_REPAIRABLE_SAFETY_CODES = {
    "ambiguous_quote",
    "invalid_quote",
    "unsupported_clinical_claim",
    "dosage_mismatch",
    "medication_mismatch",
    "units_mismatch",
    "numbers_mismatch",
    "bp_mismatch",
    "heart_rate_mismatch",
    "temperature_mismatch",
    "spo2_mismatch",
    "lab_value_mismatch",
    "negation_contradiction",
    "temporality_contradiction",
    "unsupported_diagnosis",
    "unsupported_treatment",
}


def is_repairable_error(error_code: str | None, repair_count: int = 0, max_repairs: int = 1) -> bool:
    """
    Evaluates whether an error code is a structural error allowed for LLM repair.

    Only wrong_section (subjective_source, assessment_source, etc.), missing_cap_link,
    and invalid_model_output (JSON syntax error) are allowed, provided repair_count < max_repairs.

    Safety errors, clinical contradictions, and system errors return False.
    """
    if not error_code or repair_count >= max_repairs:
        return False
    if error_code in NON_REPAIRABLE_SAFETY_CODES:
        return False
    return error_code in REPAIRABLE_STRUCTURAL_CODES

"""Structural grounding checks; semantic support is a reviewer decision."""

from __future__ import annotations

import re

from src.schemas.soap import Cap, SoapDocument, Transcript
from src.services.soap.errors import SoapFailure
from src.services.soap.renderer import compute_section_candidates
from src.services.soap.semantic_validator import check_item_safety
from src.services.soap.text_utils import resolve_conservative_evidence_quote

SEVERITY_EQUIVALENCE_MAP = {
    "mức độ vừa": ["mức độ vừa", "mức trung bình", "trung bình", "vừa", "vừa phải", "mức vừa"],
    "dữ dội": ["dữ dội", "nghiêm trọng", "rất nặng", "rất đau", "nặng nề"],
    "nhẹ": ["nhẹ", "mức độ nhẹ", "hơi"],
}


def check_item_semantic_coverage(item_text: str, cap_proposition_text: str) -> list[str]:
    """
    Verify that essential duration time-units and qualitative modifiers from cap_proposition_text
    are semantically represented in item_text.
    """
    item_lower = item_text.casefold()
    cap_lower = cap_proposition_text.casefold()
    missing = []

    # 1. Quantitative Duration Modifiers (e.g. "3 tháng", "2 tuần", "5 ngày")
    time_matches = re.findall(r"\b\d+\s*(?:tháng|tuần|ngày|năm|giờ|phút)\b", cap_lower)
    for tm in time_matches:
        if tm not in item_lower:
            missing.append(tm)

    # 2. Qualitative Severity Modifiers with Synonym Equivalence Sets
    for key, synonyms in SEVERITY_EQUIVALENCE_MAP.items():
        if key in cap_lower:
            if not any(syn in item_lower for syn in synonyms):
                missing.append(key)

    return list(dict.fromkeys(missing))


def filter_usable_caps(caps: list[Cap]) -> list[Cap]:
    """
    Sanitize CAP list for SOAP rendering.

    Filters out CAPs with resolution_status != 'current' (superseded, needs_review/quarantined).
    Returns a new list without mutating the original input caps list.
    """
    return [cap for cap in caps if cap.resolution_status == "current"]


def resolve_superseded_cap_links(soap: SoapDocument, caps: list[Cap]) -> tuple[SoapDocument, list[str]]:
    """
    Deterministically resolves links to superseded CAPs in SOAP items.

    For any cap_id in item.cap_ids that is superseded, if there is EXACTLY ONE active/usable
    CAP in caps whose `supersedes` chain points to it, the cap_id is updated to the active
    replacement CAP ID.

    If 0 or >1 replacement CAPs exist, no replacement is made (fail-safe / HITL).
    """
    active_caps = {cap.prop_id: cap for cap in caps if cap.resolution_status not in {"superseded", "needs_review"}}

    # Build mapping from old_id -> set of active replacement prop_ids
    supersedes_map: dict[str, set[str]] = {}
    for active_id, active_cap in active_caps.items():
        visited = set()
        queue = list(active_cap.supersedes)
        while queue:
            old_id = queue.pop(0)
            if old_id in visited:
                continue
            visited.add(old_id)
            supersedes_map.setdefault(old_id, set()).add(active_id)
            past_cap = next((c for c in caps if c.prop_id == old_id), None)
            if past_cap and past_cap.supersedes:
                queue.extend(past_cap.supersedes)

    resolutions: list[str] = []
    for section_name in ("S", "O", "A", "P"):
        section = getattr(soap, section_name)
        for item in section.items:
            new_cap_ids = []
            for cap_id in item.cap_ids:
                if cap_id in active_caps:
                    new_cap_ids.append(cap_id)
                else:
                    replacements = supersedes_map.get(cap_id, set())
                    if len(replacements) == 1:
                        rep_id = next(iter(replacements))
                        new_cap_ids.append(rep_id)
                        resolutions.append(f"Item {item.item_id}: resolved superseded CAP {cap_id} -> {rep_id}")
                    else:
                        new_cap_ids.append(cap_id)
            seen_ids = set()
            deduped = []
            for cid in new_cap_ids:
                if cid not in seen_ids:
                    seen_ids.add(cid)
                    deduped.append(cid)
            item.cap_ids = deduped

    return soap, resolutions


def validate_and_partition_caps(caps: list[Cap], transcript: Transcript) -> tuple[list[Cap], list[Cap], list[str]]:
    """
    Validates each CAP individually, partitioning them into usable_caps and quarantined_caps.

    - Usable CAPs: Pass strict evidence grounding and source validation checks.
    - Quarantined CAPs: Encounter recoverable validation errors (e.g. speaker_mismatch, invalid_quote).
      Their resolution_status is set to 'needs_review', and detailed warning logs are recorded.

    Returns:
        (usable_caps, quarantined_caps, warnings)
    """
    turns = {turn.turn_id: turn for turn in transcript.turns}
    warnings: list[str] = []
    quarantined: list[Cap] = []
    usable: list[Cap] = []

    seen_ids: set[str] = set()
    by_id: dict[str, Cap] = {}

    for cap in caps:
        # Check duplicate prop_id
        if cap.prop_id in seen_ids:
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: duplicate_prop_id (Duplicate CAP ID {cap.prop_id})")
            continue

        # Check planned_time_state
        if cap.clinical_status == "planned" and cap.temporality != "future":
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: planned_time_state (Planned CAP {cap.prop_id} must be future)")
            continue

        # Check future_action_state
        if cap.temporality == "future" and cap.cap_type in {"Order", "MedicationRequest", "FollowUp"} and cap.clinical_status != "planned":
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: future_action_state (Future action {cap.prop_id} must be planned)")
            continue

        # Check medication_plan_state
        if cap.medication_state in {"start_planned", "stop_planned", "change_planned"} and cap.clinical_status != "planned":
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: medication_plan_state (Medication plan {cap.prop_id} must be planned)")
            continue

        # Check speaker_mismatch
        if not any(turns.get(ev.turn_id) and turns[ev.turn_id].speaker == cap.speaker_source for ev in cap.evidence):
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: speaker_mismatch (CAP {cap.prop_id} has no evidence from its source speaker '{cap.speaker_source}')")
            continue

        # Check invalid_quote & resolve quote
        quote_error = False
        resolved_evidences = []
        for ev in cap.evidence:
            turn = turns.get(ev.turn_id)
            if turn is None or not ev.quote.strip():
                quote_error = True
                warnings.append(f"CAP {cap.prop_id} quarantined: invalid_quote (CAP {cap.prop_id} quote is absent from turn {ev.turn_id})")
                break
            resolved_quote, _ = resolve_conservative_evidence_quote(ev.quote, turn.text)
            if resolved_quote is None:
                quote_error = True
                warnings.append(f"CAP {cap.prop_id} quarantined: invalid_quote (CAP {cap.prop_id} quote is absent from turn {ev.turn_id})")
                break
            ev.quote = resolved_quote
            ev.source_segment_id = turn.source_segment_id
            ev.speaker = turn.speaker
            ev.start_ms = turn.start_ms
            ev.end_ms = turn.end_ms
            resolved_evidences.append(ev)

        if quote_error:
            cap.resolution_status = "needs_review"
            quarantined.append(cap)
            continue

        seen_ids.add(cap.prop_id)
        by_id[cap.prop_id] = cap
        usable.append(cap)

    # Check invalid_supersedes & supersedes_cycle safely
    for cap in usable:
        valid_supersedes = []
        has_invalid_supersedes = False
        for old_id in cap.supersedes:
            if old_id not in by_id or old_id == cap.prop_id:
                has_invalid_supersedes = True
            else:
                valid_supersedes.append(old_id)
        if has_invalid_supersedes:
            cap.supersedes = valid_supersedes
            warnings.append(f"CAP {cap.prop_id} had invalid supersedes links cleaned")

    visiting, visited = set(), set()

    def visit(prop_id: str) -> bool:
        if prop_id in visiting:
            return True
        if prop_id in visited:
            return False
        visiting.add(prop_id)
        for previous in by_id[prop_id].supersedes:
            if previous in by_id and visit(previous):
                visiting.remove(prop_id)
                return True
        visiting.remove(prop_id)
        visited.add(prop_id)
        return False

    final_usable: list[Cap] = []
    for cap in usable:
        visiting.clear()
        if visit(cap.prop_id):
            cap.resolution_status = "needs_review"
            cap.supersedes = []
            quarantined.append(cap)
            warnings.append(f"CAP {cap.prop_id} quarantined: supersedes_cycle (Cycle detected in supersedes chain)")
        else:
            final_usable.append(cap)

    superseded = {old for cap in final_usable for old in cap.supersedes}
    for cap in final_usable:
        cap.resolution_status = "superseded" if cap.prop_id in superseded else cap.resolution_status
        if cap.supersedes:
            warnings.append(f"Review correction asserted by {cap.prop_id}: {', '.join(cap.supersedes)}")

    groups: dict[tuple[str, str], list[Cap]] = {}
    for cap in final_usable:
        if cap.resolution_status != "superseded":
            groups.setdefault((cap.canonical_concept.casefold().strip(), cap.temporality), []).append(cap)
    for group in groups.values():
        polarities = {cap.verification_status for cap in group}
        if "affirmed" in polarities and "negated" in polarities:
            for cap in group:
                cap.resolution_status = "needs_review"
            warnings.append("Conflicting CAPs need review: " + ", ".join(cap.prop_id for cap in group))

    for cap in final_usable:
        if cap.resolution_status == "needs_review":
            label = f"CAP {cap.prop_id} needs review"
            if label not in warnings:
                warnings.append(label)

    return final_usable, quarantined, warnings


def validate_caps(caps: list[Cap], transcript: Transcript) -> tuple[list[Cap], list[str]]:
    usable, quarantined, warnings = validate_and_partition_caps(caps, transcript)
    if quarantined:
        first_q = quarantined[0]
        # Raise SoapFailure for existing direct unit test callers expecting exception
        for w in warnings:
            if f"CAP {first_q.prop_id} quarantined:" in w:
                code = w.split("quarantined: ", 1)[1].split(" ", 1)[0]
                msg = w.split("(", 1)[1].rstrip(")") if "(" in w else w
                raise SoapFailure("validate_caps", code, msg)
        raise SoapFailure("validate_caps", "invalid_cap", f"CAP {first_q.prop_id} is invalid")
    return usable, warnings


def normalize_cap_links(soap: SoapDocument, caps: list[Cap]) -> SoapDocument:
    """Deterministically trim/casefold cap_ids to canonical prop_ids before validation."""
    valid = {c.prop_id: c.prop_id for c in caps}
    folded: dict[str, str] = {}
    for c in caps:
        folded.setdefault(c.prop_id.casefold().strip(), c.prop_id)
    for section_name in ("S", "O", "A", "P"):
        for item in getattr(soap, section_name).items:
            normalized: list[str] = []
            for cap_id in item.cap_ids:
                candidate = str(cap_id).strip().casefold()
                canonical = valid.get(candidate) or folded.get(candidate) or cap_id
                if canonical not in normalized:
                    normalized.append(canonical)
            item.cap_ids = normalized
    return soap


def check_candidate_coverage(soap: SoapDocument, section_candidates: dict[str, list[str]], caps: list[Cap], invalid_status: int = 502) -> None:
    cap_map = {c.prop_id: c for c in caps if c.resolution_status == "current"}
    for section_name in ("S", "O", "A", "P"):
        section = getattr(soap, section_name)
        if section.missing:
            continue

        # 1. Verify that every linked CAP in each section item preserves essential clinical modifiers
        for item in section.items:
            for cap_id in item.cap_ids:
                cap = cap_map.get(cap_id)
                if not cap:
                    continue
                missing_mods = check_item_semantic_coverage(item.text, cap.proposition_text)
                if missing_mods:
                    raise SoapFailure(
                        "validate_soap",
                        "candidate_coverage_violation",
                        f"Item {item.item_id} in section {section_name} links CAP {cap.prop_id} but omits essential modifier '{missing_mods[0]}' from proposition '{cap.proposition_text}'",
                        invalid_status,
                    )

        allowed_candidates = set(section_candidates.get(section_name, []))
        if not allowed_candidates:
            continue
        used_candidates = {cid for item in section.items for cid in item.cap_ids if cid in allowed_candidates}
        omitted_candidates = allowed_candidates - used_candidates

        if not omitted_candidates:
            continue

        used_caps = [cap_map[cid] for cid in used_candidates if cid in cap_map]
        used_concepts = {c.canonical_concept.casefold().strip() for c in used_caps}

        truly_omitted = []
        for om_id in sorted(omitted_candidates):
            om_cap = cap_map.get(om_id)
            if not om_cap:
                continue
            om_concept = om_cap.canonical_concept.casefold().strip()
            if om_concept not in used_concepts:
                truly_omitted.append(om_id)
            else:
                om_text = om_cap.proposition_text.casefold().strip()
                if not any(om_text in c.proposition_text.casefold().strip() or c.proposition_text.casefold().strip() in om_text for c in used_caps):
                    truly_omitted.append(om_id)

        if truly_omitted:
            raise SoapFailure(
                "validate_soap",
                "candidate_coverage_violation",
                f"Section {section_name} omitted meaningful candidate CAPs: {sorted(truly_omitted)}",
                invalid_status,
            )


def validate_soap(soap: SoapDocument, caps: list[Cap], *, generated: bool) -> SoapDocument:
    invalid_status = 502 if generated else 422
    soap, _ = resolve_superseded_cap_links(soap, caps)
    soap = normalize_cap_links(soap, caps)
    current = {cap.prop_id: cap for cap in caps if cap.resolution_status == "current"}
    section_candidates = compute_section_candidates(list(current.values()))
    seen = set()

    for section_name in ("S", "O", "A", "P"):
        allowed_candidates = set(section_candidates.get(section_name, []))
        section = getattr(soap, section_name)
        for item in section.items:
            if item.item_id in seen:
                raise SoapFailure("validate_soap", "duplicate_item_id", "SOAP item IDs must be unique", invalid_status)
            seen.add(item.item_id)
            if len(item.cap_ids) != len(set(item.cap_ids)):
                raise SoapFailure("validate_soap", "duplicate_cap_link", f"Item {item.item_id} repeats CAP IDs", invalid_status)
            if generated and not item.cap_ids:
                raise SoapFailure("validate_soap", "missing_cap_link", f"Item {item.item_id} lacks CAP")
            linked_caps = []
            for cap_id in item.cap_ids:
                cap = current.get(cap_id)
                if cap is None:
                    raise SoapFailure("validate_soap", "invalid_cap_link", f"Item {item.item_id} links missing or superseded CAP", invalid_status)
                linked_caps.append(cap)
                if section_name == "S" and cap.speaker_source != "patient":
                    raise SoapFailure("validate_soap", "subjective_source", "Subjective item requires patient-reported source", invalid_status)
                if section_name == "A" and (cap.speaker_source != "clinician" or cap.cap_type not in {"Problem", "ProblemHistory"}):
                    raise SoapFailure("validate_soap", "assessment_source", "Assessment requires clinician source", invalid_status)
                if section_name == "O" and (cap.speaker_source != "clinician" or cap.cap_type not in {"ExamFinding", "TestResult"}):
                    raise SoapFailure("validate_soap", "objective_source", "Objective item requires exam or test source", invalid_status)
                if section_name == "P" and (cap.speaker_source != "clinician" or cap.cap_type not in {"MedicationRequest", "Order", "FollowUp", "Counseling"}):
                    raise SoapFailure("validate_soap", "plan_source", "Plan requires clinician-directed plan source", invalid_status)
                if cap_id not in allowed_candidates:
                    raise SoapFailure("validate_soap", "candidate_boundary_violation", f"Item {item.item_id} in section {section_name} links CAP {cap_id} outside section candidate allowlist", invalid_status)
            if generated:
                item.origin = "ai"
                item.review_status = "needs_review"
                item.source_link_status = "valid"
                item.manual_reason = None
                # Tier 1 Deterministic Safety & Grounding Check
                if linked_caps:
                    violations = check_item_safety(item, section_name, linked_caps)
                    if violations:
                        item.support_status = "unsupported"
                    else:
                        item.support_status = "pending"
                else:
                    item.support_status = "pending"
            elif not item.cap_ids:
                if item.origin != "reviewer" or not item.manual_reason or not item.manual_reason.strip():
                    raise SoapFailure("validate_soap", "manual_reason_required", "Unlinked reviewer item needs a reason", 422)
                item.source_link_status = "invalid"
            else:
                item.source_link_status = "valid"
                if linked_caps:
                    violations = check_item_safety(item, section_name, linked_caps)
                    if violations:
                        item.support_status = "unsupported"

    if generated:
        check_candidate_coverage(soap, section_candidates, list(current.values()), invalid_status)

    return soap


def check_approval(soap: SoapDocument, warnings: list[str], decisions: dict[str, str]) -> None:
    for warning in warnings:
        if not decisions.get(warning, "").strip():
            raise SoapFailure("approve", "unresolved_warning", f"Resolve warning: {warning}", 409)
    for section_name in ("S", "O", "A", "P"):
        for item in getattr(soap, section_name).items:
            manual = item.origin == "reviewer" and not item.cap_ids and bool(item.manual_reason and item.manual_reason.strip())
            if item.review_status != "reviewed":
                raise SoapFailure("approve", "item_not_reviewed", f"Item {item.item_id} needs review", 409)
            if manual:
                if item.support_status == "supported":
                    raise SoapFailure("approve", "false_support", "Unlinked item cannot be marked supported", 409)
            elif item.support_status != "supported":
                raise SoapFailure("approve", "unsupported_item", f"Item {item.item_id} needs support decision", 409)

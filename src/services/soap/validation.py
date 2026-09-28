"""Structural grounding checks; semantic support is a reviewer decision."""

from __future__ import annotations

from src.schemas.soap import Cap, SoapDocument, Transcript
from src.services.soap.errors import SoapFailure


def validate_caps(caps: list[Cap], transcript: Transcript) -> tuple[list[Cap], list[str]]:
    turns = {turn.turn_id: turn for turn in transcript.turns}
    ids = [cap.prop_id for cap in caps]
    if len(ids) != len(set(ids)):
        raise SoapFailure("validate_caps", "duplicate_prop_id", "CAP IDs must be unique")
    by_id = {cap.prop_id: cap for cap in caps}
    warnings = []
    for cap in caps:
        if cap.clinical_status == "planned" and cap.temporality != "future":
            raise SoapFailure("validate_caps", "planned_time_state", f"Planned CAP {cap.prop_id} must be future")
        if cap.temporality == "future" and cap.cap_type in {"Order", "MedicationRequest", "FollowUp"} and cap.clinical_status != "planned":
            raise SoapFailure("validate_caps", "future_action_state", f"Future action {cap.prop_id} must be planned")
        if cap.medication_state in {"start_planned", "stop_planned", "change_planned"} and cap.clinical_status != "planned":
            raise SoapFailure("validate_caps", "medication_plan_state", f"Medication plan {cap.prop_id} must be planned")
        if not any(turns.get(ev.turn_id) and turns[ev.turn_id].speaker == cap.speaker_source for ev in cap.evidence):
            raise SoapFailure("validate_caps", "speaker_mismatch", f"CAP {cap.prop_id} has no evidence from its source speaker")
        for ev in cap.evidence:
            turn = turns.get(ev.turn_id)
            if turn is None or not ev.quote.strip() or ev.quote not in turn.text:
                raise SoapFailure("validate_caps", "invalid_quote", f"CAP {cap.prop_id} quote is absent from turn {ev.turn_id}")
            ev.source_segment_id = turn.source_segment_id
            ev.speaker = turn.speaker
            ev.start_ms = turn.start_ms
            ev.end_ms = turn.end_ms
        for old_id in cap.supersedes:
            if old_id not in by_id or old_id == cap.prop_id:
                raise SoapFailure("validate_caps", "invalid_supersedes", f"CAP {cap.prop_id} has invalid supersedes")
    visiting, visited = set(), set()

    def visit(prop_id: str) -> None:
        if prop_id in visiting:
            raise SoapFailure("validate_caps", "supersedes_cycle", "CAP supersedes contains a cycle")
        if prop_id in visited:
            return
        visiting.add(prop_id)
        for previous in by_id[prop_id].supersedes:
            visit(previous)
        visiting.remove(prop_id)
        visited.add(prop_id)

    for prop_id in ids:
        visit(prop_id)
    superseded = {old for cap in caps for old in cap.supersedes}
    for cap in caps:
        cap.resolution_status = "superseded" if cap.prop_id in superseded else cap.resolution_status
        if cap.supersedes:
            warnings.append(f"Review correction asserted by {cap.prop_id}: {', '.join(cap.supersedes)}")
    # Same concept and time with contradictory polarity remains visible for review.
    groups: dict[tuple[str, str], list[Cap]] = {}
    for cap in caps:
        if cap.resolution_status != "superseded":
            groups.setdefault((cap.canonical_concept.casefold().strip(), cap.temporality), []).append(cap)
    for group in groups.values():
        polarities = {cap.verification_status for cap in group}
        if "affirmed" in polarities and "negated" in polarities:
            for cap in group:
                cap.resolution_status = "needs_review"
            warnings.append("Conflicting CAPs need review: " + ", ".join(cap.prop_id for cap in group))
    for cap in caps:
        if cap.resolution_status == "needs_review":
            label = f"CAP {cap.prop_id} needs review"
            if label not in warnings:
                warnings.append(label)
    return caps, warnings


def validate_soap(soap: SoapDocument, caps: list[Cap], *, generated: bool) -> SoapDocument:
    invalid_status = 502 if generated else 422
    current = {cap.prop_id: cap for cap in caps if cap.resolution_status != "superseded"}
    seen = set()
    for section_name in ("S", "O", "A", "P"):
        section = getattr(soap, section_name)
        for item in section.items:
            if item.item_id in seen:
                raise SoapFailure("validate_soap", "duplicate_item_id", "SOAP item IDs must be unique", invalid_status)
            seen.add(item.item_id)
            if len(item.cap_ids) != len(set(item.cap_ids)):
                raise SoapFailure("validate_soap", "duplicate_cap_link", f"Item {item.item_id} repeats CAP IDs", invalid_status)
            if generated and not item.cap_ids:
                raise SoapFailure("validate_soap", "missing_cap_link", f"Item {item.item_id} lacks CAP")
            for cap_id in item.cap_ids:
                cap = current.get(cap_id)
                if cap is None:
                    raise SoapFailure("validate_soap", "invalid_cap_link", f"Item {item.item_id} links missing or superseded CAP", invalid_status)
                if section_name == "A" and cap.speaker_source != "clinician":
                    raise SoapFailure("validate_soap", "assessment_source", "Assessment requires clinician source", invalid_status)
                if section_name == "O" and cap.cap_type not in {"ExamFinding", "TestResult"}:
                    raise SoapFailure("validate_soap", "objective_source", "Objective item requires exam or test source", invalid_status)
                if section_name == "P" and cap.speaker_source != "clinician":
                    raise SoapFailure("validate_soap", "plan_source", "Plan requires clinician source", invalid_status)
            if generated:
                item.origin = "ai"
                item.review_status = "needs_review"
                item.support_status = "pending"
                item.source_link_status = "valid"
                item.manual_reason = None
            elif not item.cap_ids:
                if item.origin != "reviewer" or not item.manual_reason or not item.manual_reason.strip():
                    raise SoapFailure("validate_soap", "manual_reason_required", "Unlinked reviewer item needs a reason", 422)
                item.source_link_status = "invalid"
            else:
                item.source_link_status = "valid"
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

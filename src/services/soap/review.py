"""Revision, review, approval and export over the immutable store."""

from __future__ import annotations

from datetime import UTC, datetime

from src.schemas.soap import Cap, RevisionRequest, SoapDocument, SoapRevision
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import check_approval, validate_soap


def read_run(store, run_id: str) -> dict:
    run = store.load(run_id)
    return {**run, "caps": run["caps"] or [], "caps_complete": run["caps"] is not None}


def revise(store, run_id: str, request: RevisionRequest) -> dict:
    store.assert_revision(run_id, request.expected_revision)
    run = store.load(run_id)
    prior = run["latest_revision"]
    if prior is None:
        raise SoapFailure("revision", "no_draft", "Generate SOAP before editing", 409, run_id)
    old_items = {item["item_id"]: item for section in prior["soap"].values() for item in section["items"]}
    soap = SoapDocument.model_validate(request.soap.model_dump(mode="json"))
    for section_name in ("S", "O", "A", "P"):
        for item in getattr(soap, section_name).items:
            old = old_items.get(item.item_id)
            if old is None or item.text != old["text"] or item.cap_ids != old["cap_ids"]:
                item.origin = "reviewer"
                item.review_status = "needs_review"
                item.support_status = "pending"
            if not item.cap_ids:
                item.origin = "reviewer"
                item.source_link_status = "invalid"
                if not item.manual_reason:
                    raise SoapFailure("revision", "manual_reason_required", "Unlinked item needs a reason", 422, run_id)
                if item.support_status == "supported":
                    raise SoapFailure("revision", "false_support", "Unlinked item cannot be supported", 422, run_id)
    soap = validate_soap(soap, [Cap.model_validate(cap) for cap in run["caps"]], generated=False)
    revision = SoapRevision(
        revision=request.expected_revision + 1, parent_revision=request.expected_revision,
        status="draft", soap=soap, created_at=datetime.now(UTC),
        model=prior.get("model"), prompt_version=prior.get("prompt_version"),
        reviewer_name=request.reviewer_name,
        warning_decisions=request.warning_decisions,
    )
    return store.append_revision(run_id, revision, request.expected_revision)


def approve(store, run_id: str, expected_revision: int, reviewer_name: str, warning_decisions: dict[str, str]) -> dict:
    store.assert_revision(run_id, expected_revision)
    run = store.load(run_id)
    prior = run["latest_revision"]
    if prior is None:
        raise SoapFailure("approve", "no_draft", "Generate SOAP before approval", 409, run_id)
    if prior["status"] == "final":
        raise SoapFailure("approve", "already_final", "Current revision is already final", 409, run_id)
    decisions = {**prior.get("warning_decisions", {}), **warning_decisions}
    soap = SoapDocument.model_validate(prior["soap"])
    check_approval(soap, run["cap_warnings"], decisions)
    revision = SoapRevision(
        revision=expected_revision + 1, parent_revision=expected_revision, status="final", soap=soap,
        created_at=datetime.now(UTC), approved_at=datetime.now(UTC), model=prior.get("model"),
        prompt_version=prior.get("prompt_version"), reviewer_name=reviewer_name,
        warning_decisions=decisions,
    )
    return store.append_revision(run_id, revision, expected_revision)


def export_revision(store, run_id: str, revision_number: int) -> dict:
    run = store.load(run_id)
    revision = next((rev for rev in run["revisions"] if rev["revision"] == revision_number), None)
    if revision is None:
        raise SoapFailure("export", "revision_not_found", "Revision not found", 404, run_id)
    return {"schema_version": "1.0", "run_id": run_id, "metadata": run["metadata"],
            "transcript": run["transcript"], "caps": run["caps"],
            "cap_warnings": run["cap_warnings"], "revision": revision}

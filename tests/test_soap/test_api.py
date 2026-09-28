import json
from copy import deepcopy

import pytest

from src.api import soap_routes
from src.main import app, lifespan
from src.services.soap.store import SoapStore
from tests.test_soap.conftest import FakeLLM


@pytest.mark.asyncio
async def test_api_review_approval_export_and_reopen(client, soap_override, sample, monkeypatch):
    transcript, caps, soap = sample
    llm = FakeLLM([json.dumps(caps), json.dumps(soap)])
    monkeypatch.setattr(soap_routes, "get_soap_llm", lambda: llm)
    extracted = await client.post("/api/v1/soap/extract-caps", json={"input_format": "canonical", "content": transcript})
    assert extracted.status_code == 200, extracted.text
    run_id = extracted.json()["run_id"]
    generated = await client.post(f"/api/v1/soap/runs/{run_id}/generate", json={"expected_revision": 0})
    assert generated.status_code == 200, generated.text
    draft = generated.json()["revision"]["soap"]
    invalid_link = deepcopy(draft)
    invalid_link["S"]["items"][0]["cap_ids"] = ["missing-cap"]
    rejected = await client.post(f"/api/v1/soap/runs/{run_id}/revisions", json={
        "expected_revision": 1, "soap": invalid_link,
    })
    assert rejected.status_code == 422
    for section in draft.values():
        for item in section["items"]:
            item["review_status"] = "reviewed"
            item["support_status"] = "supported"
    revised = await client.post(f"/api/v1/soap/runs/{run_id}/revisions", json={"expected_revision": 1, "soap": draft})
    assert revised.status_code == 200, revised.text
    stale = await client.post(f"/api/v1/soap/runs/{run_id}/generate", json={"expected_revision": 1})
    assert stale.status_code == 409
    approved = await client.post(f"/api/v1/soap/runs/{run_id}/approve", json={"expected_revision": 2, "reviewer_name": "Demo reviewer"})
    assert approved.status_code == 200, approved.text
    final = approved.json()["revision"]
    assert final["status"] == "final" and final["revision"] == 3
    exported = await client.get(f"/api/v1/soap/runs/{run_id}/export?revision=3")
    assert exported.status_code == 200
    assert exported.json()["caps"][0]["evidence"][0]["quote"] == "đau gối trái ba ngày"
    reopened = SoapStore(soap_override.root).load(run_id)
    assert reopened["latest_revision"]["status"] == "final"
    assert len(reopened["revisions"]) == 3

    edited_soap = final["soap"]
    edited_soap["S"]["items"][0]["text"] = "Đau gối trái đã được người review chỉnh câu."
    edited_soap["S"]["items"].append({
        "item_id": "manual-1", "text": "Thông tin bổ sung từ người review.",
        "cap_ids": [], "origin": "reviewer", "review_status": "reviewed",
        "source_link_status": "invalid", "support_status": "unsupported",
        "manual_reason": "Được bổ sung ngoài transcript giả lập.",
    })
    after_final = await client.post(f"/api/v1/soap/runs/{run_id}/revisions", json={
        "expected_revision": 3, "soap": edited_soap,
    })
    assert after_final.status_code == 200, after_final.text
    revision_four = after_final.json()["revision"]
    assert revision_four["status"] == "draft"
    assert all(item["review_status"] == "needs_review" for item in revision_four["soap"]["S"]["items"])
    blocked = await client.post(f"/api/v1/soap/runs/{run_id}/approve", json={
        "expected_revision": 4, "reviewer_name": "Demo reviewer",
    })
    assert blocked.status_code == 409
    confirmed_soap = revision_four["soap"]
    for item in confirmed_soap["S"]["items"]:
        item["review_status"] = "reviewed"
        item["support_status"] = "supported" if item["cap_ids"] else "unsupported"
    confirmed = await client.post(f"/api/v1/soap/runs/{run_id}/revisions", json={
        "expected_revision": 4, "soap": confirmed_soap,
    })
    assert confirmed.status_code == 200, confirmed.text
    approved_again = await client.post(f"/api/v1/soap/runs/{run_id}/approve", json={
        "expected_revision": 5, "reviewer_name": "Demo reviewer",
    })
    assert approved_again.status_code == 200, approved_again.text
    reopened = SoapStore(soap_override.root).load(run_id)
    assert reopened["revisions"][2]["status"] == "final"
    assert reopened["revisions"][2]["soap"]["S"]["items"][0]["text"] == "Đau gối trái ba ngày"
    assert reopened["latest_revision"]["revision"] == 6


@pytest.mark.asyncio
async def test_demo_lifespan_does_not_create_database_tables(monkeypatch):
    from src.models.base import Base

    def unexpected_ddl(*args, **kwargs):
        raise AssertionError("create_all should not run in the SOAP demo")

    monkeypatch.setattr(Base.metadata, "create_all", unexpected_ddl)
    async with lifespan(app):
        pass

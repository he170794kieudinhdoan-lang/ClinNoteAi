import json

import httpx
import pytest

import src.services.icd_kcb as icd_kcb
from src.config import get_settings
from src.services.icd_kcb import IcdNotFoundError, IcdUpstreamError, lookup_code


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://example.com")
            raise httpx.HTTPStatusError("error", request=request, response=httpx.Response(
                self.status_code, request=request, content=json.dumps(self._payload).encode()))

    def json(self):
        return self._payload

    @property
    def text(self):
        return json.dumps(self._payload)


class FakeClient:
    payload = None
    status_code = 200

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        return FakeResponse(FakeClient.status_code, FakeClient.payload)


@pytest.fixture(autouse=True)
def clear_cache():
    icd_kcb._details.clear()
    icd_kcb._index = None
    yield
    icd_kcb._details.clear()
    icd_kcb._index = None


@pytest.fixture
def settings_with_key():
    get_settings.cache_clear()
    return get_settings()


def test_lookup_422_stale_input_maps_to_not_found(monkeypatch, settings_with_key):
    FakeClient.status_code = 422
    FakeClient.payload = {"error": {"status": "stale_input", "kind": "input_not_found",
                                    "message": "ICD-10 code 'M26' not found"}}
    monkeypatch.setattr(icd_kcb.httpx, "AsyncClient", FakeClient)
    with pytest.raises(IcdNotFoundError):
        import asyncio
        asyncio.run(lookup_code("M26"))


def test_lookup_real_http_error_raises_upstream(monkeypatch, settings_with_key):
    FakeClient.status_code = 429
    FakeClient.payload = {"error": {"status": "rate_limited"}}
    monkeypatch.setattr(icd_kcb.httpx, "AsyncClient", FakeClient)
    with pytest.raises(IcdUpstreamError):
        import asyncio
        asyncio.run(lookup_code("M26"))


class ScriptedClient:
    """Replays a scripted list of (status_code, payload) per request."""
    scripts: list = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        status, payload = ScriptedClient.scripts.pop(0)
        return FakeResponse(status, payload)


def test_lookup_transient_503_retries_then_succeeds(monkeypatch, settings_with_key):
    ScriptedClient.scripts = [
        (503, {"error": {"kind": "cp_transport", "message": "retry"}}),
        (200, {"status": "success", "data": {"icd10_code": "M17.9", "disease_name_vi": "x",
                                             "description_vi": "", "chapter": {},
                                             "section": {}, "parent_group": {}}}),
    ]
    monkeypatch.setattr(icd_kcb.httpx, "AsyncClient", ScriptedClient)

    async def fast_sleep(_seconds):
        return None

    monkeypatch.setattr(icd_kcb.asyncio, "sleep", fast_sleep)
    import asyncio
    detail = asyncio.run(lookup_code("M17.9"))
    assert detail["icd10_code"] == "M17.9"
    assert len(ScriptedClient.scripts) == 0  # both attempts consumed


def test_lookup_persistent_5xx_gives_friendly_message(monkeypatch, settings_with_key):
    ScriptedClient.scripts = [
        (503, {"error": {"kind": "cp_transport", "message": "Upstream temporarily unavailable, please retry"}}),
        (503, {"error": {"kind": "cp_transport", "message": "Upstream temporarily unavailable, please retry"}}),
    ]
    monkeypatch.setattr(icd_kcb.httpx, "AsyncClient", ScriptedClient)

    async def fast_sleep(_seconds):
        return None

    monkeypatch.setattr(icd_kcb.asyncio, "sleep", fast_sleep)
    import asyncio
    with pytest.raises(IcdUpstreamError) as info:
        asyncio.run(lookup_code("M17.9"))
    assert "Upstream" not in str(info.value)  # no raw upstream body echo

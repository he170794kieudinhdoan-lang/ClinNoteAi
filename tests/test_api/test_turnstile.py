from unittest.mock import AsyncMock, MagicMock, patch
import pytest


@pytest.mark.asyncio
async def test_turnstile_verify_success(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"success": True}
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_client_instance.__aexit__.return_value = None
    mock_client_instance.post.return_value = mock_resp

    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        res = await client.post("/api/v1/auth/verify-turnstile", json={"token": "test-token"})
        assert res.status_code == 200
        assert res.json() == {"success": True}


@pytest.mark.asyncio
async def test_turnstile_verify_failure(client):
    mock_resp = MagicMock()
    mock_resp.json.return_value = {"success": False, "error-codes": ["invalid-input-response"]}
    mock_client_instance = AsyncMock()
    mock_client_instance.__aenter__.return_value = mock_client_instance
    mock_client_instance.__aexit__.return_value = None
    mock_client_instance.post.return_value = mock_resp

    with patch("httpx.AsyncClient", return_value=mock_client_instance):
        res = await client.post("/api/v1/auth/verify-turnstile", json={"token": "bad-token"})
        assert res.status_code == 400
        assert "thất bại" in res.json()["detail"]

import os
from unittest.mock import AsyncMock

# Set isolated test configuration before importing the app or its database routes.
os.environ["APP_ENV"] = "test"
os.environ["SOAP_ENABLED"] = "true"
os.environ["DB_AUTO_CREATE_TABLES"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.config import get_settings

get_settings.cache_clear()
from src.main import app  # noqa: E402


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock

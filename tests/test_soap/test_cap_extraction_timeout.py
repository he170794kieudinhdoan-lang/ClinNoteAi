"""Unit test to verify CAP extraction uses dedicated cap_extraction_timeout = 60.0."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from src.config import get_settings
from src.schemas.soap import Transcript, TranscriptTurn
from src.services.llm import get_cap_llm, get_soap_llm
from src.services.model_runtime import create_model
from src.services.soap.extractor import extract_once


def make_transcript() -> Transcript:
    return Transcript(turns=[
        TranscriptTurn(turn_id="t1", speaker="patient", text="Tôi bị đau đầu từ sáng.", start_ms=0, end_ms=1000)
    ])


def test_cap_extraction_timeout_settings_default():
    settings = get_settings()
    assert settings.cap_extraction_timeout == 60.0
    assert settings.soap_llm_timeout == 45.0
    assert settings.cap_extraction_timeout != settings.soap_llm_timeout


def test_create_model_cap_extraction_timeout():
    caps_model = create_model("caps")
    assert getattr(caps_model, "request_timeout", None) == 60.0 or getattr(caps_model, "timeout", None) == 60.0

    soap_model = create_model("soap")
    assert getattr(soap_model, "request_timeout", None) == 45.0 or getattr(soap_model, "timeout", None) == 45.0


def test_get_cap_llm_timeout():
    caps_llm = get_cap_llm()
    assert getattr(caps_llm, "request_timeout", None) == 60.0 or getattr(caps_llm, "timeout", None) == 60.0

    soap_llm = get_soap_llm()
    assert getattr(soap_llm, "request_timeout", None) == 45.0 or getattr(soap_llm, "timeout", None) == 45.0


@pytest.mark.asyncio
async def test_extract_once_passes_explicit_timeout():
    mock_llm = AsyncMock()
    mock_llm.ainvoke.return_value = AsyncMock(content='{"caps": [], "warnings": []}', usage_metadata=None, response_metadata={})

    transcript = make_transcript()
    timeout_val = 60.0

    raw, meta = await extract_once(mock_llm, transcript, timeout=timeout_val)
    assert raw is not None
    assert mock_llm.ainvoke.called

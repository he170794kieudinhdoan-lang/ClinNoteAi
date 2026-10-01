from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from src.schemas.model_settings import ModelPreference
from src.services.model_runtime import resolve_connection


class BlazeSTTError(Exception):
    """Exception raised when Blaze STT fails."""


class BlazeSTTAsync:
    def __init__(self, preference: ModelPreference | None = None) -> None:
        connection = resolve_connection("stt", preference)
        self.api_key = connection.api_key
        self.api_url = connection.base_url
        self.model = connection.model

    async def transcribe(self, audio_path: str | Path) -> dict[str, Any]:
        audio_path = Path(audio_path)
        if not audio_path.exists():
            raise BlazeSTTError("Audio file not found")
        with audio_path.open("rb") as audio_file:
            return await self._send((audio_path.name, audio_file, self._get_content_type(audio_path)))

    async def transcribe_bytes(self, audio: bytes, *, allow_empty: bool = False) -> dict[str, Any]:
        return await self._send(("connection-check.wav", audio, "audio/wav"), allow_empty=allow_empty)

    async def _send(self, audio_file: tuple, *, allow_empty: bool = False) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        params = {"model": self.model, "language": "vi", "enable_segments": "true",
                  "enable_refinement": "true", "num_speakers": 2}
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(self.api_url, headers=headers, params=params,
                                             files={"audio_file": audio_file})
            response.raise_for_status()
            transcription_data = response.json()["result"]["data"]
            if not isinstance(transcription_data, dict) or not transcription_data.get("is_successful"):
                raise BlazeSTTError("STT provider reported unsuccessful transcription")
            if not allow_empty and not transcription_data.get("segments"):
                raise BlazeSTTError("STT returned no segments")
            return transcription_data
        except httpx.TimeoutException as exc:
            raise BlazeSTTError("STT request timed out") from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise BlazeSTTError("STT request failed or returned an invalid response") from exc

    @staticmethod
    def _get_content_type(audio_path: Path) -> str:
        suffix = audio_path.suffix.lower()

        content_types = {
            ".wav": "audio/wav",
            ".mp3": "audio/mpeg",
            ".m4a": "audio/mp4",
            ".aac": "audio/aac",
            ".ogg": "audio/ogg",
            ".webm": "audio/webm",
            ".flac": "audio/flac",
        }

        return content_types.get(
            suffix,
            "application/octet-stream",
        )


blaze_stt = BlazeSTTAsync()

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from src.config import get_settings


class BlazeSTTError(Exception):
    """Exception raised when Blaze STT fails."""


class BlazeSTTAsync:
    def __init__(self) -> None:
        settings = get_settings()

        self.api_key = settings.blaze_api_key
        self.api_url = settings.blaze_api_url

    async def transcribe(
        self,
        audio_path: str | Path,
    ) -> dict[str, Any]:
        """
        Send an audio file to Blaze STT Async API.

        Returns:
            Blaze transcription_data containing:
            - transcription
            - raw_text
            - segments
        """

        if not self.api_key:
            raise BlazeSTTError(
                "BLAZE_API_KEY is not configured"
            )

        audio_path = Path(audio_path)

        if not audio_path.exists():
            raise BlazeSTTError(
                f"Audio file not found: {audio_path}"
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }

        params = {
            "model": "stt-async-1.5",
            "language": "vi",
            "enable_segments": "true",
            "enable_refinement": "true",
            "num_speakers": 2,
        }

        try:
            async with httpx.AsyncClient(
                timeout=300.0
            ) as client:

                with audio_path.open("rb") as audio_file:
                    files = {
                        "audio_file": (
                            audio_path.name,
                            audio_file,
                            self._get_content_type(audio_path),
                        )
                    }

                    response = await client.post(
                        self.api_url,
                        headers=headers,
                        params=params,
                        files=files,
                    )

            response.raise_for_status()

        except httpx.TimeoutException as exc:
            raise BlazeSTTError(
                "Blaze STT request timed out"
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise BlazeSTTError(
                f"Blaze STT API returned "
                f"HTTP {exc.response.status_code}: "
                f"{exc.response.text}"
            ) from exc

        except httpx.HTTPError as exc:
            raise BlazeSTTError(
                f"Blaze STT request failed: {exc}"
            ) from exc

        try:
            data = response.json()
        except ValueError as exc:
            raise BlazeSTTError(
                "Blaze STT returned invalid JSON"
            ) from exc

        try:
            transcription_data = data["result"]["data"]
        except (KeyError, TypeError) as exc:
            raise BlazeSTTError(
                "Blaze STT response does not contain "
                "result.data"
            ) from exc

        if not transcription_data.get("is_successful"):
            raise BlazeSTTError(
                f"Blaze STT failed: {transcription_data}"
            )

        segments = transcription_data.get("segments", [])

        if not segments:
            raise BlazeSTTError(
                "Blaze STT returned no segments"
            )

        return transcription_data

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
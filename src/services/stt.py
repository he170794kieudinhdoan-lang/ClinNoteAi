"""STT adapters share timed text; Whisper never invents acoustic speaker labels."""
import math
from pathlib import Path

import httpx

from src.schemas.model_settings import ModelPreference
from src.services.blaze.stt_async import BlazeSTTAsync, BlazeSTTError
from src.services.model_runtime import resolve_connection


class WhisperSTT:
    def __init__(self, preference: ModelPreference):
        self.connection = resolve_connection("stt", preference)

    async def transcribe(self, audio_path: str | Path) -> dict:
        path = Path(audio_path)
        with path.open("rb") as audio:
            return await self._send((path.name, audio, BlazeSTTAsync._get_content_type(path)))

    async def transcribe_bytes(self, audio: bytes, *, allow_empty: bool = False) -> dict:
        return await self._send(("connection-check.wav", audio, "audio/wav"), allow_empty=allow_empty)

    async def _send(self, audio: tuple, *, allow_empty: bool = False) -> dict:
        connection = self.connection
        headers = {"Authorization": f"Bearer {connection.api_key}"} if connection.api_key else {}
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                response = await client.post(connection.base_url.rstrip("/") + "/audio/transcriptions",
                                             headers=headers, files={"file": audio},
                                             data={"model": connection.model, "language": "vi",
                                                   "response_format": "verbose_json"})
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get("text"), str):
                raise ValueError("invalid text")
            segments = []
            for segment in data.get("segments", []):
                text = segment["text"].strip()
                start, end = float(segment["start"]), float(segment["end"])
                if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
                    raise ValueError("invalid timestamp")
                if text:
                    segments.append({"text": text, "startTime": start, "endTime": end})
            if not allow_empty and not segments:
                raise BlazeSTTError("Whisper không trả đoạn có thời gian; cần verbose_json để xử lý hội thoại.")
            return {"is_successful": True, "segments": segments, "speaker_source": "text_inference"}
        except httpx.TimeoutException as exc:
            raise BlazeSTTError("STT request timed out") from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
            raise BlazeSTTError("STT request failed or returned an invalid response") from exc


def create_stt(preference: ModelPreference | None = None):
    connection = resolve_connection("stt", preference)
    if connection.provider in {"9router", "groq"}:
        return WhisperSTT(preference or ModelPreference())
    return BlazeSTTAsync(preference)

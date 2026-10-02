from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import UploadFile

TEMP_AUDIO_DIR = Path("audio/temp")

ALLOWED_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".webm",
    ".flac",
}

ALLOWED_CONTENT_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
}


async def save_temp_audio(upload_file: UploadFile) -> Path:
    filename = upload_file.filename or ""

    suffix = Path(filename).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported audio format: {suffix or 'unknown'}"
        )

    if (
        upload_file.content_type
        and upload_file.content_type not in ALLOWED_CONTENT_TYPES
    ):
        raise ValueError(
            f"Unsupported audio content type: "
            f"{upload_file.content_type}"
        )

    TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    temp_filename = f"{uuid.uuid4()}{suffix}"
    temp_path = TEMP_AUDIO_DIR / temp_filename

    try:
        with temp_path.open("wb") as output_file:
            while chunk := await upload_file.read(1024 * 1024):
                output_file.write(chunk)

    finally:
        await upload_file.close()

    return temp_path

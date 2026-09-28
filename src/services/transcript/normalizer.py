from __future__ import annotations

import json
import math
import re
from typing import Any

from src.schemas.soap import Transcript, TranscriptTurn


class TranscriptNormalizationError(Exception):
    """Exception raised when transcript normalization fails."""


def normalize_transcript(
    segments: list[dict[str, Any]],
    speaker_roles: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Combine Blaze STT segments with Qwen speaker-role mapping.

    Blaze:
        speaker -> "1" / "2"
        text
        startTime -> seconds
        endTime -> seconds

    Qwen:
        speaker_roles["1"]["role"] -> doctor/patient
        speaker_roles["1"]["confidence"] -> role confidence

    Output:
        Format compatible with TranscriptSegment model.
    """

    if not segments:
        raise TranscriptNormalizationError(
            "No transcript segments provided"
        )

    if not speaker_roles:
        raise TranscriptNormalizationError(
            "No speaker role mapping provided"
        )

    normalized: list[dict[str, Any]] = []

    for segment in segments:
        speaker = segment.get("speaker")
        text = str(segment.get("text", "")).strip()

        if speaker is None:
            raise TranscriptNormalizationError(
                "Transcript segment is missing speaker"
            )

        if not text:
            continue

        speaker_id = str(speaker)

        role_info = speaker_roles.get(speaker_id)

        if not role_info:
            raise TranscriptNormalizationError(
                f"No role mapping found for Speaker {speaker_id}"
            )

        role = role_info.get("role")

        if role not in {"doctor", "patient"}:
            raise TranscriptNormalizationError(
                f"Invalid role for Speaker {speaker_id}: {role}"
            )

        start_time = segment.get("startTime")
        end_time = segment.get("endTime")

        normalized_segment = {
            "speaker_label": speaker_id,
            "resolved_role": role,
            "content": text,
            "start_ms": _seconds_to_ms(start_time),
            "end_ms": _seconds_to_ms(end_time),
            "asr_confidence": _get_asr_confidence(segment),
            "role_confidence": _get_role_confidence(role_info),
        }

        normalized.append(normalized_segment)

    if not normalized:
        raise TranscriptNormalizationError(
            "No usable transcript segments after normalization"
        )

    return normalized


def _seconds_to_ms(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return round(float(value) * 1000)
    except (TypeError, ValueError) as exc:
        raise TranscriptNormalizationError(
            f"Invalid timestamp value: {value}"
        ) from exc


def _get_asr_confidence(
    segment: dict[str, Any],
) -> float | None:
    """
    Blaze response may not provide a segment confidence.

    Keep it nullable instead of inventing a value.
    """

    confidence = segment.get("confidence")

    if confidence is None:
        return None

    try:
        return float(confidence)
    except (TypeError, ValueError) as exc:
        raise TranscriptNormalizationError(
            f"Invalid ASR confidence: {confidence}"
        ) from exc


def _get_role_confidence(
    role_info: dict[str, Any],
) -> float | None:
    """
    Qwen confidence is self-reported metadata, not a calibrated probability.
    """

    confidence = role_info.get("confidence")

    if confidence is None:
        return None

    try:
        value = float(confidence)
    except (TypeError, ValueError) as exc:
        raise TranscriptNormalizationError(
            f"Invalid role confidence: {confidence}"
        ) from exc

    if not 0.0 <= value <= 1.0:
        raise TranscriptNormalizationError(
            f"Role confidence out of range: {value}"
        )

    return value


def parse_soap_transcript(
    raw: str | dict[str, Any],
    input_format: str = "qwen_role_result",
    *,
    max_turns: int = 200,
    max_chars: int = 30_000,
    max_input_bytes: int = 1_000_000,
) -> Transcript:
    """Adapt an already transcribed conversation without changing Blaze callers."""
    try:
        size = len(raw.encode("utf-8")) if isinstance(raw, str) else len(json.dumps(raw, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise TranscriptNormalizationError("input is not JSON serializable") from exc
    if size > max_input_bytes:
        raise TranscriptNormalizationError("input exceeds byte limit")

    if input_format == "text":
        if not isinstance(raw, str):
            raise TranscriptNormalizationError("text content must be a string")
        pattern = re.compile(r"^(Doctor|Patient|Bác sĩ|Bệnh nhân)\s*:\s*(.+)$", re.I)
        turns = []
        for line in raw.splitlines():
            if not line.strip():
                continue
            match = pattern.fullmatch(line.strip())
            if match is None:
                raise TranscriptNormalizationError("each text line needs a speaker label")
            speaker = "clinician" if match.group(1).lower() in {"doctor", "bác sĩ"} else "patient"
            turns.append(TranscriptTurn(turn_id=f"T{len(turns) + 1}", speaker=speaker, text=match.group(2)))
        transcript = Transcript(turns=turns)
    elif input_format == "canonical":
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError as exc:
                raise TranscriptNormalizationError("canonical content is not valid JSON") from exc
        if not isinstance(raw, dict):
            raise TranscriptNormalizationError("canonical content must be an object")
        try:
            transcript = Transcript.model_validate(raw)
        except ValueError as exc:
            raise TranscriptNormalizationError(str(exc)) from exc
    elif input_format == "qwen_role_result":
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except ValueError as exc:
                raise TranscriptNormalizationError("Qwen content is not valid JSON") from exc
        if not isinstance(raw, dict) or not isinstance(raw.get("segments"), list):
            raise TranscriptNormalizationError("Qwen profile requires segments")
        role_map = raw.get("speaker_roles")
        if not isinstance(role_map, dict):
            raise TranscriptNormalizationError("Qwen profile requires speaker_roles")
        turns = []
        for segment in raw["segments"]:
            if not isinstance(segment, dict):
                raise TranscriptNormalizationError("segment must be an object")
            source_id = segment.get("id")
            speaker_id = segment.get("speaker")
            if isinstance(source_id, bool) or not isinstance(source_id, (str, int)) or not str(source_id).strip():
                raise TranscriptNormalizationError("invalid segment id")
            if speaker_id is None:
                raise TranscriptNormalizationError("segment speaker missing")
            speaker_id = str(speaker_id)
            info = role_map.get(speaker_id)
            if not isinstance(info, dict) or info.get("role") not in {"doctor", "patient"}:
                raise TranscriptNormalizationError(f"invalid role map for speaker {speaker_id}")
            mapped = info["role"]
            role = segment.get("role")
            if role is not None and role != mapped:
                raise TranscriptNormalizationError(f"role conflict for speaker {speaker_id}")
            if role is None:
                role = mapped
            text = segment.get("text")
            if not isinstance(text, str) or not text.strip():
                raise TranscriptNormalizationError("segment text missing")
            start, end = segment.get("start_time"), segment.get("end_time")
            if (start is None) != (end is None):
                raise TranscriptNormalizationError("partial segment time")
            if start is not None:
                if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in (start, end)):
                    raise TranscriptNormalizationError("invalid segment time")
                start_ms, end_ms = round(start * 1000), round(end * 1000)
            else:
                start_ms = end_ms = None
            try:
                turns.append(TranscriptTurn(
                    turn_id=f"T{source_id}", source_segment_id=source_id,
                    source_speaker_id=speaker_id,
                    speaker="clinician" if role == "doctor" else "patient", text=text,
                    start_ms=start_ms, end_ms=end_ms,
                    role_confidence=info.get("confidence"),
                ))
            except ValueError as exc:
                raise TranscriptNormalizationError(str(exc)) from exc
        try:
            transcript = Transcript(
                turns=turns,
                source_metadata={"source": raw.get("source"), "model": raw.get("model")},
            )
        except ValueError as exc:
            raise TranscriptNormalizationError(str(exc)) from exc
    else:
        raise TranscriptNormalizationError("unsupported input_format")
    if len(transcript.turns) > max_turns:
        raise TranscriptNormalizationError("too many turns")
    if sum(len(turn.text) for turn in transcript.turns) > max_chars:
        raise TranscriptNormalizationError("transcript exceeds character limit")
    return transcript

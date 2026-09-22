from __future__ import annotations

from typing import Any


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
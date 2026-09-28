"""Append-only JSON store. One process owns revision locks in the MVP."""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from threading import Lock, RLock
from typing import Any
from uuid import UUID, uuid4

from src.schemas.soap import SoapRevision, Transcript
from src.services.soap.errors import SoapFailure


def _bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")


def _write_new(path: Path, value: Any) -> None:
    data = _bytes(value)
    with path.open("xb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


class SoapStore:
    def __init__(self, root: str | Path):
        self.root = Path(root)
        self._locks: dict[str, RLock] = {}
        self._map_lock = Lock()

    def _lock(self, run_id: str) -> RLock:
        with self._map_lock:
            return self._locks.setdefault(run_id, RLock())

    def _path(self, run_id: str) -> Path:
        try:
            value = UUID(run_id)
            if str(value) != run_id:
                raise ValueError("noncanonical UUID")
        except (ValueError, TypeError, AttributeError) as exc:
            raise SoapFailure("store", "invalid_run_id", "run_id must be a UUID", 422) from exc
        return self.root / run_id

    def create_run(self, raw: Any, transcript: Transcript, input_format: str) -> str:
        run_id = str(uuid4())
        path = self._path(run_id)
        path.mkdir(parents=True, exist_ok=False)
        raw_value = {"input_format": input_format, "content": raw}
        transcript_value = transcript.model_dump(mode="json")
        raw_hash_bytes = raw.encode("utf-8") if isinstance(raw, str) else _bytes(raw_value)
        metadata = {
            "run_id": run_id,
            "created_at": datetime.now(UTC).isoformat(),
            "input_format": input_format,
            "raw_sha256": sha256(raw_hash_bytes).hexdigest(),
            "raw_hash_mode": "text_bytes" if isinstance(raw, str) else "canonical_json",
            "transcript_sha256": sha256(_bytes(transcript_value)).hexdigest(),
        }
        try:
            _write_new(path / "input_raw.json", raw_value)
            _write_new(path / "transcript.json", transcript_value)
            _write_new(path / "metadata.json", metadata)
            _write_new(path / "input.complete", {"sha256": metadata["transcript_sha256"]})
        except OSError as exc:
            raise SoapFailure("save_input", "storage_error", "Could not save input", 500, run_id) from exc
        return run_id

    def _read(self, path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise SoapFailure("store", "storage_error", "Could not read artifact", 500) from exc

    def load(self, run_id: str) -> dict[str, Any]:
        path = self._path(run_id)
        if not (path / "input.complete").is_file():
            raise SoapFailure("store", "run_not_found", "Run not found", 404, run_id)
        transcript = self._read(path / "transcript.json")
        metadata = self._read(path / "metadata.json")
        if sha256(_bytes(transcript)).hexdigest() != metadata["transcript_sha256"]:
            raise SoapFailure("store", "hash_mismatch", "Transcript snapshot changed", 500, run_id)
        raw = self._read(path / "input_raw.json")
        stored_raw_bytes = raw["content"].encode("utf-8") if metadata.get("raw_hash_mode") == "text_bytes" else _bytes(raw)
        if sha256(stored_raw_bytes).hexdigest() != metadata["raw_sha256"]:
            raise SoapFailure("store", "hash_mismatch", "Raw snapshot changed", 500, run_id)
        caps = self._read(path / "caps.json") if (path / "caps.complete").is_file() else None
        if caps is not None and self._read(path / "caps.complete").get("sha256") != sha256(_bytes(caps)).hexdigest():
            raise SoapFailure("store", "hash_mismatch", "CAP artifact changed", 500, run_id)
        revisions = self.revisions(run_id)
        attempt_summary = []
        for artifact in sorted((path / "attempts").glob("*.json")) if (path / "attempts").exists() else []:
            attempt = self._read(artifact)
            attempt_summary.append({"stage": artifact.name.split("_", 1)[1].rsplit("_", 1)[0],
                                    "prompt_version": attempt.get("prompt_version"),
                                    "metadata": attempt.get("metadata")})
        return {"run_id": run_id, "metadata": metadata, "transcript": transcript,
                "caps": caps["caps"] if caps else None,
                "cap_warnings": caps["warnings"] if caps else [],
                "revisions": revisions, "latest_revision": revisions[-1] if revisions else None,
                "attempt_summary": attempt_summary}

    def save_caps(self, run_id: str, caps: list[dict], warnings: list[str]) -> None:
        path = self._path(run_id)
        with self._lock(run_id):
            if (path / "caps.complete").exists():
                raise SoapFailure("save_caps", "already_extracted", "CAPs already saved", 409, run_id)
            try:
                value = {"caps": caps, "warnings": warnings}
                _write_new(path / "caps.json", value)
                _write_new(path / "caps.complete", {"saved_at": datetime.now(UTC).isoformat(),
                                                    "sha256": sha256(_bytes(value)).hexdigest()})
            except OSError as exc:
                raise SoapFailure("save_caps", "storage_error", "Could not save CAPs", 500, run_id) from exc

    def save_attempt(self, run_id: str, stage: str, payload: dict) -> None:
        path = self._path(run_id)
        safe_stage = "".join(c for c in stage if c.isalnum() or c in "_-")[:40]
        try:
            attempts = path / "attempts"
            attempts.mkdir(exist_ok=True)
            _write_new(attempts / f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%f')}_{safe_stage}_{uuid4()}.json", payload)
        except OSError as exc:
            raise SoapFailure(stage, "storage_error", "Could not save attempt", 500, run_id) from exc

    def revisions(self, run_id: str) -> list[dict]:
        directory = self._path(run_id) / "revisions"
        if not directory.exists():
            return []
        result = []
        for marker in directory.glob("*.complete"):
            artifact = marker.with_suffix(".json")
            if artifact.is_file():
                value = self._read(artifact)
                if self._read(marker).get("sha256") != sha256(_bytes(value)).hexdigest():
                    raise SoapFailure("store", "hash_mismatch", "Revision artifact changed", 500, run_id)
                result.append(value)
        return sorted(result, key=lambda item: item["revision"])

    def latest_number(self, run_id: str) -> int:
        revisions = self.revisions(run_id)
        return revisions[-1]["revision"] if revisions else 0

    def assert_revision(self, run_id: str, expected: int) -> None:
        with self._lock(run_id):
            self.load(run_id)
            if self.latest_number(run_id) != expected:
                raise SoapFailure("revision", "revision_conflict", "Revision changed; reload run", 409, run_id)

    def append_revision(self, run_id: str, revision: SoapRevision, expected: int) -> dict:
        path = self._path(run_id) / "revisions"
        with self._lock(run_id):
            self.assert_revision(run_id, expected)
            if revision.revision != expected + 1 or revision.parent_revision != (expected or None):
                raise SoapFailure("revision", "invalid_revision", "Invalid revision sequence", 500, run_id)
            path.mkdir(exist_ok=True)
            stem = f"{revision.revision:06d}_{uuid4()}"
            value = revision.model_dump(mode="json")
            try:
                _write_new(path / f"{stem}.json", value)
                _write_new(path / f"{stem}.complete", {"sha256": sha256(_bytes(value)).hexdigest()})
            except OSError as exc:
                raise SoapFailure("revision", "storage_error", "Could not save revision", 500, run_id) from exc
            return value

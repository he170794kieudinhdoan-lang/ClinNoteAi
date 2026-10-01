"""Node implementations are built with explicit store and model dependencies."""

from datetime import UTC, datetime

from src.config import get_settings
from src.schemas.soap import Cap, SoapRevision, Transcript
from src.services.soap import extractor, renderer
from src.services.soap.errors import SoapFailure
from src.services.soap.validation import filter_usable_caps, validate_caps, validate_soap
from src.services.transcript.normalizer import TranscriptNormalizationError, parse_soap_transcript


def make_nodes(store, llm):
    def failure(exc, stage: str, run_id: str | None = None) -> dict:
        if isinstance(exc, SoapFailure):
            return {**exc.as_dict(), "status": exc.status, "run_id": exc.run_id or run_id}
        return {"stage": stage, "code": "internal_error", "message": f"{type(exc).__name__}: {exc}",
                "status": 500, "run_id": run_id}

    async def normalize(state):
        try:
            settings = get_settings()
            transcript = parse_soap_transcript(
                state["content"], state["input_format"], max_turns=settings.soap_max_turns,
                max_chars=settings.soap_max_chars, max_input_bytes=settings.soap_max_input_bytes,
            )
            return {"transcript": transcript.model_dump(mode="json")}
        except (TranscriptNormalizationError, ValueError) as exc:
            return {"error": {"stage": "normalize_transcript", "code": "invalid_input", "message": str(exc),
                              "status": 422, "run_id": None}}

    async def save_input(state):
        try:
            run_id = store.create_run(state["content"], Transcript.model_validate(state["transcript"]), state["input_format"])
            return {"run_id": run_id}
        except Exception as exc:
            return {"error": failure(exc, "save_input")}

    async def extract_caps(state):
        try:
            raw, meta = await extractor.extract_once(llm, Transcript.model_validate(state["transcript"]),
                                                     get_settings().soap_llm_timeout)
            store.save_attempt(state["run_id"], "extract_caps", {"output": raw, "metadata": meta,
                                                                "prompt_version": extractor.PROMPT_VERSION})
            try:
                payload = extractor.parse_caps(raw)
                return {"caps": [cap.model_dump(mode="json") for cap in payload.caps],
                        "cap_warnings": payload.warnings, "raw_model_output": raw, "model_metadata": meta}
            except SoapFailure as exc:
                return {"raw_model_output": raw, "error": {**failure(exc, "parse_caps", state["run_id"]), "status": exc.status}}
        except Exception as exc:
            return {"error": failure(exc, "extract_caps", state["run_id"])}

    async def repair_caps(state):
        try:
            raw, meta = await extractor.extract_once(llm, Transcript.model_validate(state["transcript"]),
                                                     get_settings().soap_llm_timeout, state.get("raw_model_output"))
            store.save_attempt(state["run_id"], "repair_cap_json", {"output": raw, "metadata": meta,
                                                                    "prompt_version": extractor.PROMPT_VERSION})
            payload = extractor.parse_caps(raw)
            return {"caps": [cap.model_dump(mode="json") for cap in payload.caps],
                    "cap_warnings": payload.warnings, "raw_model_output": raw,
                    "model_metadata": meta, "cap_repair_count": 1, "error": None}
        except Exception as exc:
            return {"cap_repair_count": 1, "error": failure(exc, "repair_cap_json", state["run_id"])}

    async def check_caps(state):
        try:
            caps, warnings = validate_caps(
                [Cap.model_validate(cap) for cap in state["caps"]], Transcript.model_validate(state["transcript"]))
            return {"caps": [cap.model_dump(mode="json") for cap in caps],
                    "cap_warnings": list(dict.fromkeys(state.get("cap_warnings", []) + warnings))}
        except Exception as exc:
            return {"error": failure(exc, "validate_caps", state["run_id"])}

    async def save_caps(state):
        try:
            store.save_caps(state["run_id"], state["caps"], state.get("cap_warnings", []))
            return {}
        except Exception as exc:
            return {"error": failure(exc, "save_caps", state["run_id"])}

    async def load_snapshot(state):
        try:
            store.assert_revision(state["run_id"], state["expected_revision"])
            run = store.load(state["run_id"])
            if run["caps"] is None:
                raise SoapFailure("load_snapshot", "caps_missing", "CAP extraction is incomplete", 409, state["run_id"])
            return {"transcript": run["transcript"], "caps": run["caps"], "cap_warnings": run["cap_warnings"]}
        except Exception as exc:
            return {"error": failure(exc, "load_snapshot", state.get("run_id"))}

    async def render_soap(state):
        try:
            usable_caps = filter_usable_caps([Cap.model_validate(cap) for cap in state["caps"]])
            raw, meta = await renderer.render_once(
                llm, Transcript.model_validate(state["transcript"]),
                usable_caps, state.get("cap_warnings", []),
                get_settings().soap_llm_timeout)
            store.save_attempt(state["run_id"], "render_soap", {"output": raw, "metadata": meta,
                                                                 "prompt_version": renderer.PROMPT_VERSION})
            try:
                soap = renderer.parse_soap(raw)
                return {"soap_draft": soap.model_dump(mode="json"), "raw_model_output": raw,
                        "model_metadata": meta}
            except SoapFailure as exc:
                return {"raw_model_output": raw, "error": {**failure(exc, "parse_soap", state["run_id"]), "status": exc.status}}
        except Exception as exc:
            return {"error": failure(exc, "render_soap", state["run_id"])}

    async def repair_soap(state):
        try:
            usable_caps = filter_usable_caps([Cap.model_validate(cap) for cap in state["caps"]])
            raw, meta = await renderer.render_once(
                llm, Transcript.model_validate(state["transcript"]),
                usable_caps, state.get("cap_warnings", []),
                get_settings().soap_llm_timeout, state.get("raw_model_output"))
            store.save_attempt(state["run_id"], "repair_soap_json", {"output": raw, "metadata": meta,
                                                                     "prompt_version": renderer.PROMPT_VERSION})
            soap = renderer.parse_soap(raw)
            return {"soap_draft": soap.model_dump(mode="json"), "raw_model_output": raw,
                    "model_metadata": meta, "soap_repair_count": state.get("soap_repair_count", 0) + 1, "error": None}
        except Exception as exc:
            return {"soap_repair_count": state.get("soap_repair_count", 0) + 1, "error": failure(exc, "repair_soap_json", state["run_id"])}

    async def check_soap(state):
        try:
            soap = validate_soap(renderer.SoapDocument.model_validate(state["soap_draft"]),
                                 [Cap.model_validate(cap) for cap in state["caps"]], generated=True)
            return {"soap_draft": soap.model_dump(mode="json"), "error": None}
        except Exception as exc:
            return {"error": failure(exc, "validate_soap", state["run_id"])}

    async def save_draft(state):
        try:
            expected = state["expected_revision"]
            revision = SoapRevision(
                revision=expected + 1, parent_revision=expected or None, status="draft",
                soap=state["soap_draft"], created_at=datetime.now(UTC),
                model=state.get("model_metadata", {}).get("model"), prompt_version=renderer.PROMPT_VERSION,
            )
            value = store.append_revision(state["run_id"], revision, expected)
            return {"revision": value}
        except Exception as exc:
            return {"error": failure(exc, "save_draft", state["run_id"])}

    async def record_error(state):
        error = state.get("error")
        if error and state.get("run_id"):
            try:
                store.save_attempt(state["run_id"], "error", {"error": error})
            except SoapFailure:
                pass
        return {}

    return locals()

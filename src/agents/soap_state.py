"""Per-invocation LangGraph state for SOAP."""

from typing import Any, Literal, TypedDict


class SoapPipelineState(TypedDict, total=False):
    operation: Literal["extract", "render"]
    input_format: str
    content: Any
    run_id: str
    expected_revision: int
    transcript: Any
    caps: Any
    cap_warnings: list[str]
    soap_draft: Any
    revision: Any
    raw_model_output: str
    model_metadata: dict
    cap_repair_count: int
    soap_repair_count: int
    error: dict

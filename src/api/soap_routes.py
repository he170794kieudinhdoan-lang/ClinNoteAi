"""SOAP routes on the existing FastAPI app."""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException

from src.agents.soap_graph import create_soap_pipeline
from src.config import get_settings
from src.schemas.soap import ApproveRequest, ExtractRequest, GenerateRequest, RevisionRequest
from src.services.llm import get_soap_llm
from src.services.soap.errors import SoapFailure
from src.services.soap.review import approve, export_revision, read_run, revise
from src.services.soap.store import SoapStore

soap_router = APIRouter()


@lru_cache
def _get_store() -> SoapStore:
    return SoapStore(get_settings().soap_data_dir)


async def get_soap_store() -> SoapStore:
    return _get_store()


def _raise(error: dict):
    raise HTTPException(status_code=error.get("status", 502), detail={
        "stage": error.get("stage"), "code": error.get("code"),
        "message": error.get("message"), "run_id": error.get("run_id"),
    })


def _raise_failure(exc: SoapFailure):
    _raise({**exc.as_dict(), "status": exc.status})


@soap_router.post("/extract-caps")
async def extract_caps(request: ExtractRequest, store: SoapStore = Depends(get_soap_store)):
    graph = create_soap_pipeline(store, get_soap_llm())
    result = await graph.ainvoke({"operation": "extract", "input_format": request.input_format,
                                  "content": request.content, "cap_repair_count": 0})
    if result.get("error"):
        _raise(result["error"])
    return {"run_id": result["run_id"], "transcript": result["transcript"],
            "caps": result["caps"], "cap_warnings": result.get("cap_warnings", []),
            "cap_repair_count": result.get("cap_repair_count", 0),
            "model_metadata": result.get("model_metadata")}


@soap_router.post("/runs/{run_id}/generate")
async def generate(run_id: str, request: GenerateRequest, store: SoapStore = Depends(get_soap_store)):
    graph = create_soap_pipeline(store, get_soap_llm())
    result = await graph.ainvoke({"operation": "render", "run_id": run_id,
                                  "expected_revision": request.expected_revision, "soap_repair_count": 0})
    if result.get("error"):
        _raise(result["error"])
    return {"run_id": run_id, "revision": result["revision"],
            "soap_repair_count": result.get("soap_repair_count", 0),
            "model_metadata": result.get("model_metadata")}


@soap_router.get("/runs/{run_id}")
async def get_run(run_id: str, store: SoapStore = Depends(get_soap_store)):
    try:
        return read_run(store, run_id)
    except SoapFailure as exc:
        _raise_failure(exc)


@soap_router.post("/runs/{run_id}/revisions")
async def create_revision(run_id: str, request: RevisionRequest, store: SoapStore = Depends(get_soap_store)):
    try:
        return {"run_id": run_id, "revision": revise(store, run_id, request)}
    except SoapFailure as exc:
        _raise_failure(exc)


@soap_router.post("/runs/{run_id}/approve")
async def approve_revision(run_id: str, request: ApproveRequest, store: SoapStore = Depends(get_soap_store)):
    try:
        return {"run_id": run_id, "revision": approve(store, run_id, request.expected_revision,
                                                         request.reviewer_name, request.warning_decisions)}
    except SoapFailure as exc:
        _raise_failure(exc)


@soap_router.get("/runs/{run_id}/export")
async def export(run_id: str, revision: int, store: SoapStore = Depends(get_soap_store)):
    try:
        return export_revision(store, run_id, revision)
    except SoapFailure as exc:
        _raise_failure(exc)

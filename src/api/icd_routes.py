"""Consultation-scoped ICD suggestions and LLM-grounded ICD code suggestion."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_db
from src.models.consultation import Consultation
from src.models.icd_suggestion import IcdSuggestion
from src.schemas.icd import IcdSaveRequest, IcdStatusRequest, IcdSuggestRequest
from src.services.icd_suggest import suggest_codes
from src.services.model_runtime import ModelConfigurationError
from src.services.soap.errors import SoapFailure
from src.services.soap.store import SoapStore

icd_router = APIRouter()


def _soap_store() -> SoapStore:
    from src.api.soap_routes import _get_store
    return _get_store()


def _suggestion_out(item: IcdSuggestion) -> dict:
    return {"id": str(item.id), "consultation_id": str(item.consultation_id),
            "icd_code": item.icd_code, "description": item.description,
            "confidence": item.confidence, "status": item.status}


def _require_consultation(db: Session, consultation_id: UUID) -> Consultation:
    consultation = db.get(Consultation, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy lượt khám.")
    return consultation


async def _suggest(request: IcdSuggestRequest, store: SoapStore) -> dict:
    llm = None
    if request.model_config_override is not None:
        from src.services.llm import get_soap_llm
        try:
            llm = get_soap_llm(request.model_config_override)
        except ModelConfigurationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return await suggest_codes(store=store, run_id=request.run_id,
                                   assessment_text=request.assessment_text, llm=llm)
    except ModelConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except SoapFailure as exc:
        raise HTTPException(status_code=exc.status, detail={**exc.as_dict(),
                                                            "status": exc.status}) from exc


@icd_router.post("/icd/suggest")
async def icd_suggest(request: IcdSuggestRequest, store: SoapStore = Depends(_soap_store)):
    """LLM proposes ICD-10 codes grounded in the run CAPs; verified against icd.kcb.vn."""
    return await _suggest(request, store)


@icd_router.post("/consultations/{consultation_id}/icd-suggestions")
async def save_icd_suggestions(consultation_id: UUID, request: IcdSaveRequest,
                               db: Session = Depends(get_db)):
    """Upsert suggestions for a consultation; dedupes by (consultation_id, icd_code)."""
    _require_consultation(db, consultation_id)
    existing = {code for code in db.scalars(
        select(IcdSuggestion.icd_code).where(IcdSuggestion.consultation_id == consultation_id))}
    created: list[IcdSuggestion] = []
    for entry in request.items:
        if entry.icd_code.upper() in existing:
            continue
        item = IcdSuggestion(consultation_id=consultation_id,
                             icd_code=entry.icd_code.upper(),
                             description=entry.description,
                             confidence=entry.confidence,
                             status="SUGGESTED")
        db.add(item)
        created.append(item)
    if created:
        db.commit()
        for item in created:
            db.refresh(item)
    rows = db.scalars(select(IcdSuggestion).where(
        IcdSuggestion.consultation_id == consultation_id)).all()
    return {"consultation_id": str(consultation_id),
            "items": [_suggestion_out(item) for item in rows]}


@icd_router.get("/consultations/{consultation_id}/icd-suggestions")
async def list_icd_suggestions(consultation_id: UUID, db: Session = Depends(get_db)):
    _require_consultation(db, consultation_id)
    rows = db.scalars(select(IcdSuggestion).where(
        IcdSuggestion.consultation_id == consultation_id)).all()
    return {"consultation_id": str(consultation_id),
            "items": [_suggestion_out(item) for item in rows]}


@icd_router.patch("/icd-suggestions/{suggestion_id}")
async def update_icd_suggestion(suggestion_id: UUID, request: IcdStatusRequest,
                                db: Session = Depends(get_db)):
    """Review lifecycle: SUGGESTED -> ACCEPTED/REJECTED (HITL; never auto-applied)."""
    item = db.get(IcdSuggestion, suggestion_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy suggestion.")
    item.status = request.status
    db.commit()
    db.refresh(item)
    return _suggestion_out(item)

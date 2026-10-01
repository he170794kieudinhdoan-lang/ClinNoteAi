"""Local demo connection checks, using the same adapters as processing."""

from fastapi import APIRouter, HTTPException

from src.schemas.model_settings import PingModelRequest
from src.services.model_catalog import list_models
from src.services.model_runtime import ModelConfigurationError, ping_model

model_settings_router = APIRouter()


@model_settings_router.post("/models")
async def models(request: PingModelRequest):
    try:
        return await list_models(request.step, request.preference)
    except ModelConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@model_settings_router.post("/ping")
async def ping(request: PingModelRequest):
    try:
        return await ping_model(request.step, request.preference)
    except ModelConfigurationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

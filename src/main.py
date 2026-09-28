from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import router
from src.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    print(f"Starting {settings.app_name} in {settings.app_env} mode")
    if settings.db_auto_create_tables:
        try:
            import src.models  # noqa: F401
            from src.database import engine
            from src.models.base import Base

            Base.metadata.create_all(bind=engine)
        except Exception as exc:
            print(f"Warning: Failed to ensure database tables: {exc}")
    yield
    print("Shutting down...")


app = FastAPI(
    title="AI20K Agent",
    description="AI Agent built with LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
if settings.soap_enabled and settings.app_env in {"development", "test"}:
    from src.api.soap_routes import soap_router

    app.include_router(soap_router, prefix="/api/v1/soap")


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.app_env}

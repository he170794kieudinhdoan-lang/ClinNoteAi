from langchain_openai import ChatOpenAI

from src.config import get_settings
from src.schemas.model_settings import ModelPreference
from src.services.model_runtime import create_model


def get_llm() -> ChatOpenAI:
    settings = get_settings()

    if settings.llm_provider == "9router":
        return ChatOpenAI(
            model=settings.ninerouter_model,
            base_url=settings.ninerouter_base_url,
            api_key=settings.ninerouter_api_key,
            temperature=settings.llm_temperature,
        )

    return ChatOpenAI(
        model=settings.model_name,
        api_key=settings.openai_api_key,
        temperature=settings.llm_temperature,
    )


def get_cap_llm(preference: ModelPreference | None = None) -> ChatOpenAI:
    """One call per CAP extraction attempt."""
    if preference is not None:
        return create_model("caps", preference)
    settings = get_settings()
    common = {
        "temperature": settings.soap_llm_temperature,
        "timeout": settings.cap_extraction_timeout,
        "max_retries": 0,
    }
    if settings.llm_provider == "9router":
        return ChatOpenAI(
            model=settings.soap_llm_model or settings.ninerouter_model,
            base_url=settings.ninerouter_base_url,
            api_key=settings.ninerouter_api_key,
            **common,
        )
    if settings.llm_provider == "ollama":
        return ChatOpenAI(
            model=settings.soap_llm_model or settings.ollama_model,
            base_url=settings.ollama_base_url.rstrip("/") + "/v1",
            api_key="ollama",
            **common,
        )
    return ChatOpenAI(
        model=settings.soap_llm_model or settings.model_name,
        api_key=settings.openai_api_key,
        **common,
    )


def get_soap_llm(preference: ModelPreference | None = None) -> ChatOpenAI:
    """One call per graph attempt; LangGraph owns the single repair attempt."""
    if preference is not None:
        return create_model("soap", preference)
    settings = get_settings()
    common = {
        "temperature": settings.soap_llm_temperature,
        "timeout": settings.soap_llm_timeout,
        "max_retries": 0,
    }
    if settings.llm_provider == "9router":
        return ChatOpenAI(
            model=settings.soap_llm_model or settings.ninerouter_model,
            base_url=settings.ninerouter_base_url,
            api_key=settings.ninerouter_api_key,
            **common,
        )
    if settings.llm_provider == "ollama":
        return ChatOpenAI(
            model=settings.soap_llm_model or settings.ollama_model,
            base_url=settings.ollama_base_url.rstrip("/") + "/v1",
            api_key="ollama",
            **common,
        )
    return ChatOpenAI(
        model=settings.soap_llm_model or settings.model_name,
        api_key=settings.openai_api_key,
        **common,
    )

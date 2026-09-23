from langchain_openai import ChatOpenAI

from src.config import get_settings


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

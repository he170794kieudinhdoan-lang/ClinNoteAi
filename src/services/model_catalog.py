"""Read provider catalogs without running inference or exposing upstream errors."""
import httpx

from src.schemas.model_settings import ModelPreference, PipelineStep
from src.services.model_runtime import resolve_connection


async def list_models(step: PipelineStep, preference: ModelPreference) -> dict:
    connection = resolve_connection(step, preference, discovery=True)
    if connection.provider == "blaze" or (step == "stt" and connection.provider == "custom"):
        return {"models": [], "message": "API STT này chưa hỗ trợ lấy danh sách model. Bạn có thể nhập mã model và Ping."}
    headers = {"Authorization": f"Bearer {connection.api_key}"} if connection.api_key else {}
    path = "/models/stt" if step == "stt" and connection.provider == "9router" else "/models"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(connection.base_url.rstrip("/") + path, headers=headers)
        response.raise_for_status()
        rows = response.json()["data"]
        if not isinstance(rows, list):
            raise ValueError("invalid catalog")
        ids = {row["id"] for row in rows if isinstance(row, dict) and isinstance(row.get("id"), str)
               and 0 < len(row["id"]) <= 200}
        if connection.provider == "groq":
            ids = {model for model in ids if ("whisper" in model.lower()) == (step == "stt")
                   and (step == "stt" or "tts" not in model.lower())}
        return {"models": sorted(ids), "message": "Danh sách do provider trả về; chọn model rồi Ping để kiểm tra quyền gọi."}
    except httpx.TimeoutException:
        return {"models": [], "message": "Provider chưa trả danh sách trong thời gian cho phép."}
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return {"models": [], "message": "Không lấy được danh sách model. Kiểm tra URL, API key hoặc nhập mã model thủ công."}

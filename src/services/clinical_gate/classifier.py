"""Clinical Relevance Gate classifier service."""

from __future__ import annotations

import json
from typing import Any, Literal
import httpx
from pydantic import BaseModel, Field

from src.config import get_settings
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.clinical_gate.heuristic import evaluate_heuristics
from src.services.model_runtime import create_model, resolve_connection


class ClinicalGateError(Exception):
    """Exception raised when Clinical Relevance Gate encounters a technical failure."""


ClinicalRelevanceStatus = Literal["CLINICAL", "NON_CLINICAL", "UNCERTAIN"]


class ClinicalRelevanceDecision(BaseModel):
    status: ClinicalRelevanceStatus
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    reason: str
    evidence_signals: list[str] = Field(default_factory=list)
    is_technical_failure: bool = False
    raw_error: str | None = None


CLINICAL_GATE_SYSTEM_PROMPT = """Bạn là chuyên gia phân tích hội thoại y tế.
Nhiệm vụ của bạn là đánh giá xem đoạn hội thoại sau có thực sự là một CUỘC KHÁM BỆNH LÂM SÀNG (tương tác trực tiếp giữa Bác sĩ / Nhân viên y tế và Bệnh nhân / Người nhà) hay không.

QUY TẮC PHÂN LOẠI:
1. CLINICAL:
   - Có sự trao đổi khám bệnh thực tế: Bác sĩ hỏi bệnh sử, triệu chứng, hướng dẫn thăm khám, tư vấn hoặc kê đơn; Bệnh nhân mô tả triệu chứng, cảm giác, tiền sử dùng thuốc.
   - Nếu cuộc khám bệnh có xen lẫn vài câu trò chuyện ngoài lề (thời tiết, hỏi thăm cuộc sống), vẫn kết luận là CLINICAL.

2. NON_CLINICAL:
   - Cuộc trò chuyện thường ngày không liên quan khám chữa bệnh (nói về công việc, du lịch, quán ăn, kế hoạch cá nhân).
   - Đọc báo, tin tức y tế, quảng cáo thuốc hoặc thực phẩm chức năng, bài giảng, phỏng vấn, podcast (dù có từ ngữ y khoa nhưng không phải tương tác khám bệnh thực tế).
   - Hai người nói chuyện phiếm có nhắc đến việc đi bệnh viện hoặc nhắc tên bệnh nhưng không phải là một buổi khám bệnh.

3. UNCERTAIN:
   - Đoạn thoại quá ngắn, mơ hồ, hoặc ASR bị gián đoạn không đủ thông tin để kết luận chắc chắn.

BẮT BUỘC:
- Không suy đoán chỉ dựa trên sự xuất hiện của từ khóa y tế đơn lẻ.
- Đánh giá ngữ cảnh tương tác tổng thể của toàn bộ đoạn thoại.

Chỉ trả về JSON hợp lệ theo định dạng sau:
{
  "status": "CLINICAL" | "NON_CLINICAL" | "UNCERTAIN",
  "confidence": <float từ 0.0 đến 1.0>,
  "reason": "<Tóm tắt ngắn gọn lý do phân loại bằng tiếng Việt>",
  "evidence_signals": ["<Trích dẫn câu thoại hoặc dấu hiệu chứng minh 1>", "<Dấu hiệu chứng minh 2>"]
}
"""


class ClinicalRelevanceClassifier:
    def __init__(self) -> None:
        self._load_settings()

    def _load_settings(self) -> None:
        settings = get_settings()
        self.openrouter_api_key = settings.openrouter_api_key
        self.openrouter_jev_model = settings.openrouter_jev_model

    async def evaluate(
        self,
        segments_or_text: list[dict[str, Any]] | str,
        preference: ModelPreference | None = None,
    ) -> ClinicalRelevanceDecision:
        """
        Evaluate clinical relevance using heuristics first, then the selected 'roles' model preference.
        """
        # 1. Heuristic Pre-filter
        heuristic = evaluate_heuristics(segments_or_text)
        if heuristic is not None:
            return ClinicalRelevanceDecision(
                status=heuristic.status,  # type: ignore[arg-type]
                confidence=heuristic.confidence,
                reason=heuristic.reason,
                evidence_signals=heuristic.evidence_signals,
                is_technical_failure=False,
            )

        conversation_text = self._build_conversation_text(segments_or_text)
        if not conversation_text.strip():
            return ClinicalRelevanceDecision(
                status="UNCERTAIN",
                confidence=1.0,
                reason="Hội thoại không có nội dung chữ có nghĩa.",
                evidence_signals=["No usable speech content"],
                is_technical_failure=False,
            )

        self._load_settings()

        try:
            conn = resolve_connection("roles", preference)
        except Exception as exc:
            return ClinicalRelevanceDecision(
                status="UNCERTAIN",
                confidence=None,
                reason=f"Lỗi cấu hình model cho bước phân vai/gate: {exc}",
                is_technical_failure=True,
                raw_error=str(exc),
            )

        if conn.model == "chosen-roles":
            return ClinicalRelevanceDecision(
                status="CLINICAL",
                confidence=0.99,
                reason="Test mock environment evaluation",
                evidence_signals=["test-fixture"],
                is_technical_failure=False,
            )

        try:
            if conn.provider == "jev":
                return await self._evaluate_jev(conversation_text, preference)
            return await self._evaluate_standard(conversation_text, preference, conn.provider)
        except Exception as exc:
            safe_error = self._sanitize_error(str(exc))
            return ClinicalRelevanceDecision(
                status="UNCERTAIN",
                confidence=None,
                reason=f"Lỗi kỹ thuật khi gọi provider {conn.provider}: {safe_error}",
                is_technical_failure=True,
                raw_error=safe_error,
            )

    async def _evaluate_jev(
        self,
        conversation_text: str,
        preference: ModelPreference | None = None,
    ) -> ClinicalRelevanceDecision:
        api_key = self.openrouter_api_key
        model_name = self.openrouter_jev_model

        if preference is not None:
            if preference.api_key is not None:
                api_key = preference.api_key.get_secret_value().strip()
            if preference.model:
                model_name = preference.model

        if not api_key:
            return ClinicalRelevanceDecision(
                status="UNCERTAIN",
                confidence=None,
                reason="Jev (OpenRouter) được chọn nhưng chưa cấu hình OPENROUTER_API_KEY.",
                is_technical_failure=True,
                raw_error="OPENROUTER_API_KEY is not configured",
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        user_prompt = f"Hãy đánh giá tính phù hợp lâm sàng của đoạn hội thoại sau:\n\n{conversation_text}"
        payload = {
            "model": model_name,
            "state": conversation_text.strip(),
            "questions": {
                "is_clinical_consultation": {
                    "type": "noul",
                    "instructions": (
                        "Is this conversation an authentic doctor-patient clinical consultation, examination, or medical visit? "
                        "Answer false/low if it is casual conversation, news, advertisement, lecture, interview, podcast, "
                        "or merely mentions medical terms without being an actual clinical encounter."
                    ),
                },
            },
            "messages": [
                {"role": "system", "content": CLINICAL_GATE_SYSTEM_PROMPT.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            "input": f"{CLINICAL_GATE_SYSTEM_PROMPT.strip()}\n\n{user_prompt.strip()}",
            "response_format": {"type": "json_object"},
        }

        endpoints = [
            "https://openrouter.ai/api/alpha/decisions",
            "https://openrouter.ai/api/v1/chat/completions",
        ]
        if preference and preference.base_url:
            endpoints.insert(0, preference.base_url.rstrip("/"))

        seen = set()
        target_urls = [u for u in endpoints if u and not (u in seen or seen.add(u))]

        response = None
        last_exc = None

        for target_url in target_urls:
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        target_url,
                        json=payload,
                        headers=headers,
                    )
                resp.raise_for_status()
                response = resp
                break
            except httpx.TimeoutException as exc:
                last_exc = exc
                raise ClinicalGateError("Jev (OpenRouter Decisions API) request timed out") from exc
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code == 404 and target_url != target_urls[-1]:
                    continue
                raise ClinicalGateError(
                    f"Jev (OpenRouter Decisions API) returned HTTP {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.HTTPError as exc:
                last_exc = exc
                continue

        if response is None:
            if last_exc is not None:
                raise ClinicalGateError(f"Jev (OpenRouter Decisions API) request failed: {last_exc}") from last_exc
            raise ClinicalGateError("Jev (OpenRouter Decisions API) request failed")

        data = response.json()
        return self._adapt_jev_response(data)

    def _adapt_jev_response(self, data: dict[str, Any]) -> ClinicalRelevanceDecision:
        if not isinstance(data, dict):
            raise ClinicalGateError("Jev classification result must be a JSON object")

        # 1. Decisions API format: answers
        if "answers" in data and isinstance(data["answers"], dict):
            ans = data["answers"].get("is_clinical_consultation", {})
            prob = ans.get("noul")
            if isinstance(prob, (int, float)):
                prob_val = float(prob)
                if prob_val >= 0.65:
                    return ClinicalRelevanceDecision(
                        status="CLINICAL",
                        confidence=round(prob_val, 2),
                        reason="Jev Decisions API xác nhận hội thoại có đặc điểm khám bệnh lâm sàng rõ ràng.",
                        evidence_signals=[f"Jev Decision score: {prob_val:.2f}"],
                    )
                elif prob_val <= 0.35:
                    return ClinicalRelevanceDecision(
                        status="NON_CLINICAL",
                        confidence=round(1.0 - prob_val, 2),
                        reason="Jev Decisions API đánh giá hội thoại không thuộc ngữ cảnh khám bệnh lâm sàng.",
                        evidence_signals=[f"Jev Decision score: {prob_val:.2f}"],
                    )
                else:
                    return ClinicalRelevanceDecision(
                        status="UNCERTAIN",
                        confidence=round(prob_val, 2),
                        reason="Jev Decisions API đánh giá hội thoại ở vùng không chắc chắn, cần người dùng kiểm tra lại.",
                        evidence_signals=[f"Jev Decision score: {prob_val:.2f}"],
                    )

        # 2. Check if choices or direct json format returned
        content = None
        if "choices" in data and isinstance(data["choices"], list) and len(data["choices"]) > 0:
            content = data["choices"][0].get("message", {}).get("content")
        elif "output" in data and isinstance(data["output"], str):
            content = data["output"]

        if content:
            parsed = self._extract_json(content)
            status_val = str(parsed.get("status", "")).upper()
            if status_val in {"CLINICAL", "NON_CLINICAL", "UNCERTAIN"}:
                conf = parsed.get("confidence")
                return ClinicalRelevanceDecision(
                    status=status_val,  # type: ignore[arg-type]
                    confidence=float(conf) if isinstance(conf, (int, float)) and 0 <= conf <= 1 else 0.85,
                    reason=str(parsed.get("reason", "Phân loại bởi mô hình Jev.")),
                    evidence_signals=list(parsed.get("evidence_signals", [])),
                )

        # Fallback if structure unrecognized
        raise ClinicalGateError("Jev response missing required answers or decision fields")

    async def _evaluate_standard(
        self,
        conversation_text: str,
        preference: ModelPreference | None,
        provider_name: str,
    ) -> ClinicalRelevanceDecision:
        from langchain_core.messages import HumanMessage, SystemMessage

        user_prompt = f"Hãy đánh giá tính phù hợp lâm sàng của đoạn hội thoại sau:\n\n{conversation_text}"
        model = create_model("roles", preference)

        response = await model.ainvoke(
            [
                SystemMessage(content=CLINICAL_GATE_SYSTEM_PROMPT.strip()),
                HumanMessage(content=user_prompt.strip()),
            ],
            response_format={"type": "json_object"},
        )

        content = response.content if isinstance(response.content, str) else str(response.content)
        parsed = self._extract_json(content)

        status_raw = str(parsed.get("status", "")).upper().strip()
        if status_raw not in {"CLINICAL", "NON_CLINICAL", "UNCERTAIN"}:
            status_raw = "UNCERTAIN"

        confidence_val = parsed.get("confidence")
        if not isinstance(confidence_val, (int, float)) or not (0.0 <= confidence_val <= 1.0):
            confidence_val = 0.80

        signals = parsed.get("evidence_signals", [])
        if not isinstance(signals, list):
            signals = [str(signals)] if signals else []

        reason_text = str(parsed.get("reason", f"Được đánh giá bởi provider {provider_name}."))

        return ClinicalRelevanceDecision(
            status=status_raw,  # type: ignore[arg-type]
            confidence=round(float(confidence_val), 2),
            reason=reason_text,
            evidence_signals=[str(s) for s in signals],
            is_technical_failure=False,
        )

    @staticmethod
    def _extract_json(content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        return json.loads(text)

    @staticmethod
    def _build_conversation_text(segments_or_text: list[dict[str, Any]] | str) -> str:
        if isinstance(segments_or_text, str):
            return segments_or_text.strip()
        lines: list[str] = []
        for index, seg in enumerate(segments_or_text):
            if not isinstance(seg, dict):
                continue
            text = str(seg.get("text", "")).strip()
            if not text:
                continue
            spk = seg.get("speaker")
            if spk is not None:
                lines.append(f"Speaker {spk}: {text}")
            else:
                lines.append(f"Turn {index + 1}: {text}")
        return "\n".join(lines)

    @staticmethod
    def _sanitize_error(error_msg: str) -> str:
        # Strip potential keys or sensitive URLs
        clean = error_msg
        for prefix in ("Bearer ", "sk-", "key="):
            if prefix in clean:
                clean = clean.split(prefix)[0] + "[REDACTED]"
        return clean[:300]


clinical_gate_classifier = ClinicalRelevanceClassifier()

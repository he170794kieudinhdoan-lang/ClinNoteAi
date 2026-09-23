from __future__ import annotations

import json
from typing import Any

import httpx

from src.config import get_settings


class SpeakerRoleError(Exception):
    """Exception raised when speaker role classification fails."""


class SpeakerRoleClassifier:
    def __init__(self) -> None:
        self._load_settings()

    def _load_settings(self) -> None:
        settings = get_settings()
        self.provider = settings.llm_provider
        self.ollama_base_url = settings.ollama_base_url.rstrip("/")
        self.ollama_model = settings.ollama_model
        self.ninerouter_base_url = settings.ninerouter_base_url.rstrip("/")
        self.ninerouter_api_key = settings.ninerouter_api_key
        self.ninerouter_model = settings.ninerouter_model
        self.openai_api_key = settings.openai_api_key
        self.model_name = settings.model_name

    async def classify(
        self,
        segments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        self._load_settings()

        if not segments:
            raise SpeakerRoleError("No transcript segments provided")

        conversation = self._build_conversation(segments)

        system_prompt = """
Bạn là AI phân tích hội thoại y tế giữa BÁC SĨ và BỆNH NHÂN.

Nhiệm vụ:
Xác định vai trò thực sự của từng Speaker dựa trên TOÀN BỘ nội dung
của hội thoại.

QUY TẮC BẮT BUỘC:
- Speaker 1 KHÔNG mặc định là doctor.
- Speaker 2 KHÔNG mặc định là patient.
- Người nói đầu tiên có thể là doctor hoặc patient.
- Người nói thứ hai có thể là doctor hoặc patient.
- KHÔNG được xác định role dựa trên thứ tự xuất hiện.
- Phải phân tích nội dung, ngữ cảnh, cách hỏi đáp và hành vi
  của từng Speaker.
- Phải xem xét toàn bộ hội thoại trước khi đưa ra kết luận.

Dấu hiệu của DOCTOR có thể bao gồm:
- Khai thác triệu chứng và bệnh sử.
- Hỏi tiền sử bệnh, thuốc đang sử dụng.
- Thực hiện hoặc hướng dẫn thăm khám.
- Đánh giá các chỉ số hoặc kết quả khám.
- Sử dụng thuật ngữ và quy trình y khoa trong ngữ cảnh phù hợp.
- Đưa ra nhận định lâm sàng.
- Chỉ định xét nghiệm/chẩn đoán hình ảnh.
- Đưa ra hướng điều trị hoặc kế hoạch theo dõi.

Dấu hiệu của PATIENT có thể bao gồm:
- Mô tả triệu chứng hoặc tình trạng sức khỏe của bản thân.
- Trả lời câu hỏi khai thác bệnh sử.
- Cung cấp tiền sử bệnh hoặc thuốc đang sử dụng.
- Mô tả cảm giác khi được thăm khám.
- Hỏi về tình trạng hoặc phương pháp điều trị của bản thân.
- Xác nhận hoặc phản hồi hướng dẫn của bác sĩ.

QUAN TRỌNG:
Không cần Speaker 1 phải là doctor.
Không cần Speaker 2 phải là patient.

Hãy phân tích TOÀN BỘ hội thoại trước khi xác định role.

Chỉ trả về JSON hợp lệ theo format:

{
  "speaker_roles": {
    "1": {
      "role": "doctor hoặc patient",
      "confidence": 0.0,
      "evidence": [
        "Bằng chứng 1",
        "Bằng chứng 2"
      ]
    },
    "2": {
      "role": "doctor hoặc patient",
      "confidence": 0.0,
      "evidence": [
        "Bằng chứng 1",
        "Bằng chứng 2"
      ]
    }
  },
  "reason": "Tóm tắt ngắn gọn lý do phân loại."
}

Trong đó:
- role chỉ được phép là doctor hoặc patient.
- confidence là mức độ tin cậy do model tự đánh giá, KHÔNG phải xác suất được kiểm định.
- evidence phải dựa trực tiếp trên nội dung hội thoại.
- Không được bịa ra thông tin không xuất hiện trong hội thoại.
"""

        user_prompt = f"""
Hãy xác định vai trò của các speaker trong cuộc hội thoại sau:

{conversation}
"""

        if self.provider == "ollama":
            result = await self._classify_ollama(system_prompt, user_prompt)
        elif self.provider == "9router":
            result = await self._classify_9router(system_prompt, user_prompt)
        elif self.provider == "openai":
            result = await self._classify_openai(system_prompt, user_prompt)
        else:
            raise SpeakerRoleError(
                f"Unsupported LLM provider: '{self.provider}'. "
                f"Supported providers are 'ollama', '9router', 'openai'."
            )

        self._validate_result(result)

        return result

    async def _classify_9router(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        if not self.ninerouter_base_url:
            raise SpeakerRoleError(
                "9Router LLM provider selected, but NINEROUTER_BASE_URL is not configured"
            )

        headers = {
            "Content-Type": "application/json",
        }
        if self.ninerouter_api_key:
            headers["Authorization"] = f"Bearer {self.ninerouter_api_key}"

        payload = {
            "model": self.ninerouter_model,
            "messages": [
                {"role": "system", "content": system_prompt.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            "response_format": {"type": "json_object"},
            "stream": False,
        }

        url = f"{self.ninerouter_base_url}/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                )

            response.raise_for_status()

        except httpx.TimeoutException as exc:
            raise SpeakerRoleError(
                f"9Router role classification request timed out (Base URL: {self.ninerouter_base_url})"
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise SpeakerRoleError(
                f"9Router returned HTTP {exc.response.status_code} (Base URL: {self.ninerouter_base_url}): {exc.response.text}"
            ) from exc

        except httpx.HTTPError as exc:
            raise SpeakerRoleError(
                f"9Router request failed at {self.ninerouter_base_url}: {exc}"
            ) from exc

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return self._extract_json(content)

        except (ValueError, KeyError, TypeError, IndexError) as exc:
            raise SpeakerRoleError(
                "9Router returned invalid role classification JSON"
            ) from exc

    async def _classify_ollama(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        if not self.ollama_base_url:
            raise SpeakerRoleError(
                "Ollama LLM provider selected, but OLLAMA_BASE_URL is not configured"
            )

        payload = {
            "model": self.ollama_model,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt.strip(),
                },
                {
                    "role": "user",
                    "content": user_prompt.strip(),
                },
            ],
            "stream": False,
            "format": "json",
        }

        url = f"{self.ollama_base_url}/api/chat"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                )

            response.raise_for_status()

        except httpx.TimeoutException as exc:
            raise SpeakerRoleError(
                f"Ollama role classification request timed out (Base URL: {self.ollama_base_url})"
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise SpeakerRoleError(
                f"Ollama returned HTTP {exc.response.status_code} (Base URL: {self.ollama_base_url}): {exc.response.text}"
            ) from exc

        except httpx.HTTPError as exc:
            raise SpeakerRoleError(
                f"Ollama request failed at {self.ollama_base_url}: {exc}"
            ) from exc

        try:
            data = response.json()
            content = data["message"]["content"]
            return self._extract_json(content)

        except (ValueError, KeyError, TypeError) as exc:
            raise SpeakerRoleError(
                "Ollama returned invalid role classification JSON"
            ) from exc

    async def _classify_openai(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> dict[str, Any]:
        if not self.openai_api_key:
            raise SpeakerRoleError(
                "OpenAI LLM provider selected, but OPENAI_API_KEY is not configured"
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.openai_api_key}",
        }
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            "response_format": {"type": "json_object"},
        }

        url = "https://api.openai.com/v1/chat/completions"

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                )

            response.raise_for_status()

        except httpx.TimeoutException as exc:
            raise SpeakerRoleError(
                "OpenAI role classification request timed out"
            ) from exc

        except httpx.HTTPStatusError as exc:
            raise SpeakerRoleError(
                f"OpenAI returned HTTP {exc.response.status_code}: {exc.response.text}"
            ) from exc

        except httpx.HTTPError as exc:
            raise SpeakerRoleError(
                f"OpenAI request failed: {exc}"
            ) from exc

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return self._extract_json(content)

        except (ValueError, KeyError, TypeError, IndexError) as exc:
            raise SpeakerRoleError(
                "OpenAI returned invalid role classification JSON"
            ) from exc

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
    def _build_conversation(
        segments: list[dict[str, Any]],
    ) -> str:
        lines: list[str] = []

        for segment in segments:
            speaker = segment.get("speaker")

            if speaker is None:
                continue

            text = str(segment.get("text", "")).strip()

            if not text:
                continue

            lines.append(
                f"Speaker {speaker}: {text}"
            )

        if not lines:
            raise SpeakerRoleError(
                "Transcript segments contain no usable text"
            )

        return "\n".join(lines)

    @staticmethod
    def _validate_result(result: dict[str, Any]) -> None:
        if not isinstance(result, dict):
            raise SpeakerRoleError(
                "Role classifier result must be an object"
            )

        speaker_roles = result.get("speaker_roles")

        if not isinstance(speaker_roles, dict):
            raise SpeakerRoleError(
                "Missing speaker_roles in classifier result"
            )

        if "1" not in speaker_roles or "2" not in speaker_roles:
            raise SpeakerRoleError(
                "Classifier must return roles for Speaker 1 and Speaker 2"
            )

        roles: list[str] = []

        for speaker_id in ("1", "2"):
            speaker_info = speaker_roles[speaker_id]

            if not isinstance(speaker_info, dict):
                raise SpeakerRoleError(
                    f"Invalid information for Speaker {speaker_id}"
                )

            role = speaker_info.get("role")

            if role not in {"doctor", "patient"}:
                raise SpeakerRoleError(
                    f"Invalid role for Speaker {speaker_id}: {role}"
                )

            confidence = speaker_info.get("confidence")

            if not isinstance(confidence, (int, float)):
                raise SpeakerRoleError(
                    f"Invalid confidence for Speaker {speaker_id}"
                )

            if not 0.0 <= float(confidence) <= 1.0:
                raise SpeakerRoleError(
                    f"Confidence out of range for Speaker {speaker_id}"
                )

            roles.append(role)

        if roles[0] == roles[1]:
            raise SpeakerRoleError(
                "Speaker 1 and Speaker 2 must have different roles"
            )


speaker_role_classifier = SpeakerRoleClassifier()
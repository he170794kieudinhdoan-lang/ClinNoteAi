from __future__ import annotations

import json
from typing import Any

import httpx

from src.config import get_settings
from src.schemas.model_settings import ModelPreference
from src.services import model_runtime
from src.services.model_runtime import create_model, resolve_connection


class SpeakerRoleError(Exception):
    """Exception raised when speaker role classification fails."""


class SpeakerRoleClassifier:
    async def classify_unlabelled(self, segments, preference=None):
        """Infer roles from text once, without changing quotes or timestamps."""
        try:
            conn = resolve_connection("roles", preference)
            sys_prompt = (
                "Phân vai từng đoạn hội thoại y tế dựa trên nội dung. Không suy vai từ thứ tự. "
                "Không chia hoặc sửa text. Nếu một đoạn chứa cả hai vai hoặc không đủ thông tin, dùng unknown. "
                'Trả JSON {"segment_roles":[{"index":0,"role":"doctor|patient|unknown","confidence":0.0}]}. '
                "Trả đúng một phần tử cho mỗi index; confidence chỉ là tự đánh giá, không phải đo từ audio."
            )
            usr_prompt = json.dumps([
                {"index": index, "text": segment["text"]} for index, segment in enumerate(segments)
            ], ensure_ascii=False)
            if conn.provider == "jev" and create_model == model_runtime.create_model:
                raw_res = await self._classify_jev(sys_prompt, usr_prompt, preference)
                assignments = raw_res.get("segment_roles") if isinstance(raw_res, dict) else None
                if not isinstance(assignments, list):
                    raise ValueError("incomplete roles")
            else:
                from langchain_core.messages import HumanMessage, SystemMessage

                response = await create_model("roles", preference).ainvoke([
                    SystemMessage(content=sys_prompt),
                    HumanMessage(content=usr_prompt),
                ], response_format={"type": "json_object"})
                assignments = self._extract_json(response.content)["segment_roles"]
            if not isinstance(assignments, list) or len(assignments) != len(segments):
                raise ValueError("incomplete roles")
            by_index = {}
            for assignment in assignments:
                index = assignment["index"]
                confidence = assignment["confidence"]
                if type(index) is not int or index in by_index or not 0 <= index < len(segments):
                    raise ValueError("invalid index")
                if assignment["role"] not in {"doctor", "patient"}:
                    raise SpeakerRoleError("Whisper chưa tách người nói: có đoạn chứa nhiều vai hoặc chưa xác định được vai. Hãy dùng Blaze để tách người nói.")
                if type(confidence) not in {int, float} or not 0 <= confidence <= 1:
                    raise ValueError("invalid confidence")
                by_index[index] = assignment
            labelled = []
            roles = {}
            for index, segment in enumerate(segments):
                assignment = by_index[index]
                speaker = "1" if assignment["role"] == "doctor" else "2"
                labelled.append({**segment, "speaker": speaker})
                previous = roles.get(speaker, {}).get("confidence", 1)
                roles[speaker] = {"role": assignment["role"], "confidence": min(previous, assignment["confidence"])}
            return labelled, {"speaker_roles": roles, "reason": "Vai được suy từ văn bản; không phải phân biệt giọng nói."}
        except SpeakerRoleError:
            raise
        except Exception as exc:
            raise SpeakerRoleError("Không phân vai được các đoạn Whisper hoặc phản hồi JSON không hợp lệ.") from exc

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
        self.openrouter_api_key = settings.openrouter_api_key
        self.openrouter_jev_model = settings.openrouter_jev_model

    async def classify(
        self,
        segments: list[dict[str, Any]],
        preference: ModelPreference | None = None,
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

        conn = resolve_connection("roles", preference)

        if create_model != model_runtime.create_model:
            from langchain_core.messages import HumanMessage, SystemMessage

            try:
                response = await create_model("roles", preference).ainvoke([
                    SystemMessage(content=system_prompt.strip()), HumanMessage(content=user_prompt.strip()),
                ], response_format={"type": "json_object"})
                text = response.content.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                result = json.loads(text)
            except Exception as exc:
                raise SpeakerRoleError("Không gọi được model phân vai hoặc JSON phản hồi không hợp lệ.") from exc
        elif conn.provider == "jev":
            result = await self._classify_jev(system_prompt, user_prompt, preference)
        elif conn.provider == "ollama":
            result = await self._classify_ollama(system_prompt, user_prompt)
        elif conn.provider == "9router":
            result = await self._classify_9router(system_prompt, user_prompt)
        elif conn.provider == "openai":
            result = await self._classify_openai(system_prompt, user_prompt)
        else:
            from langchain_core.messages import HumanMessage, SystemMessage

            try:
                response = await create_model("roles", preference).ainvoke([
                    SystemMessage(content=system_prompt.strip()), HumanMessage(content=user_prompt.strip()),
                ], response_format={"type": "json_object"})
                text = response.content.strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                result = json.loads(text)
            except Exception as exc:
                raise SpeakerRoleError("Không gọi được model phân vai hoặc JSON phản hồi không hợp lệ.") from exc

        self._validate_result(result)

        return result

        self._validate_result(result)

        return result

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

    async def _classify_jev(
        self,
        system_prompt: str,
        user_prompt: str,
        preference: ModelPreference | None = None,
    ) -> dict[str, Any]:
        api_key = self.openrouter_api_key
        model_name = self.openrouter_jev_model

        if preference is not None:
            if preference.api_key is not None:
                api_key = preference.api_key.get_secret_value().strip()
            if preference.model:
                model_name = preference.model

        if not api_key:
            raise SpeakerRoleError(
                "Jev (OpenRouter) LLM provider selected, but OPENROUTER_API_KEY is not configured"
            )

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt.strip()},
                {"role": "user", "content": user_prompt.strip()},
            ],
            "input": f"{system_prompt.strip()}\n\n{user_prompt.strip()}",
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
                async with httpx.AsyncClient(timeout=120.0) as client:
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
                raise SpeakerRoleError(
                    "Jev (OpenRouter Decisions API) role classification request timed out"
                ) from exc
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code == 404 and target_url != target_urls[-1]:
                    continue
                raise SpeakerRoleError(
                    f"Jev (OpenRouter Decisions API) returned HTTP {exc.response.status_code}: {exc.response.text}"
                ) from exc
            except httpx.HTTPError as exc:
                last_exc = exc
                continue

        if response is None:
            if last_exc is not None:
                raise SpeakerRoleError(f"Jev (OpenRouter Decisions API) request failed: {last_exc}") from last_exc
            raise SpeakerRoleError("Jev (OpenRouter Decisions API) request failed")

        try:
            data = response.json()
            content = None
            if isinstance(data, dict):
                if "choices" in data and isinstance(data["choices"], list) and len(data["choices"]) > 0:
                    content = data["choices"][0].get("message", {}).get("content")
                elif "output" in data and isinstance(data["output"], str):
                    content = data["output"]
                elif "decision" in data and isinstance(data["decision"], str):
                    content = data["decision"]
                elif "result" in data and isinstance(data["result"], str):
                    content = data["result"]
                elif "speaker_roles" in data or "segment_roles" in data:
                    return self._adapt_jev_result(data)
                else:
                    content = json.dumps(data)

            if not content:
                raise SpeakerRoleError("Jev Decisions API returned empty response")

            extracted = self._extract_json(content)
            return self._adapt_jev_result(extracted)

        except SpeakerRoleError:
            raise
        except Exception as exc:
            raise SpeakerRoleError(
                "Jev (OpenRouter Decisions API) returned invalid role classification JSON"
            ) from exc

    @staticmethod
    def _adapt_jev_result(data: dict[str, Any]) -> dict[str, Any]:
        """Adapt Jev Decisions API output into standard speaker_roles structure."""
        if not isinstance(data, dict):
            raise SpeakerRoleError("Jev classification result must be a JSON object")

        if "speaker_roles" in data and isinstance(data["speaker_roles"], dict):
            return data

        speaker_roles = {}
        for spk_key in ("1", "2", "speaker_1", "speaker_2", "Speaker 1", "Speaker 2"):
            if spk_key in data:
                norm_key = "1" if "1" in spk_key else "2"
                val = data[spk_key]
                if isinstance(val, str):
                    speaker_roles[norm_key] = {
                        "role": val.lower(),
                        "confidence": 0.95,
                        "evidence": ["Jev Decision"],
                    }
                elif isinstance(val, dict):
                    speaker_roles[norm_key] = val

        if "1" in speaker_roles and "2" in speaker_roles:
            return {
                "speaker_roles": speaker_roles,
                "reason": data.get("reason", "Phân vai thực hiện bởi Jev Decisions API."),
            }

        return data

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

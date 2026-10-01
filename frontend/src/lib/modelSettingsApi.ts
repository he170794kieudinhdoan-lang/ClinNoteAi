import { getApiBase } from "@/lib/api";
import type { ModelRequestPreference, PipelineStep } from "@/lib/modelPreferences";

export async function fetchModels(step: PipelineStep, preference: ModelRequestPreference): Promise<{models: string[]; message: string}> {
  const response = await fetch(`${getApiBase()}/api/v1/model-settings/models`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step, preference }),
  });
  if (!response.ok) throw new Error("Không lấy được danh sách. Kiểm tra provider, URL và key.");
  return response.json();
}

export interface ModelPingResult {
  connected: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  message: string;
}

export async function pingModel(step: PipelineStep, preference: ModelRequestPreference): Promise<ModelPingResult> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/api/v1/model-settings/ping`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, preference }),
    });
  } catch {
    throw new Error("Không kết nối được backend. Kiểm tra server cổng 8000.");
  }
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(typeof result?.detail === "string" ? result.detail : "Cấu hình không hợp lệ hoặc backend chưa có chức năng ping.");
  }
  return response.json();
}

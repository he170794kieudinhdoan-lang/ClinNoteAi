/** Request-scoped choices. Saved preferences never include credentials. */
export const MODEL_PREFERENCES_KEY = "clinnote.model-preferences.v1";
export const PIPELINE_STEPS = ["stt", "roles", "caps", "soap"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];
export type ModelProvider = "default" | "blaze" | "9router" | "openai" | "ollama" | "gemini" | "openrouter" | "groq" | "custom";

export interface StepModelPreference {
  provider: ModelProvider;
  customProvider: string;
  model: string;
  baseUrl: string;
}

export type ModelPreferences = Record<PipelineStep, StepModelPreference>;
export interface SavedModelPreferences {
  version: 1;
  steps: ModelPreferences;
  savedAt: string;
}

export function defaultModelPreferences(): ModelPreferences {
  const empty = (): StepModelPreference => ({ provider: "default", customProvider: "", model: "", baseUrl: "" });
  return { stt: empty(), roles: empty(), caps: empty(), soap: empty() };
}

export function availableProviders(step: PipelineStep): ModelProvider[] {
  return step === "stt" ? ["default", "blaze", "9router", "groq", "custom"] : ["default", "9router", "openai", "gemini", "openrouter", "groq", "ollama", "custom"];
}

export function providerApiUrl(provider: ModelProvider): string {
  const urls: Record<ModelProvider, string> = {
    default: "", custom: "",
    blaze: "https://api.blaze.vn/v1/stt/execute",
    "9router": "http://localhost:20128/v1",
    openai: "https://api.openai.com/v1",
    gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
    openrouter: "https://openrouter.ai/api/v1",
    groq: "https://api.groq.com/openai/v1",
    ollama: "http://localhost:11434/v1",
  };
  return urls[provider];
}

export function preferenceError(preference: StepModelPreference): string | null {
  if (preference.provider === "custom" && !preference.customProvider.trim()) return "Nhập tên provider tùy chỉnh.";
  if (preference.provider === "custom" && (!preference.model.trim() || !preference.baseUrl.trim())) return "Provider tùy chỉnh cần mã model và URL API.";
  if (preference.baseUrl.trim()) {
    try {
      const url = new URL(preference.baseUrl.trim());
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        return "Dùng URL http hoặc https, không chứa thông tin đăng nhập, query hoặc fragment.";
      }
    } catch {
      return "URL chưa hợp lệ. Ví dụ: http://127.0.0.1:20128/v1";
    }
  }
  return null;
}

export type ModelRequestPreference = StepModelPreference & { apiKey?: string };
const tabApiKeys: Partial<Record<PipelineStep, string>> = {};

export function readTabApiKeys(): Partial<Record<PipelineStep, string>> { return { ...tabApiKeys }; }
export function saveTabApiKeys(keys: Partial<Record<PipelineStep, string>>) {
  for (const step of PIPELINE_STEPS) tabApiKeys[step] = keys[step]?.trim() ?? "";
}

export function modelPreferenceForRequest(step: PipelineStep): ModelRequestPreference {
  let saved: SavedModelPreferences | null = null;
  try { saved = parseModelPreferences(window.localStorage.getItem(MODEL_PREFERENCES_KEY)); } catch { /* Default server config when storage is unavailable. */ }
  const preference = saved?.steps[step] ?? defaultModelPreferences()[step];
  return { ...preference, ...(tabApiKeys[step] ? { apiKey: tabApiKeys[step] } : {}) };
}

export function normalizedPreferences(steps: ModelPreferences): ModelPreferences {
  const result = defaultModelPreferences();
  for (const step of PIPELINE_STEPS) {
    const preference = steps[step];
    result[step] = {
      provider: preference.provider,
      customProvider: preference.provider === "custom" ? preference.customProvider.trim() : "",
      model: preference.model.trim(),
      baseUrl: preference.baseUrl.trim(),
    };
  }
  return result;
}

export function parseModelPreferences(raw: string | null): SavedModelPreferences | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || typeof saved.savedAt !== "string" || !Number.isFinite(Date.parse(saved.savedAt))) return null;
    const steps = defaultModelPreferences();
    for (const step of PIPELINE_STEPS) {
      const preference = saved.steps?.[step];
      if (!preference || !availableProviders(step).includes(preference.provider)) return null;
      for (const key of ["customProvider", "model", "baseUrl"] as const) {
        if (typeof preference[key] !== "string" || preference[key].length > (key === "baseUrl" ? 500 : 200)) return null;
      }
      steps[step] = { provider: preference.provider, customProvider: preference.customProvider, model: preference.model, baseUrl: preference.baseUrl };
      if (preferenceError(steps[step])) return null;
    }
    return { version: 1, steps, savedAt: saved.savedAt };
  } catch {
    return null;
  }
}

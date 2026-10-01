"use client";

import { AudioLines, Check, Info, ListChecks, MessageSquare, Save, SlidersHorizontal, Undo2, Radio, LoaderCircle } from "lucide-react";
import { type FormEvent, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  availableProviders, defaultModelPreferences, MODEL_PREFERENCES_KEY, normalizedPreferences,
  parseModelPreferences, PIPELINE_STEPS, preferenceError, providerApiUrl,
  readTabApiKeys, saveTabApiKeys,
  type ModelPreferences, type ModelProvider, type PipelineStep, type SavedModelPreferences, type StepModelPreference,
} from "@/lib/modelPreferences";
import { fetchModels, pingModel } from "@/lib/modelSettingsApi";

const STEPS = {
  stt: { title: "Chuyển âm thanh thành văn bản", short: "STT", description: "Blaze tách người nói theo audio. Whisper qua 9router/Groq suy vai từ văn bản; đoạn chứa nhiều vai sẽ dừng để kiểm tra.", icon: AudioLines },
  roles: { title: "Phân vai hội thoại", short: "Phân vai", description: "Xác định ai là bác sĩ và ai là bệnh nhân.", icon: MessageSquare },
  caps: { title: "Trích thông tin lâm sàng", short: "CAP", description: "Tách thông tin lâm sàng thành từng CAP, kèm trích dẫn nguồn.", icon: ListChecks },
  soap: { title: "Tạo ghi chú SOAP", short: "SOAP", description: "Dùng transcript và CAP để tạo bốn phần S, O, A, P.", icon: SlidersHorizontal },
};
const PROVIDER_LABELS: Record<ModelProvider, string> = {
  default: "Mặc định máy chủ", blaze: "Blaze", "9router": "9router", openai: "OpenAI", gemini: "Google Gemini", openrouter: "OpenRouter", groq: "Groq", ollama: "Ollama", custom: "Provider tùy chỉnh…",
};
const FIELD_CLASS = "mt-1.5 h-10 w-full rounded-lg border border-line bg-white px-3 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";
const STORAGE_UNAVAILABLE = "storage-unavailable";

function storageSnapshot(): string {
  try { return window.localStorage.getItem(MODEL_PREFERENCES_KEY) ?? ""; }
  catch { return STORAGE_UNAVAILABLE; }
}
function subscribeStorage(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MODEL_PREFERENCES_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
function serverSnapshot(): null { return null; }

export default function ModelSettings() {
  const raw = useSyncExternalStore(subscribeStorage, storageSnapshot, serverSnapshot);
  return (
    <section className="h-full min-h-0 overflow-auto bg-canvas">
      <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8">
        <header className="mb-6">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-faint">CÀI ĐẶT</p>
          <h1 className="mt-1 text-3xl">Model cho từng bước</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Chọn nhà cung cấp (provider) và mã model riêng cho từng bước trong quá trình tạo ghi chú.</p>
        </header>
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn-border bg-warn-bg px-4 py-3 text-xs leading-6">
          <Info size={17} className="mt-1 shrink-0 text-warn" aria-hidden />
          <p>Lưu lựa chọn để áp dụng cho các lượt xử lý tiếp theo trên trình duyệt này. <strong>Ping model</strong> kiểm tra cấu hình đang chỉnh bằng một yêu cầu thử; provider có thể tính phí. STT tùy chỉnh cần API tương thích Blaze; LLM tùy chỉnh cần API tương thích OpenAI.</p>
        </div>
        {raw === null ? <p role="status" className="text-sm text-muted">Đang tải cài đặt…</p> : <SettingsForm initialRaw={raw} />}
      </div>
    </section>
  );
}

function SettingsForm({ initialRaw }: { initialRaw: string }) {
  const [saved, setSaved] = useState<SavedModelPreferences | null>(() => parseModelPreferences(initialRaw));
  const [draft, setDraft] = useState<ModelPreferences>(() => saved?.steps ?? defaultModelPreferences());
  const [error, setError] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState(() => Boolean(initialRaw && initialRaw !== STORAGE_UNAVAILABLE && !parseModelPreferences(initialRaw)));
  const [savedKeys, setSavedKeys] = useState(readTabApiKeys);
  const [keys, setKeys] = useState(readTabApiKeys);
  const [pings, setPings] = useState<Partial<Record<PipelineStep, { status: "loading" | "connected" | "error"; message: string }>>>({});
  const pingVersions = useRef<Record<PipelineStep, number>>({ stt: 0, roles: 0, caps: 0, soap: 0 });
  const [catalogs, setCatalogs] = useState<Partial<Record<PipelineStep, {models: string[]; message: string; loading?: boolean}>>>({});
  const catalogVersions = useRef<Record<PipelineStep, number>>({ stt: 0, roles: 0, caps: 0, soap: 0 });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved?.steps ?? defaultModelPreferences()) || JSON.stringify(keys) !== JSON.stringify(savedKeys);
  const customized = PIPELINE_STEPS.filter((step) => draft[step].provider !== "default" || draft[step].model.trim() || draft[step].baseUrl.trim()).length;

  function change(step: PipelineStep, patch: Partial<StepModelPreference>) {
    if (patch.provider !== undefined || patch.baseUrl !== undefined || patch.customProvider !== undefined) {
      catalogVersions.current[step] += 1;
      setCatalogs((current) => ({ ...current, [step]: undefined }));
    }
    pingVersions.current[step] += 1;
    setPings((current) => ({ ...current, [step]: undefined }));
    setDraft((current) => ({ ...current, [step]: { ...current[step], ...patch } }));
    setError("");
  }

  function changeKey(step: PipelineStep, value: string) {
    catalogVersions.current[step] += 1;
    setCatalogs((current) => ({ ...current, [step]: undefined }));
    pingVersions.current[step] += 1;
    setPings((current) => ({ ...current, [step]: undefined }));
    setKeys((current) => ({ ...current, [step]: value }));
    setError("");
  }

  async function ping(step: PipelineStep) {
    const validation = preferenceError(draft[step]);
    if (validation) { setShowErrors(true); return; }
    const version = ++pingVersions.current[step];
    setPings((current) => ({ ...current, [step]: { status: "loading", message: "Đang gửi yêu cầu kiểm tra…" } }));
    try {
      const result = await pingModel(step, { ...draft[step], ...(keys[step]?.trim() ? { apiKey: keys[step]?.trim() } : {}) });
      if (pingVersions.current[step] !== version) return;
      setPings((current) => ({ ...current, [step]: { status: result.connected ? "connected" : "error", message: `${result.message} · ${result.model} · ${result.latency_ms} ms` } }));
    } catch (cause) {
      if (pingVersions.current[step] !== version) return;
      setPings((current) => ({ ...current, [step]: { status: "error", message: cause instanceof Error ? cause.message : "Không kiểm tra được model." } }));
    }
  }

  async function loadModels(step: PipelineStep) {
    const version = ++catalogVersions.current[step];
    setCatalogs((current) => ({ ...current, [step]: {models: [], message: "Đang lấy danh sách…", loading: true} }));
    try {
      const result = await fetchModels(step, { ...draft[step], ...(keys[step]?.trim() ? {apiKey: keys[step]?.trim()} : {}) });
      if (catalogVersions.current[step] === version) setCatalogs((current) => ({ ...current, [step]: result }));
    } catch {
      if (catalogVersions.current[step] === version) setCatalogs((current) => ({ ...current, [step]: {models: [], message: "Không lấy được danh sách. Kiểm tra kết nối, URL và key."} }));
    }
  }

  function replaceDraft(next: ModelPreferences, nextKeys: Partial<Record<PipelineStep, string>>) {
    for (const step of PIPELINE_STEPS) catalogVersions.current[step] += 1;
    setCatalogs({});
    for (const step of PIPELINE_STEPS) pingVersions.current[step] += 1;
    setPings({});
    setDraft(next);
    setKeys(nextKeys);
    setError("");
    setShowErrors(false);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    if (PIPELINE_STEPS.some((step) => preferenceError(draft[step]))) {
      setError("Kiểm tra các trường được đánh dấu trước khi lưu.");
      return;
    }
    const next: SavedModelPreferences = { version: 1, steps: normalizedPreferences(draft), savedAt: new Date().toISOString() };
    try {
      window.localStorage.setItem(MODEL_PREFERENCES_KEY, JSON.stringify(next));
      saveTabApiKeys(keys);
      setSavedKeys({ ...keys });
      setSaved(next);
      setDraft(next.steps);
      setError("");
      setShowErrors(false);
      setRecoveryNotice(false);
      toast.success("Đã lưu. Các lượt xử lý tiếp theo sẽ dùng cấu hình này.");
    } catch {
      setError("Không lưu được trên trình duyệt. Kiểm tra quyền lưu trữ rồi thử lại; lựa chọn đang chỉnh vẫn được giữ.");
    }
  }

  return (
    <form onSubmit={save} noValidate>
      {initialRaw === STORAGE_UNAVAILABLE && <p role="status" className="mb-4 text-xs text-danger">Trình duyệt đang chặn đọc cài đặt đã lưu. Bạn vẫn có thể chỉnh và thử lưu lại.</p>}
      {recoveryNotice && <p role="status" className="mb-4 text-xs text-warn">Không đọc được cài đặt cũ. Đang hiển thị mặc định; chỉ thay bản đã lưu khi bạn bấm Lưu lựa chọn.</p>}
      <ol aria-label="Các bước xử lý" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PIPELINE_STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2.5 text-xs">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[10px] ring-1 ring-line">{index + 1}</span>
            <span className="font-semibold">{STEPS[step].short}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        {PIPELINE_STEPS.map((step, index) => {
          const meta = STEPS[step];
          const Icon = meta.icon;
          const preference = draft[step];
          const validationError = showErrors ? preferenceError(preference) : null;
          return (
            <fieldset key={step} className="min-w-0 rounded-xl border border-line bg-white p-5">
              <legend className="sr-only">Bước {index + 1}: {meta.title}</legend>
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-bg text-accent"><Icon size={18} aria-hidden /></span>
                <div>
                  <p className="text-[10px] font-semibold text-muted">BƯỚC {index + 1} · {step === "stt" ? "STT" : "LLM"}</p>
                  <h2 className="mt-0.5 text-xl">{meta.title}</h2>
                  <p className="mt-1 text-[11px] leading-5 text-muted">{meta.description}</p>
                </div>
              </div>
              <label htmlFor={`${step}-provider`} className="block text-xs font-semibold">Provider</label>
              <select id={`${step}-provider`} value={preference.provider} onChange={(event) => {
                const provider = event.target.value as ModelProvider;
                change(step, { provider, baseUrl: providerApiUrl(provider), model: "", customProvider: "" });
                changeKey(step, "");
              }} className={FIELD_CLASS}>
                {availableProviders(step).map((provider) => <option key={provider} value={provider}>{PROVIDER_LABELS[provider]}</option>)}
              </select>
              {preference.provider === "custom" && (
                <div className="mt-3">
                  <label htmlFor={`${step}-custom-provider`} className="block text-xs font-semibold">Tên provider <span className="text-danger">*</span></label>
                  <input id={`${step}-custom-provider`} value={preference.customProvider} onChange={(event) => change(step, { customProvider: event.target.value })} maxLength={200} autoComplete="off" placeholder="Nhập tên nhà cung cấp" aria-required aria-invalid={Boolean(validationError && !preference.customProvider.trim())} aria-describedby={validationError ? `${step}-error` : undefined} className={FIELD_CLASS} />
                </div>
              )}
              <div className="mt-3">
                <label htmlFor={`${step}-model`} className="block text-xs font-semibold">Mã model <span className="font-normal text-faint">· tùy chọn</span></label>
                <button type="button" onClick={() => loadModels(step)} disabled={catalogs[step]?.loading} className="mt-2 text-xs font-semibold text-accent disabled:opacity-50">{catalogs[step]?.loading ? "Đang tải…" : "Lấy danh sách model"}</button>
                {Boolean(catalogs[step]?.models.length) && <select aria-label={`Chọn model ${STEPS[step].short}`} value={catalogs[step]?.models.includes(preference.model) ? preference.model : ""} onChange={(event) => change(step, {model: event.target.value})} className={FIELD_CLASS}>
                  <option value="">Chọn model ({catalogs[step]?.models.length})</option>
                  {catalogs[step]?.models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>}
                {catalogs[step] && <p role="status" className="mt-1 text-[10px] text-muted">{catalogs[step]?.message}</p>}
                <input id={`${step}-model`} value={preference.model} onChange={(event) => change(step, { model: event.target.value })} maxLength={200} autoComplete="off" placeholder={step === "stt" && preference.provider === "9router" ? "groq/whisper-large-v3" : step === "stt" && preference.provider === "groq" ? "whisper-large-v3" : preference.provider === "blaze" ? "Ví dụ: stt-async-1.5" : "Nhập mã model do provider cung cấp"} aria-describedby={`${step}-model-hint`} className={FIELD_CLASS} />
                <p id={`${step}-model-hint`} className="mt-1.5 text-[10px] leading-5 text-muted">Để trống để kế thừa model mặc định của máy chủ.</p>
              </div>
              <div className="mt-3">
                <label htmlFor={`${step}-base-url`} className="mt-2 block text-xs">URL API <span className="text-faint">· tùy chọn</span></label>
                <input id={`${step}-base-url`} type="url" value={preference.baseUrl} onChange={(event) => change(step, { baseUrl: event.target.value })} maxLength={500} autoComplete="off" spellCheck={false} placeholder="https://provider.example/v1" aria-invalid={Boolean(validationError && preference.baseUrl.trim())} aria-describedby={validationError ? `${step}-error` : `${step}-url-hint`} className={FIELD_CLASS} />
                <p id={`${step}-url-hint`} className="mt-1.5 text-[10px] leading-5 text-muted">{step === "stt" && ["9router", "groq"].includes(preference.provider) ? "Nhập URL gốc tới /v1; ứng dụng tự thêm /audio/transcriptions." : "URL được điền theo provider và có thể chỉnh sửa."} Để trống để dùng URL máy chủ.</p>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-[11px] font-semibold text-muted">API key cho tab này</summary>
                <label htmlFor={`${step}-api-key`} className="mt-2 block text-xs">API key · tùy chọn</label>
                <input id={`${step}-api-key`} type="password" value={keys[step] ?? ""} onChange={(event) => changeKey(step, event.target.value)} autoComplete="new-password" placeholder="Để trống để dùng key máy chủ nếu URL không đổi" className={FIELD_CLASS} />
                <p className="mt-1.5 text-[10px] leading-5 text-muted">Chỉ giữ trong bộ nhớ tab, mất khi tải lại trang. Khi đổi URL, key máy chủ không được gửi sang URL mới.</p>
              </details>
              {validationError && <p id={`${step}-error`} role="alert" className="mt-2 text-xs text-danger">{validationError}</p>}
              <div className="mt-4 border-t border-line pt-3">
                <button type="button" onClick={() => void ping(step)} disabled={pings[step]?.status === "loading"} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold hover:bg-subtle disabled:opacity-50">
                  {pings[step]?.status === "loading" ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : <Radio size={14} aria-hidden />}
                  {pings[step]?.status === "loading" ? "Đang ping…" : "Ping model"}
                </button>
                {pings[step] && <p role="status" aria-live="polite" className={`mt-2 break-words text-[11px] leading-5 ${pings[step]?.status === "connected" ? "text-ok" : pings[step]?.status === "error" ? "text-danger" : "text-muted"}`}>{pings[step]?.message}</p>}
              </div>
            </fieldset>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-5 border-t border-line bg-white/95 py-4 backdrop-blur-sm">
        {error && <p role="alert" className="mb-3 text-xs text-danger">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] leading-5 text-muted" role="status" aria-live="polite">
            <p>{dirty ? "Có thay đổi chưa lưu" : saved ? <><Check size={12} className="mr-1 inline" aria-hidden />Đã lưu trên trình duyệt</> : "Đang dùng lựa chọn mặc định"} · {customized}/4 bước tùy chỉnh</p>
            {saved && <p>Lưu lúc {new Date(saved.savedAt).toLocaleString("vi-VN")}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => replaceDraft(defaultModelPreferences(), {})} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs hover:bg-subtle"><Undo2 size={14} aria-hidden />Về mặc định</button>
            <button type="button" disabled={!dirty} onClick={() => replaceDraft(saved?.steps ?? defaultModelPreferences(), savedKeys)} className="h-9 rounded-lg border border-line px-3 text-xs hover:bg-subtle disabled:opacity-40">Hủy thay đổi</button>
            <button type="submit" disabled={!dirty && Boolean(saved) && !recoveryNotice} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-xs font-semibold text-white disabled:opacity-40"><Save size={14} aria-hidden />Lưu lựa chọn</button>
          </div>
        </div>
      </div>
    </form>
  );
}

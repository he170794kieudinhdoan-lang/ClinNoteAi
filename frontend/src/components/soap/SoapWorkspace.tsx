"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import TranscriptChat, { chatLinesFromSoap } from "@/components/TranscriptChat";
import CapEvidencePanel from "@/components/soap/CapEvidencePanel";
import SoapReviewPanel from "@/components/soap/SoapReviewPanel";
import {
  approveSoap,
  exportSoapRevision,
  extractCaps,
  generateSoap,
  getSoapRun,
  saveSoapRevision,
  SoapApiError,
} from "@/lib/soapApi";
import type {
  ApproveSoapRequest,
  ExtractCapsResponse,
  LatestSoapRevision,
  SaveSoapRevisionRequest,
  SoapContent,
  SoapInputFormat,
  SoapItem,
  SoapRevision,
  SoapRunResponse,
  SoapTranscript,
  SoapWarningDecisions,
  SoapWarningValue,
} from "@/types/soap";
import type { SoapNote } from "@/types";
import { SOAP_SECTIONS } from "@/types/soap";

type BusyAction = "extract" | "generate" | "save" | "approve" | "export" | "new-draft" | null;

const EMPTY_SOAP: SoapContent = {
  S: { items: [], missing: true },
  O: { items: [], missing: true },
  A: { items: [], missing: true },
  P: { items: [], missing: true },
};

const DEMO_TEXT = `Bệnh nhân: Tôi bị đau đầu từ sáng nay.\nBác sĩ: Cơn đau bắt đầu từ lúc nào?\nBệnh nhân: Khoảng 8 giờ sáng, tôi chưa uống thuốc.\nBác sĩ: Tôi ghi nhận đau đầu từ sáng nay; nếu đau tăng hoặc xuất hiện dấu hiệu bất thường, hãy liên hệ cơ sở y tế.`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toPlainSoap(soap: SoapContent): SoapNote {
  return {
    subjective: soap.S.items.map((item) => item.text.trim()).filter(Boolean).join("\n"),
    objective: soap.O.items.map((item) => item.text.trim()).filter(Boolean).join("\n"),
    assessment: soap.A.items.map((item) => item.text.trim()).filter(Boolean).join("\n"),
    plan: soap.P.items.map((item) => item.text.trim()).filter(Boolean).join("\n"),
  };
}

function normalizeSoap(value: unknown): SoapContent {
  const input = asRecord(value) ?? {};
  const result: SoapContent = { ...EMPTY_SOAP };
  for (const { key } of SOAP_SECTIONS) {
    const section = asRecord(input[key]);
    const rawItems = Array.isArray(section?.items) ? section.items : [];
    const items: SoapItem[] = rawItems.filter((item): item is SoapItem => Boolean(asRecord(item))).map((item) => {
      const raw = item as unknown as Record<string, unknown>;
      return {
        item_id: typeof raw.item_id === "string" ? raw.item_id : `item-${Math.random().toString(36).slice(2)}`,
        text: typeof raw.text === "string" ? raw.text : "",
        cap_ids: Array.isArray(raw.cap_ids) ? raw.cap_ids.filter((id): id is string => typeof id === "string") : [],
        origin: raw.origin === "reviewer" ? "reviewer" : "ai",
        review_status: raw.review_status === "reviewed" ? "reviewed" : "needs_review",
        source_link_status: raw.source_link_status === "valid" ? "valid" : "invalid",
        support_status: ["supported", "partial", "unsupported", "conflicting"].includes(String(raw.support_status))
          ? (raw.support_status as SoapItem["support_status"])
          : "pending",
        manual_reason: typeof raw.manual_reason === "string" ? raw.manual_reason : null,
      };
    });
    result[key] = { items, missing: items.length === 0 };
  }
  return result;
}

function isRevision(value: LatestSoapRevision): value is SoapRevision {
  return value !== null && typeof value === "object";
}

function latestRevisionOf(run: SoapRunResponse): SoapRevision | null {
  if (isRevision(run.latest_revision)) return run.latest_revision;
  if (typeof run.latest_revision === "number") {
    return run.revisions.find((revision) => revision.revision === run.latest_revision) ?? null;
  }
  return [...run.revisions].sort((a, b) => b.revision - a.revision)[0] ?? null;
}

function warningText(warning: SoapWarningValue) {
  if (typeof warning === "string") return warning;
  return warning.message ?? warning.text ?? warning.warning ?? JSON.stringify(warning);
}

function warningKey(warning: SoapWarningValue) {
  return warningText(warning).trim();
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

interface InputPreview {
  error: string | null;
  turns: number;
  patient: number;
  clinician: number;
  unresolved: number;
  start: number | null;
  end: number | null;
}

function inspectInput(format: SoapInputFormat, content: string): InputPreview {
  const clean = content.trim();
  const empty: InputPreview = { error: null, turns: 0, patient: 0, clinician: 0, unresolved: 0, start: null, end: null };
  if (!clean) return { ...empty, error: "Chọn hoặc nhập dữ liệu trước khi tách nguồn." };
  if (format === "text") {
    const lines = clean.split(/\r?\n/).filter((line) => line.trim());
    const patient = lines.filter((line) => /^(patient|bệnh nhân)\s*:/i.test(line)).length;
    const clinician = lines.filter((line) => /^(doctor|bác sĩ|clinician)\s*:/i.test(line)).length;
    return { ...empty, turns: lines.length, patient, clinician, unresolved: lines.length - patient - clinician };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    return { ...empty, error: "JSON chưa hợp lệ. Hãy kiểm tra nội dung hoặc chọn lại định dạng." };
  }
  const root = asRecord(parsed);
  if (!root) return { ...empty, error: "JSON gốc phải là một object." };
  const turns = format === "qwen_role_result" ? root.segments : root.turns;
  if (!Array.isArray(turns)) {
    return { ...empty, error: format === "qwen_role_result" ? "Không tìm thấy danh sách đoạn hội thoại." : "Không tìm thấy danh sách lượt nói trong JSON." };
  }
  const patient = turns.filter((turn) => asRecord(turn)?.role === "patient" || asRecord(turn)?.speaker === "patient").length;
  const clinician = turns.filter((turn) => ["doctor", "clinician"].includes(String(asRecord(turn)?.role ?? asRecord(turn)?.speaker))).length;
  const timed = turns.flatMap((turn) => {
    const value = asRecord(turn) ?? {};
    const rawStart = format === "qwen_role_result" ? value.start_time : value.start_ms;
    const rawEnd = format === "qwen_role_result" ? value.end_time : value.end_ms;
    if (rawStart == null || rawEnd == null) return [];
    const start = Number(rawStart);
    const end = Number(rawEnd);
    return Number.isFinite(start) && Number.isFinite(end) ? [format === "qwen_role_result" ? [start * 1000, end * 1000] : [start, end]] : [];
  });
  const start = timed.length ? Math.min(...timed.map(([value]) => value)) : null;
  const end = timed.length ? Math.max(...timed.map(([, value]) => value)) : null;
  return { ...empty, turns: turns.length, patient, clinician, unresolved: turns.length - patient - clinician, start, end };
}

function errorMessageFor(error: unknown) {
  if (!(error instanceof Error)) return "Đã có lỗi không xác định.";
  if (error instanceof SoapApiError) {
    if (error.status === 409) return `Dữ liệu đã có revision mới hơn${error.stage ? ` tại bước ${error.stage}` : ""}. Đã tải lại trạng thái mới nhất; hãy kiểm tra và thử lại.`;
    if (error.status === 404) return `Backend trả 404. Kiểm tra SOAP đã được bật và run còn tồn tại. ${error.message}`;
    return `${error.message}${error.stage ? ` · bước ${error.stage}` : ""}${error.code ? ` · mã ${error.code}` : ""}`;
  }
  return error.message;
}

function apiErrorIsDisabled(error: unknown) {
  return error instanceof SoapApiError && (error.code === "SOAP_DISABLED" || error.code === "soap_disabled");
}

function isApproved(revision: SoapRevision | null) {
  return revision?.status === "approved" || revision?.status === "final";
}

function timestampLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString("vi-VN");
}

function revisionStatusLabel(status: string) {
  if (status === "draft") return "nháp";
  if (status === "approved" || status === "final") return "đã duyệt";
  return status;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function allItems(soap: SoapContent) {
  return SOAP_SECTIONS.flatMap(({ key }) => soap[key].items);
}

function isManualItem(item: SoapItem) {
  return item.origin === "reviewer" && item.cap_ids.length === 0;
}

function itemBlocksApproval(item: SoapItem) {
  if (!item.text.trim() || item.review_status !== "reviewed") return true;
  if (isManualItem(item)) return !item.manual_reason?.trim() || item.support_status === "supported";
  return item.support_status !== "supported" || item.source_link_status !== "valid" || item.cap_ids.length === 0;
}

function statsFromTranscript(transcript: SoapTranscript) {
  const turns = transcript.turns ?? [];
  const patient = turns.filter((turn) => turn.speaker === "patient").length;
  const clinician = turns.filter((turn) => turn.speaker === "clinician" || turn.speaker === "doctor").length;
  const timed = turns.filter((turn) => turn.start_ms != null && turn.end_ms != null);
  const start = timed.length ? Math.min(...timed.map((turn) => turn.start_ms as number)) : null;
  const end = timed.length ? Math.max(...timed.map((turn) => turn.end_ms as number)) : null;
  return { turns: turns.length, patient, clinician, unresolved: turns.length - patient - clinician, start, end };
}

export default function SoapWorkspace({ embedded = false, embeddedRunId = null, runSource, onBindRegen, onPlainSoap }: {
  embedded?: boolean;
  embeddedRunId?: string | null;
  runSource?: "consultation" | "test";
  onBindRegen?: (regenerate: (() => Promise<boolean>) | null) => void;
  onPlainSoap?: (soap: SoapNote) => void;
}) {
  const [inputFormat, setInputFormat] = useState<SoapInputFormat>("qwen_role_result");
  const [inputContent, setInputContent] = useState("");
  const [inputFileName, setInputFileName] = useState("");
  const [run, setRun] = useState<SoapRunResponse | null>(null);
  const [soapDraft, setSoapDraft] = useState<SoapContent | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [selectedCapId, setSelectedCapId] = useState<string | null>(null);
  const [selectedCapIds, setSelectedCapIds] = useState<string[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [warningDecisions, setWarningDecisions] = useState<SoapWarningDecisions>({});
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState("");
  const [apiDisabled, setApiDisabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [sourceFocus, setSourceFocus] = useState<string | null>(null);

  const preview = useMemo(() => inspectInput(inputFormat, inputContent), [inputFormat, inputContent]);
  const latestRevision = run ? latestRevisionOf(run) : null;
  const activeRevision = selectedRevision == null ? latestRevision : run?.revisions.find((item) => item.revision === selectedRevision) ?? latestRevision;
  const activeSoap = soapDraft ?? (activeRevision ? normalizeSoap(activeRevision.soap) : null);
  const isHistorical = Boolean(activeRevision && latestRevision && activeRevision.revision !== latestRevision.revision);
  const finalRevision = isApproved(activeRevision);
  const readOnly = !activeRevision || isHistorical || finalRevision;
  const currentRevisionNumber = latestRevision?.revision ?? 0;
  const hasUnsavedSoap = Boolean(activeRevision && activeSoap && JSON.stringify(normalizeSoap(activeRevision.soap)) !== JSON.stringify(normalizeSoap(activeSoap)));
  const hasUnsavedMetadata = Boolean(activeRevision && (
    reviewerName.trim() !== (activeRevision.reviewer_name ?? "").trim() ||
    JSON.stringify(Object.fromEntries(Object.entries(warningDecisions).filter(([, value]) => value.trim()))) !==
      JSON.stringify(activeRevision.warning_decisions ?? {})
  ));
  const hasUnsavedChanges = hasUnsavedSoap || hasUnsavedMetadata;
  const warnings = run?.cap_warnings ?? [];
  const unresolvedWarnings = warnings.filter((warning) => !warningDecisions[warningKey(warning)]?.trim());
  const reviewItems = activeSoap ? allItems(activeSoap) : [];
  const blockedItems = reviewItems.filter(itemBlocksApproval);
  const invalidItemsForSave = reviewItems.filter((item) => !item.text.trim() || (item.cap_ids.length === 0 && !item.manual_reason?.trim()));
  const canSave = hasUnsavedChanges && !readOnly && invalidItemsForSave.length === 0;
  const canApprove = Boolean(
    activeRevision &&
      !finalRevision &&
      !isHistorical &&
      !hasUnsavedSoap &&
      reviewerName.trim() &&
      unresolvedWarnings.length === 0 &&
      blockedItems.length === 0,
  );
  const approveGap = (() => {
    if (!activeRevision || finalRevision || isHistorical || canApprove) return "";
    const manual = blockedItems.filter(isManualItem).length;
    const linked = blockedItems.length - manual;
    const steps = [
      hasUnsavedSoap ? "lưu nội dung đang sửa" : "",
      linked ? `xác nhận ${linked} câu còn gắn nguồn` : "",
      manual ? `xác nhận ${manual} câu bổ sung thủ công` : "",
      unresolvedWarnings.length ? "ghi quyết định cho cảnh báo" : "",
      reviewerName.trim() ? "" : "nhập tên",
    ].filter(Boolean);
    return steps.length ? `Chưa duyệt được: ${steps.join(", ")}.` : "";
  })();
  const extractInputValid = !preview.error && inputContent.trim().length > 0;
  const transcriptStats = run ? statsFromTranscript(run.transcript) : null;

  async function fetchAndSetRun(runId: string) {
    const response = await getSoapRun(runId);
    setRun(response);
    const latest = latestRevisionOf(response);
    setSelectedRevision(latest?.revision ?? null);
    setSoapDraft(latest ? normalizeSoap(latest.soap) : null);
    setReviewerName(latest?.reviewer_name ?? "");
    setWarningDecisions({ ...(latest?.warning_decisions ?? {}) });
    return response;
  }

  useEffect(() => {
    const runId = embedded ? embeddedRunId : new URLSearchParams(window.location.search).get("run");
    if (!runId) return;
    let alive = true;
    getSoapRun(runId)
      .then((response) => {
        if (!alive) return;
        setRun(response);
        const latest = latestRevisionOf(response);
        setSelectedRevision(latest?.revision ?? null);
        setSoapDraft(latest ? normalizeSoap(latest.soap) : null);
        setReviewerName(latest?.reviewer_name ?? "");
        setWarningDecisions({ ...(latest?.warning_decisions ?? {}) });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setApiDisabled(apiErrorIsDisabled(cause));
        setError(errorMessageFor(cause));
      });
    return () => { alive = false; };
  }, [embedded, embeddedRunId]);

  function writeRunToUrl(runId: string) {
    if (embedded) return;
    const url = new URL(window.location.href);
    url.searchParams.set("run", runId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setInputFileName(file.name);
    setInputFormat("qwen_role_result");
    void file.text().then((content) => setInputContent(content)).catch(() => setError("Không đọc được file JSON đã chọn."));
    event.target.value = "";
  }

  function selectFormat(format: SoapInputFormat) {
    setInputFormat(format);
    setInputFileName("");
  }

  async function handleExtract() {
    if (!extractInputValid) return;
    setBusy("extract");
    setError("");
    setNotice("");
    setApiDisabled(false);
    try {
      const response: ExtractCapsResponse = await extractCaps({ input_format: inputFormat, content: inputContent });
      const initialRun: SoapRunResponse = { ...response, caps_complete: true, latest_revision: null, revisions: [] };
      setRun(initialRun);
      setSoapDraft(null);
      setSelectedRevision(null);
      setSelectedCapIds([]);
      setSelectedCapId(null);
      setWarningDecisions({});
      setReviewerName("");
      writeRunToUrl(response.run_id);
      setNotice("Đã lưu snapshot transcript và CAP. Kiểm tra nguồn rồi mới tạo SOAP.");
    } catch (cause) {
      setApiDisabled(apiErrorIsDisabled(cause) || (cause instanceof SoapApiError && cause.status === 404));
      setError(errorMessageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    if (!run || hasUnsavedChanges || isHistorical) return false;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      await generateSoap(run.run_id, currentRevisionNumber);
      await fetchAndSetRun(run.run_id);
      return true;
    } catch (cause) {
      setError(errorMessageFor(cause));
      if (cause instanceof SoapApiError && cause.status === 409) {
        try { await fetchAndSetRun(run.run_id); } catch { /* Keep the original conflict visible. */ }
      }
      return false;
    } finally {
      setBusy(null);
    }
  }

  const generateRef = useRef(handleGenerate);
  generateRef.current = handleGenerate;
  useEffect(() => {
    onBindRegen?.(() => generateRef.current());
    return () => onBindRegen?.(null);
  }, [onBindRegen]);

  useEffect(() => {
    if (activeSoap) onPlainSoap?.(toPlainSoap(activeSoap));
  }, [activeSoap, onPlainSoap]);

  async function handleSave() {
    if (!run || !activeSoap || !hasUnsavedChanges || readOnly) return;
    setBusy("save");
    setError("");
    setNotice("");
    const input: SaveSoapRevisionRequest = {
      expected_revision: currentRevisionNumber,
      soap: normalizeSoap(activeSoap),
      ...(reviewerName.trim() ? { reviewer_name: reviewerName.trim() } : {}),
      warning_decisions: Object.fromEntries(Object.entries(warningDecisions).filter(([, value]) => value.trim())),
    };
    try {
      await saveSoapRevision(run.run_id, input);
      await fetchAndSetRun(run.run_id);
      setNotice("Đã lưu thành bản mới.");
    } catch (cause) {
      setError(errorMessageFor(cause));
      if (cause instanceof SoapApiError && cause.status === 409) {
        try { await fetchAndSetRun(run.run_id); } catch { /* Keep the original conflict visible. */ }
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleStartDraft() {
    if (!run || !activeRevision || !finalRevision) return;
    setBusy("new-draft");
    setError("");
    setNotice("");
    try {
      await saveSoapRevision(run.run_id, {
        expected_revision: currentRevisionNumber,
        soap: normalizeSoap(activeRevision.soap),
        ...(reviewerName.trim() ? { reviewer_name: reviewerName.trim() } : {}),
        warning_decisions: Object.fromEntries(Object.entries(warningDecisions).filter(([, value]) => value.trim())),
      });
      await fetchAndSetRun(run.run_id);
      setNotice("Đã tạo bản nháp mới từ bản đã duyệt. Bản cũ vẫn được giữ nguyên.");
    } catch (cause) {
      setError(errorMessageFor(cause));
      if (cause instanceof SoapApiError && cause.status === 409) {
        try { await fetchAndSetRun(run.run_id); } catch { /* Keep the original conflict visible. */ }
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (!run || !canApprove) return;
    setBusy("approve");
    setError("");
    setNotice("");
    const input: ApproveSoapRequest = {
      expected_revision: currentRevisionNumber,
      reviewer_name: reviewerName.trim(),
      warning_decisions: Object.fromEntries(Object.entries(warningDecisions).filter(([, value]) => value.trim())),
    };
    try {
      await approveSoap(run.run_id, input);
      await fetchAndSetRun(run.run_id);
      setNotice("Đã duyệt. Bản này chỉ đọc; muốn sửa tiếp hãy tạo bản nháp mới.");
    } catch (cause) {
      setError(errorMessageFor(cause));
      if (cause instanceof SoapApiError && cause.status === 409) {
        try { await fetchAndSetRun(run.run_id); } catch { /* Keep the original conflict visible. */ }
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    if (!run || !activeRevision) return;
    setBusy("export");
    setError("");
    try {
      const blob = await exportSoapRevision(run.run_id, activeRevision.revision);
      downloadBlob(blob, `soap-${run.run_id}-r${activeRevision.revision}.json`);
      setNotice(`Đã tải dữ liệu bản ${activeRevision.revision}.`);
    } catch (cause) {
      setError(errorMessageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  function setWarningDecision(warning: SoapWarningValue, value: string) {
    const key = warningKey(warning);
    setWarningDecisions((current) => ({ ...current, [key]: value }));
  }

  function selectRevision(revision: SoapRevision) {
    setSelectedRevision(revision.revision);
    setSoapDraft(normalizeSoap(revision.soap));
    setReviewerName(revision.reviewer_name ?? "");
    setWarningDecisions({ ...(revision.warning_decisions ?? {}) });
  }

  function selectEvidence(item: SoapItem) {
    const capIds = item.cap_ids.filter((id) => run?.caps.some((cap) => cap.prop_id === id));
    setSelectedCapIds(capIds);
    setSelectedCapId(capIds[0] ?? null);
    if (!embedded && capIds.length > 0) document.getElementById("soap-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectCap(capId: string) {
    setSelectedCapId(capId);
    setSelectedCapIds([capId]);
  }

  function changeSoap(soap: SoapContent) {
    setSoapDraft(normalizeSoap(soap));
  }

  const currentInputSummary = preview.error ?? `${preview.turns} lượt · ${preview.patient} người bệnh · ${preview.clinician} bác sĩ · ${preview.unresolved} vai chưa rõ`;
  const inputTimeRange = preview.start != null && preview.end != null
    ? `${formatDuration(preview.start)}–${formatDuration(preview.end)}`
    : null;

  return (
    <main className={embedded ? "w-full text-ink" : "min-h-dvh bg-[#f8f3eb]/90 px-3 py-4 text-ink sm:px-6 sm:py-6"}>
      <div className={embedded ? "flex w-full min-w-0 flex-col gap-4" : "mx-auto flex w-full max-w-[1500px] flex-col gap-4"}>
        {!embedded && <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#efe3d0] text-lg font-bold">S</span>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] text-faint">CLINNOTE · BẢN THỬ</p>
              <h1 className="font-serif text-xl font-bold">SOAP qua CAP</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {run && <span className="max-w-64 truncate rounded-lg border border-line bg-white px-3 py-2 font-mono text-[10px] text-muted">phiên {run.run_id}</span>}
            <Link href="/" className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle">Trang chủ</Link>
          </div>
        </header>}

        {!embedded && <section className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-faint">BƯỚC 1 · HỘI THOẠI</p>
              <h2 className="mt-1 font-serif text-lg font-bold">Nhập hội thoại đã phân vai</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">
                Tải file JSON đã phân vai, hoặc dán hội thoại theo từng dòng. Tệp chỉ được gửi trong lần này; đường dẫn âm thanh trong JSON không được mở.
              </p>
            </div>
            <button type="button" onClick={() => { selectFormat("text"); setInputContent(DEMO_TEXT); setInputFileName(""); setError(""); }} className="h-9 rounded-lg border border-dashed border-[#bca887] bg-[#fffaf0] px-3 text-xs font-semibold text-muted hover:bg-[#f7eccd]">
              Dùng mẫu giả lập
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ["qwen_role_result", "JSON Qwen"],
              ["canonical", "JSON chuẩn"],
              ["text", "Hội thoại chữ"],
            ] as const).map(([format, label]) => (
              <button key={format} type="button" onClick={() => selectFormat(format)} aria-pressed={inputFormat === format} className={`h-8 rounded-lg px-3 text-xs ${inputFormat === format ? "bg-subtle font-semibold text-ink" : "border border-line bg-white text-muted hover:bg-subtle"}`}>
                {label}
              </button>
            ))}
            <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-line bg-white px-3 text-xs font-medium hover:bg-subtle">
              Tải file JSON
              <input type="file" accept=".json,application/json" className="sr-only" onChange={handleFile} />
            </label>
          </div>

          {inputFileName && <p className="mt-2 text-[11px] text-muted">Tệp đã chọn: <span className="font-semibold">{inputFileName}</span></p>}
          <textarea
            value={inputContent}
            onChange={(event) => { setInputContent(event.target.value); setInputFileName(""); }}
            aria-label="Hội thoại hoặc JSON đầu vào"
            placeholder={inputFormat === "text" ? "Bệnh nhân: ...\nBác sĩ: ..." : '{ "segments": [...] }'}
            rows={5}
            className="mt-3 w-full resize-y rounded-xl border border-[#e4d8c8] bg-white px-3 py-2.5 font-mono text-xs leading-5 outline-none focus:border-ink"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div aria-live="polite" className={`text-xs ${preview.error ? "text-[#a14e3b]" : "text-muted"}`}>
              {currentInputSummary}{inputTimeRange ? ` · thời gian ${inputTimeRange}` : " · chưa có khoảng thời gian"}
            </div>
            <button type="button" onClick={handleExtract} disabled={!extractInputValid || busy !== null} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white shadow-sm transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50">
              {busy === "extract" && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#72563d] border-t-transparent" />}
              {busy === "extract" ? "Đang tách nguồn…" : "Lưu hội thoại và tách nguồn"}
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-faint">Số lượt và vai là bản xem trước cấu trúc. Độ tin cậy phân vai không phải độ tin cậy của SOAP.</p>
        </section>}

        {apiDisabled && <div role="status" className="rounded-xl border border-[#d7b68e] bg-[#fff4df] px-4 py-3 text-sm text-muted">API SOAP chưa được bật trên backend. Bật `SOAP_ENABLED` trong cấu hình development/test rồi tải lại.</div>}
        {error && <div role="alert" className="rounded-xl border border-[#e3b8aa] bg-[#fff2ed] px-4 py-3 text-sm text-[#8b4233]">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-[#c9dec9] bg-[#eff8ee] px-4 py-3 text-sm text-[#3f6848]">{notice}</div>}
        {embedded && !run && !error && <div role="status" className="rounded-xl border border-line bg-white p-4 text-sm">Đang tải bản SOAP đã lưu…</div>}
        {run?.caps_complete === false && <div role="status" className="rounded-xl border border-[#ead29f] bg-[#fff9e8] px-4 py-3 text-sm text-muted">Hội thoại đã lưu nhưng chưa tách xong nguồn. Kiểm tra lỗi lần chạy và nhập lại hội thoại để tạo bản mới.</div>}
        {run && transcriptStats && (
          <>
            {!embedded && (
            <section className="rounded-2xl border border-line bg-white px-4 py-3 shadow-sm sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-faint">SOAP CÓ DẪN NGUỒN{runSource === "test" ? " · JSON THỬ" : ""}</p>
                  <h2 className="mt-1 text-sm font-bold">Bản SOAP · {transcriptStats.turns} lượt thoại · {transcriptStats.patient} người bệnh · {transcriptStats.clinician} bác sĩ</h2>
                  <p className="mt-1 text-xs text-muted">{transcriptStats.unresolved} lượt chưa rõ vai · {transcriptStats.start != null && transcriptStats.end != null ? `${formatDuration(transcriptStats.start)}–${formatDuration(transcriptStats.end)}` : "không có mốc giờ"} · {run.caps.length} CAP</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-lg border border-line bg-white px-3 py-2 font-mono text-[10px] text-muted">{run.run_id}</span>
                  <button type="button" onClick={handleGenerate} disabled={busy !== null || run.caps_complete === false || hasUnsavedChanges || isHistorical} className="h-9 rounded-lg bg-ink px-3.5 text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-45">
                    {busy === "generate" ? "Đang tạo…" : latestRevision ? "Tạo lại SOAP" : "Tạo SOAP từ nguồn đã lưu"}
                  </button>
                </div>
              </div>
              {hasUnsavedChanges && <p className="mt-2 text-[11px] text-[#99623b]">Có thay đổi chưa lưu. Lưu bản hiện tại trước khi tạo lại SOAP.</p>}
            </section>
            )}

            {activeRevision && activeSoap && (
              <>
                {isHistorical && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9cbb9] bg-subtle px-4 py-3 text-xs">
                    <span>Đang xem bản {activeRevision.revision}; bản cũ chỉ đọc. Chỉ sửa được trên bản mới nhất.</span>
                    <button type="button" onClick={() => latestRevision && selectRevision(latestRevision)} className="h-8 rounded-lg bg-white px-3 font-semibold">Mở bản mới nhất</button>
                  </div>
                )}
                <div className={embedded ? "flex flex-col gap-3" : "grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]"}>
                  <SoapReviewPanel
                    soap={activeSoap}
                    caps={run.caps}
                    transcript={run.transcript}
                    readOnly={readOnly}
                    revisionNumber={activeRevision.revision}
                    revisionStatus={activeRevision.status}
                    onSoap={changeSoap}
                    onSelectEvidence={selectEvidence}
                    onViewSource={setSourceFocus}
                  />
                  {embedded ? (
                    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          id="soap-reviewer-name"
                          value={reviewerName}
                          onChange={(event) => setReviewerName(event.target.value)}
                          readOnly={readOnly}
                          aria-label="Tên bác sĩ"
                          placeholder="Tên bác sĩ"
                          className="h-8 min-w-36 flex-1 rounded-lg border border-line px-2.5 text-xs outline-none focus:border-ink read-only:bg-subtle"
                        />
                        {activeRevision.status !== "approved" && activeRevision.status !== "final" && !isHistorical && (
                          <>
                            <button type="button" onClick={handleSave} disabled={!canSave || busy !== null} className="h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle disabled:opacity-45">
                              {busy === "save" ? "Đang lưu…" : "Lưu"}
                            </button>
                            <button type="button" onClick={handleApprove} disabled={!canApprove || busy !== null} className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-45">
                              {busy === "approve" ? "Đang duyệt…" : "Duyệt"}
                            </button>
                          </>
                        )}
                        {finalRevision && !isHistorical && (
                          <button type="button" onClick={handleStartDraft} disabled={busy !== null} className="h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle disabled:opacity-45">
                            {busy === "new-draft" ? "Đang tạo…" : "Sửa tiếp"}
                          </button>
                        )}
                      </div>
                      {hasUnsavedChanges && invalidItemsForSave.length > 0 && (
                        <p className="text-[11px] text-[#99623b]">Điền nội dung và lý do cho câu thêm tay trước khi lưu.</p>
                      )}
                      {approveGap && !(hasUnsavedChanges && invalidItemsForSave.length > 0) && (
                        <p className="text-[11px] text-muted">{approveGap}</p>
                      )}
                      <details className="text-[11px] text-muted">
                        <summary className="cursor-pointer font-semibold text-ink">Bản {activeRevision.revision} · {revisionStatusLabel(activeRevision.status)}</summary>
                        <ul className="mt-2 space-y-1">
                          {[...run.revisions].sort((a, b) => b.revision - a.revision).map((revision) => (
                            <li key={revision.revision}>
                              <button type="button" onClick={() => selectRevision(revision)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left ${revision.revision === activeRevision.revision ? "bg-subtle font-semibold text-ink" : "hover:bg-subtle"}`}>
                                <span>Bản {revision.revision}</span>
                                <span>{revisionStatusLabel(revision.status)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button type="button" onClick={handleExport} disabled={busy !== null} className="mt-2 h-8 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-45">
                          {busy === "export" ? "Đang tải…" : "Tải JSON"}
                        </button>
                      </details>
                    </div>
                  ) : (
                  <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
                    <div>
                      <p className="text-[10px] font-semibold tracking-[0.14em] text-faint">BÁC SĨ</p>
                      <label className="mt-2 block text-xs font-semibold" htmlFor="soap-reviewer-name">Tên bác sĩ</label>
                      <input id="soap-reviewer-name" value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} readOnly={readOnly} placeholder="Tên tự khai" className="mt-1.5 h-9 w-full rounded-lg border border-line px-3 text-xs outline-none focus:border-ink read-only:bg-subtle" />
                      <p className="mt-1.5 text-[10px] leading-4 text-faint">Tên tự khai để ghi lịch sử duyệt; đây không phải chữ ký điện tử hay xác thực danh tính.</p>
                    </div>

                    <div className="rounded-xl bg-[#f8f3eb] p-3 text-xs">
                      <p className="font-semibold">Bản {activeRevision.revision}</p>
                      <p className="mt-1 text-muted">Trạng thái: {revisionStatusLabel(activeRevision.status)}</p>
                      {activeRevision.parent_revision != null && <p className="mt-1 text-muted">Bản cha: {activeRevision.parent_revision}</p>}
                      {activeRevision.created_at && <p className="mt-1 text-muted">Tạo lúc: {timestampLabel(activeRevision.created_at)}</p>}
                      {activeRevision.approved_at && <p className="mt-1 text-muted">Duyệt lúc: {timestampLabel(activeRevision.approved_at)}</p>}
                    </div>

                    <div className="space-y-2">
                      {activeRevision.status !== "approved" && activeRevision.status !== "final" && !isHistorical && (
                        <>
                          <button type="button" onClick={handleSave} disabled={!canSave || busy !== null} className="h-10 w-full rounded-lg bg-ink px-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-45">
                            {busy === "save" ? "Đang lưu…" : "Lưu thành bản mới"}
                          </button>
                          {hasUnsavedChanges && invalidItemsForSave.length > 0 && <p className="text-[10px] leading-4 text-[#99623b]">Mỗi câu cần có nội dung; câu không gắn CAP cần có lý do bổ sung thủ công trước khi lưu.</p>}
                          <button type="button" onClick={handleApprove} disabled={!canApprove || busy !== null} className="h-10 w-full rounded-lg bg-ink px-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-45">
                            {busy === "approve" ? "Đang duyệt…" : "Duyệt bản hiện tại"}
                          </button>
                          {approveGap && <p className="text-[10px] leading-4 text-[#99623b]">{approveGap}</p>}
                        </>
                      )}
                      {finalRevision && !isHistorical && (
                        <button type="button" onClick={handleStartDraft} disabled={busy !== null} className="h-10 w-full rounded-lg border border-[#d8c7ac] bg-white px-3 text-xs font-bold hover:bg-subtle disabled:opacity-50">
                          {busy === "new-draft" ? "Đang tạo…" : "Tạo bản nháp mới để sửa"}
                        </button>
                      )}
                      <button type="button" onClick={handleExport} disabled={busy !== null} className="h-10 w-full rounded-lg border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle disabled:opacity-50">
                        {busy === "export" ? "Đang tải…" : `Tải JSON bản ${activeRevision.revision}`}
                      </button>
                    </div>

                    <div className="border-t border-[#f0e7dc] pt-3">
                      <p className="mb-2 text-xs font-semibold">Lịch sử bản</p>
                      <ul className="space-y-1.5">
                        {[...run.revisions].sort((a, b) => b.revision - a.revision).map((revision) => (
                          <li key={revision.revision}>
                            <button type="button" onClick={() => selectRevision(revision)} className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] ${revision.revision === activeRevision.revision ? "bg-[#f1e5d2] font-semibold" : "hover:bg-[#f8f3eb]"}`}>
                              <span>Bản {revision.revision}</span><span className="text-muted">{revisionStatusLabel(revision.status)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                  )}
                </div>
              </>
            )}

            {!latestRevision && (
              <div className="rounded-2xl border border-line bg-white px-4 py-5 text-sm text-muted shadow-sm">
                <p>Nguồn đã lưu. Tạo SOAP để bắt đầu bản nháp.</p>
                {embedded && (
                  <button type="button" onClick={handleGenerate} disabled={busy !== null || run.caps_complete === false} className="mt-3 h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-45">
                    {busy === "generate" ? "Đang tạo…" : "Tạo SOAP"}
                  </button>
                )}
              </div>
            )}

            {warnings.length > 0 && (
              <section className="rounded-2xl border border-[#ead29f] bg-[#fff9e8] p-4 shadow-sm sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {!embedded && <p className="text-[10px] font-semibold tracking-[0.14em] text-[#9b7645]">CẢNH BÁO TỪ CAP</p>}
                    <h2 className={`text-sm font-bold ${embedded ? "" : "mt-1"}`}>Cảnh báo cần ghi quyết định trước khi duyệt</h2>
                  </div>
                  <span className="rounded-full border border-[#ead29f] bg-white px-2.5 py-1 text-[10px] text-muted">{unresolvedWarnings.length} chưa xử lý</span>
                </div>
                <div className="mt-3 space-y-2">
                  {warnings.map((warning, index) => {
                    const key = warningKey(warning);
                    return (
                      <label key={`${key}-${index}`} className="block rounded-xl border border-[#efdfbb] bg-white p-3 text-xs">
                        <span className="block font-medium leading-5">{key}</span>
                        <input value={warningDecisions[key] ?? ""} onChange={(event) => setWarningDecision(warning, event.target.value)} disabled={readOnly} placeholder="Ghi quyết định, ví dụ giữ trạng thái chưa chắc chắn…" className="mt-2 h-9 w-full rounded-lg border border-line px-3 text-xs outline-none focus:border-ink disabled:bg-subtle" />
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {!embedded && <div id="soap-evidence"><CapEvidencePanel transcript={run.transcript} caps={run.caps} selectedCapId={selectedCapId} selectedCapIds={selectedCapIds} onSelectCap={selectCap} /></div>}

          </>
        )}

        {!embedded && <footer className="px-2 pb-2 text-[10px] leading-4 text-faint">
          Bản nháp cần bác sĩ xem lại. Liên kết nguồn được kiểm tra theo mã; điều đó không tự chứng minh câu SOAP đúng với lời trong hội thoại. Màn hình này dùng dữ liệu giả lập hoặc hội thoại người dùng tải lên.
        </footer>}
        {sourceFocus && run && (
          <TranscriptChat
            lines={chatLinesFromSoap(run.transcript)}
            focusId={sourceFocus}
            onClose={() => setSourceFocus(null)}
          />
        )}
      </div>
    </main>
  );
}

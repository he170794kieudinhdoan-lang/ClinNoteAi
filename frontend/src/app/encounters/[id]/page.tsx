"use client";

/**
 * Clinical Editor — màn sau khi thêm bệnh nhân.
 * empty: chưa có audio. Có file: bản ghi + SOAP + ICD-10.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, FileDown, PanelLeft, PanelRight, Printer, RefreshCw } from "lucide-react";
import { memo, use, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { toast } from "sonner";
import AudioRecorder from "@/components/AudioRecorder";
import FirstVisitGuide, { FIRST_VISIT_GUIDE_HIDE, firstVisitGuideKey } from "@/components/FirstVisitGuide";
import ClinicShell from "@/components/ClinicShell";
import FinalNote from "@/components/FinalNote";
import IcdSuggestBar from "@/components/IcdSuggestBar";
import { EncounterPageSkeleton, SoapSkeleton } from "@/components/Skeletons";
import SoapEditor from "@/components/SoapEditor";
import TranscriptPanel from "@/components/TranscriptPanel";
import SoapWorkspace from "@/components/soap/SoapWorkspace";
import { removeEncounter, saveEncounter, useEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { cn } from "@/lib/cn";
import { draftFromTranscript, suggestIcd } from "@/lib/draftNote";
import {
  createConsultation,
  dedupeTranscriptLines,
  getConsultationTranscript,
  mapSegmentToTranscriptLine,
  uploadConsultationAudio,
} from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { extractCaps, fetchConsultationIcd, generateSoap, patchIcdSuggestion, saveConsultationIcd, suggestIcdRemote } from "@/lib/soapApi";
import { soapTranscriptFromConsultation } from "@/lib/soapTranscript";
import type { Encounter, IcdSuggestion, Patient, SoapNote } from "@/types";
import { SOAP_SECTIONS, type SoapInputFormat } from "@/types/soap";

const EMPTY_SOAP = { subjective: "", objective: "", assessment: "", plan: "" };

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function mergeSuggestions(base: IcdSuggestion[], incoming: IcdSuggestion[]): IcdSuggestion[] {
  const byCode = new Map<string, IcdSuggestion>();
  for (const item of base) byCode.set(item.code, item);
  for (const item of incoming) {
    const previous = byCode.get(item.code);
    byCode.set(item.code, previous ? { ...previous, ...item, id: item.id ?? previous.id } : item);
  }
  return Array.from(byCode.values());
}

function dobLine(patient: Patient) {
  if (patient.dob) return `${patient.dob} · ${patient.age} tuổi`;
  if (patient.age > 0) return `${patient.age} tuổi`;
  return "—";
}

function withoutAudio(current: Encounter): Encounter {
  return {
    ...current,
    status: "empty",
    audioFileName: undefined,
    transcript: [],
    soap: { ...EMPTY_SOAP },
    icdSuggestions: [],
    selectedIcd: undefined,
    missingFields: ["Audio / transcript"],
    soapRunOutdated: Boolean(current.soapRunId),
  };
}

export default function ClinicalEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const authed = useRequireAuth();
  const { encounter, ready } = useEncounter(id);
  const [draft, setDraft] = useState<Encounter | null>(null);
  const [tab, setTab] = useState<"upload" | "record" | "test">("upload");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [soapBusy, setSoapBusy] = useState(false);
  const [soapError, setSoapError] = useState("");
  const [jsonBusy, setJsonBusy] = useState(false);
  const [showLegacyFinal, setShowLegacyFinal] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const transcriptPanel = useRef<ImperativePanelHandle>(null);
  const filesPanel = useRef<ImperativePanelHandle>(null);
  const groundedRegen = useRef<(() => Promise<boolean>) | null>(null);
  const groundedSoap = useRef<SoapNote | null>(null);
  const [previewSoap, setPreviewSoap] = useState<SoapNote | null>(null);
  const [printing, setPrinting] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [guideOn, setGuideOn] = useState(false);
  const [mobileTab, setMobileTab] = useState<"soap" | "transcript" | "files">("soap");
  const bindRegen = useCallback((regenerate: (() => Promise<boolean>) | null) => {
    groundedRegen.current = regenerate;
  }, []);

  /** Merge LLM suggestions (verified against icd.kcb.vn) into the draft. */
  function receiveRemoteIcdSuggestions(items: IcdSuggestion[]) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, icdSuggestions: mergeSuggestions(current.icdSuggestions, items) };
    });
  }

  function requestRemoteIcdSuggestions(runId: string) {
    void suggestIcdRemote(runId)
      .then((response) => {
        const items: IcdSuggestion[] = response.suggestions.map((entry) => ({
          code: entry.code,
          title: entry.title || entry.code,
          confidence: entry.confidence,
          rationale: entry.rationale,
          capIds: entry.cap_ids,
          verified: entry.verified,
        }));
        if (items.length) receiveRemoteIcdSuggestions(items);
      })
      .catch(() => undefined); // fallback stays on the regex/mock suggestions
  }

  function handleSelectIcd(code: string) {
    const current = draftRef.current;
    const target = current?.icdSuggestions.find((item) => item.code === code);
    setDraft((value) => {
      if (!value || !target) return value ? { ...value, selectedIcd: code } : value;
      return {
        ...value,
        selectedIcd: code,
        icdSuggestions: mergeSuggestions(value.icdSuggestions, [{ ...target, status: "ACCEPTED" }]),
      };
    });
    if (target?.id) void patchIcdSuggestion(target.id, "ACCEPTED").catch(() => undefined);
  }
  const rememberSoap = useCallback((soap: SoapNote) => {
    groundedSoap.current = soap;
    setPreviewSoap(soap);
  }, []);
  const audioUrlRef = useRef<string | null>(null);
  const seen = useRef<string | null>(null);
  const leaveRef = useRef(false);
  const draftRef = useRef(draft);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    // Suggestions that were saved/accepted previously hydrate the draft on load.
    const consultationId = encounter?.consultationId;
    if (!consultationId || !isUUID(consultationId)) return;
    let alive = true;
    fetchConsultationIcd(consultationId)
      .then((response) => {
        if (!alive) return;
        const incoming: IcdSuggestion[] = response.items
          .filter((item) => item.status !== "REJECTED")
          .map((item) => ({
            code: item.icd_code,
            title: item.description,
            confidence: item.confidence ?? undefined,
            id: item.id,
            status: item.status,
          }));
        if (!incoming.length) return;
        setDraft((current) => {
          if (!current) return current;
          const icdSuggestions = mergeSuggestions(current.icdSuggestions, incoming);
          return { ...current, icdSuggestions, selectedIcd: current.selectedIcd ?? icdSuggestions[0]?.code };
        });
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [encounter?.consultationId]);

  useEffect(() => {
    if (localStorage.getItem(FIRST_VISIT_GUIDE_HIDE) === "1") return;
    if (sessionStorage.getItem(firstVisitGuideKey(id)) === "1") setGuideOn(true);
  }, [id]);

  useEffect(() => {
    if (!guideOn) return;
    transcriptPanel.current?.expand();
    filesPanel.current?.expand();
  }, [guideOn, draft]);

  useEffect(() => {
    if (!encounter || encounter.id !== id || loadedId.current === id) return;
    loadedId.current = id;
    seen.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setTab("upload");
    setDraft(encounter);
  }, [encounter, id]);

  // Fetch backend transcript if encounter has a valid backend consultationId
  useEffect(() => {
    const consultationId = draft?.consultationId;
    if (!consultationId) return;

    let active = true;
    setTranscriptLoading(true);
    getConsultationTranscript(consultationId)
      .then((res) => {
        if (!active || !res.segments || res.segments.length === 0) return;
        const lines = dedupeTranscriptLines(res.segments.map(mapSegmentToTranscriptLine));
        setDraft((current) => {
          if (!current) return current;
          return {
            ...current,
            status: current.status === "empty" ? "soap" : current.status,
            transcript: lines,
            missingFields: current.missingFields.filter((f) => f !== "Audio / transcript"),
          };
        });
      })
      .catch(() => {
        // Silently skip if consultation not found on backend DB
      })
      .finally(() => {
        if (active) setTranscriptLoading(false);
      });

    return () => {
      active = false;
    };
  }, [draft?.consultationId]);

  useEffect(() => {
    if (!draft || leaveRef.current) return;
    if (seen.current === null) {
      seen.current = JSON.stringify(draft);
      return;
    }
    const timer = window.setTimeout(() => {
      const current = draftRef.current;
      if (!current || leaveRef.current) return;
      const serial = JSON.stringify(current);
      if (seen.current === serial) return;
      seen.current = serial;
      saveEncounter(current);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft]);

  useEffect(
    () => () => {
      const current = draftRef.current;
      if (!current || leaveRef.current) return;
      const serial = JSON.stringify(current);
      if (seen.current === serial) return;
      saveEncounter(current);
    },
    [],
  );

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  const takeFile = useCallback(async (file: File) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    setAudioUrl(url);
    setTab("upload");

    setIsUploading(true);
    setUploadError("");

    try {
      const currentDraft = draftRef.current;
      let targetConsultationId = currentDraft?.consultationId;

      // Nếu chưa có consultation_id, kiểm tra patient_id và doctor_id để tạo consultation mới trên backend
      if (!targetConsultationId) {
        const patientId = currentDraft?.patientId || currentDraft?.patient?.id;
        let doctorId = currentDraft?.doctorId;

        // Fallback lấy doctor_id từ Supabase Auth session nếu chưa lưu trên draft
        if (!doctorId) {
          const supabase = getSupabase();
          if (supabase) {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData.session?.user?.id) {
              doctorId = sessionData.session.user.id;
            }
          }
        }

        if (!patientId || !doctorId) {
          const missing: string[] = [];
          if (!patientId) missing.push("patient_id (chưa tạo bệnh nhân trên CSDL)");
          if (!doctorId) missing.push("doctor_id (chưa đăng nhập)");
          throw new Error(
            `Không thể tạo lượt khám (consultation): Thiếu ${missing.join(" và ")}.`
          );
        }

        // POST /api/v1/consultations
        const newConsultation = await createConsultation({
          patient_id: patientId,
          doctor_id: doctorId,
        });
        targetConsultationId = newConsultation.id;

        // Cập nhật consultationId và doctorId vào state draft ngay lập tức
        setDraft((current) => (current ? { ...current, consultationId: targetConsultationId, doctorId } : current));
      }

      // 1. Upload audio tới POST /api/v1/consultations/{consultation_id}/audio
      const uploadRes = await uploadConsultationAudio(targetConsultationId, file);

      // 2. Lấy transcript mới nhất từ GET /api/v1/consultations/{consultation_id}/transcript
      let lines = dedupeTranscriptLines(uploadRes.transcript.map(mapSegmentToTranscriptLine));
      try {
        const transcriptRes = await getConsultationTranscript(targetConsultationId);
        if (transcriptRes.segments && transcriptRes.segments.length > 0) {
          lines = dedupeTranscriptLines(transcriptRes.segments.map(mapSegmentToTranscriptLine));
        }
      } catch (err: unknown) {
        console.warn("Không lấy được transcript qua GET API, dùng kết quả từ upload response:", err);
      }

      setDraft((current) => {
        if (!current) return current;
        const hasNote = Boolean(current.soapRunId || current.soapTestRunId) || (["subjective", "objective", "assessment", "plan"] as const).some((key) => current.soap[key].trim());
        return {
          ...current,
          status: hasNote ? (current.status === "empty" ? "soap" : current.status) : "uploaded",
          audioFileName: file.name,
          consultationId: targetConsultationId,
          transcript: lines,
          missingFields: current.missingFields.filter((field) => field !== "Audio / transcript"),
          soapActiveSource: "consultation",
          soapRunOutdated: Boolean(current.soapRunId),
        };
      });
      if (lines.length > 0) toast.success("Bản hội thoại thô đã hiện ở cột Hội thoại");
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Xử lý âm thanh thất bại.");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const clearFile = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setDraft((current) => (current ? withoutAudio(current) : current));
  }, []);

  const onLines = useCallback((transcript: Encounter["transcript"]) => {
    setDraft((current) => (current ? { ...current, transcript, soapRunOutdated: Boolean(current.soapRunId) } : current));
  }, []);

  async function importTranscriptJson(file: File) {
    if (jsonBusy || soapBusy || isUploading) return;
    setJsonBusy(true);
    setUploadError("");
    let runId: string | null = null;
    try {
      const content = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("File hội thoại không phải JSON hợp lệ.");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON hội thoại phải là một object.");
      }
      const source = parsed as Record<string, unknown>;
      let inputFormat: SoapInputFormat;
      if (Array.isArray(source.segments) && source.speaker_roles && typeof source.speaker_roles === "object") {
        inputFormat = "qwen_role_result";
        if (source.segments.length === 0) throw new Error("File JSON không có đoạn hội thoại.");
      } else if (Array.isArray(source.turns)) {
        inputFormat = "canonical";
        if (source.turns.length === 0) throw new Error("File JSON không có lượt nói.");
      } else {
        throw new Error("JSON cần có các đoạn đã phân vai, hoặc danh sách lượt nói.");
      }
      const extracted = await extractCaps({ input_format: inputFormat, content });
      runId = extracted.run_id;
      const current = draftRef.current;
      if (current) {
        const next: Encounter = { ...current, soapTestRunId: runId, soapActiveSource: "test" };
        draftRef.current = next;
        setDraft(next);
        saveEncounter(next);
      }
      await generateSoap(runId, 0);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không xử lý được file JSON hội thoại.";
      setUploadError(runId ? `Nguồn đã lưu, nhưng chưa tạo được SOAP: ${message}` : message);
    } finally {
      setJsonBusy(false);
    }
  }

  async function createGroundedSoap() {
    const consultationId = draftRef.current?.consultationId;
    if (!consultationId || soapBusy || isUploading || jsonBusy) return;
    if (!isUUID(consultationId)) {
      setSoapError("Mã lượt khám không hợp lệ; không thể đọc hội thoại đã lưu.");
      return;
    }
    setSoapBusy(true);
    setSoapError("");
    let runId: string | null = null;
    try {
      const transcriptResponse = await getConsultationTranscript(consultationId);
      const transcript = soapTranscriptFromConsultation(transcriptResponse);
      const extracted = await extractCaps({ input_format: "canonical", content: JSON.stringify(transcript) });
      runId = extracted.run_id;
      setShowLegacyFinal(false);
      const current = draftRef.current;
      if (current) {
        const next: Encounter = { ...current, soapRunId: runId, soapActiveSource: "consultation", soapRunOutdated: false };
        draftRef.current = next;
        setDraft(next);
        saveEncounter(next);
      }
      await generateSoap(runId, 0);
      requestRemoteIcdSuggestions(runId);
      toast.success("Đã tạo ghi chú SOAP");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không tạo được ghi chú SOAP.";
      const detail = runId ? `Nguồn đã lưu, nhưng chưa tạo được SOAP: ${message}` : message;
      setSoapError(detail);
      toast.error(detail);
    } finally {
      setSoapBusy(false);
    }
  }

  const regen = useCallback(() => {
    setDraft((current) => {
      if (!current || current.transcript.length === 0) return current;
      const next = draftFromTranscript(current.transcript);
      return { ...current, soap: next.soap, icdSuggestions: next.icdSuggestions, selectedIcd: next.selectedIcd };
    });
  }, []);

  const regenTranscript = useCallback(async () => {
    setTranscriptBusy(true);
    try {
      regen();
      // ponytail: bản nháp dựng ngay trên máy; giữ overlay để thanh tiến trình kịp hiện.
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    } finally {
      setTranscriptBusy(false);
    }
  }, [regen]);

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  if (!ready || (encounter && !draft)) {
    return (
      <ClinicShell section="encounter">
        <EncounterPageSkeleton />
      </ClinicShell>
    );
  }

  if (!encounter || !draft) {
    return (
      <ClinicShell section="encounter">
        <div className="bg-canvas p-6 text-ink">
          <p>Không có lượt khám này.</p>
          <Link href="/desk" className="mt-3 inline-block text-sm text-ink underline">
            Về danh sách khám
          </Link>
        </div>
      </ClinicShell>
    );
  }

  const locked = draft.status === "final";
  const activeRunId = draft.soapActiveSource === "test" ? draft.soapTestRunId : draft.soapRunId;
  const icdSuggestions = draft.icdSuggestions.length ? draft.icdSuggestions : suggestIcd(draft.transcript);
  const encounterId = draft.id;
  const canApprove = !locked && (["subjective", "objective", "assessment", "plan"] as const).every((key) => draft.soap[key].trim());
  const soapGenerated = Boolean(activeRunId) || (["subjective", "objective", "assessment", "plan"] as const).some((key) => draft.soap[key].trim());

  function leave(next: Encounter | null) {
    leaveRef.current = true;
    if (next) saveEncounter(next);
    else removeEncounter(encounterId);
    router.push("/");
  }

  function approve() {
    setDraft((current) =>
      current ? { ...current, status: "final", approvedAt: new Date().toISOString() } : current,
    );
    // Persist the selected ICD (HITL) for the consultation record.
    const consultationId = draftRef.current?.consultationId;
    const selected = draftRef.current?.icdSuggestions.find((item) => item.code === draftRef.current?.selectedIcd);
    if (consultationId && isUUID(consultationId) && selected) {
      void saveConsultationIcd(consultationId, [{
        icd_code: selected.code,
        description: selected.title,
        confidence: selected.confidence ?? null,
      }]).catch(() => undefined);
    }
    toast.success("Đã duyệt ghi chú");
  }

  const note = draft;
  function noteSoap() {
    return activeRunId && (previewSoap ?? groundedSoap.current) ? (previewSoap ?? groundedSoap.current)! : note.soap;
  }

  async function copyNote() {
    const soap = noteSoap();
    const text = (["subjective", "objective", "assessment", "plan"] as const)
      .map((key) => `${key[0].toUpperCase()}\n${soap[key].trim()}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Đã chép ghi chú");
    } catch {
      toast.error("Không chép được ghi chú");
    }
  }

  function goToPdfConfig() {
    if (draft) {
      const latest = { ...draft, soap: noteSoap() };
      saveEncounter(latest);
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`clinnote-draft-${id}`, JSON.stringify(latest));
      }
    }
    router.push(`/encounters/${id}/pdf`);
  }

  async function regenerateNote() {
    if (activeRunId && groundedRegen.current) {
      setRegenBusy(true);
      try {
        const ok = await groundedRegen.current();
        if (ok) toast.success("Đã tạo lại SOAP");
        else toast.error("Không tạo lại được SOAP");
      } finally {
        setRegenBusy(false);
      }
      return;
    }
    regen();
    toast.success("Đã tạo lại SOAP");
  }

  function onGenerateClick() {
    if (!draft || draft.transcript.length === 0 || soapBusy || jsonBusy || isUploading || regenBusy) return;
    if (activeRunId) {
      void regenerateNote();
      return;
    }
    if (!soapGenerated && draft.consultationId) {
      void createGroundedSoap();
      return;
    }
    regen();
  }

  const transcriptNode = (
    <TranscriptPanel
      variant="panel"
      lines={draft.transcript}
      locked={locked}
      loading={isUploading || transcriptBusy || transcriptLoading}
      onChange={onLines}
      onRegen={() => void regenTranscript()}
      onCollapse={() => transcriptPanel.current?.collapse()}
    />
  );

  const filesNode = (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
        <span className="text-[13.5px] font-bold">Tài liệu kèm</span>
        <button
          type="button"
          aria-label="Đóng tài liệu"
          onClick={() => filesPanel.current?.collapse()}
          className="hidden lg:grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"
        >
          <PanelRight size={15} />
        </button>
      </div>
      {!locked ? (
        <AudioRecorder
          tab={tab}
          onTab={(next) => { setTab(next); setUploadError(""); }}
          fileName={draft.audioFileName}
          audioUrl={audioUrl}
          lines={draft.transcript}
          locked={locked}
          isUploading={isUploading}
          isProcessingTranscript={jsonBusy}
          uploadError={uploadError}
          onFile={takeFile}
          onTranscriptJson={(file) => void importTranscriptJson(file)}
          transcriptRunId={draft.soapTestRunId}
          onOpenTranscriptRun={() => setDraft((current) => current ? { ...current, soapActiveSource: "test" } : current)}
          onClear={clearFile}
          onLines={onLines}
          onRegen={() => void regenTranscript()}
          showTranscript={false}
        />
      ) : (
        <p className="m-3 rounded-xl border border-line bg-subtle p-3 text-xs text-muted">Phiếu đã duyệt. Ghi chú có nguồn nằm ở cột giữa.</p>
      )}
    </aside>
  );

  const soapNode = (
    <main className="flex h-full min-h-0 min-w-0 flex-col bg-canvas">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-3 sm:px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {!transcriptOpen && (
            <button type="button" onClick={() => transcriptPanel.current?.expand()} className={cn(toolBtn, "hidden lg:inline-flex")}>
              <PanelLeft size={14} /> Hội thoại
            </button>
          )}
          <h3 className="truncate text-sm sm:text-[15px] font-extrabold">Ghi chú SOAP</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button type="button" onClick={() => setCleanOpen(true)} disabled={!soapGenerated} className={toolBtn}>
            <Eye size={14} /> Bản xem trước
          </button>
          {draft.soapTestRunId && (
            <button type="button" disabled={soapBusy || jsonBusy} onClick={() => { setDraft((current) => current ? { ...current, soapActiveSource: "test" } : current); setShowLegacyFinal(false); }} className={toolBtn}>
              Bản JSON
            </button>
          )}
          {locked && activeRunId && (
            <button type="button" onClick={() => setShowLegacyFinal((current) => !current)} className={toolBtn}>
              {showLegacyFinal ? "SOAP có CAP" : "Phiếu cũ"}
            </button>
          )}
          <button type="button" data-guide="generate" onClick={onGenerateClick} disabled={soapBusy || jsonBusy || regenBusy || isUploading || draft.transcript.length === 0 || (!soapGenerated && !draft.consultationId)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink bg-ink px-2.5 sm:px-3 text-xs sm:text-[12.5px] font-semibold text-white disabled:opacity-45">
            <RefreshCw size={14} /> {soapBusy || jsonBusy || regenBusy ? "Đang tạo…" : soapGenerated ? "Tạo lại" : "Tạo SOAP"}
          </button>
          <button type="button" onClick={() => void copyNote()} disabled={!soapGenerated} className={toolBtn}>
            <Copy size={14} /> Sao chép
          </button>
          <button
            type="button"
            onClick={goToPdfConfig}
            disabled={!soapGenerated}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink bg-ink px-2.5 sm:px-3 text-xs sm:text-[12.5px] font-semibold text-white hover:bg-ink/90 disabled:opacity-60 transition-colors"
          >
            <FileDown size={14} /> Tải PDF
          </button>
          {!filesOpen && (
            <button type="button" aria-label="Mở tài liệu" onClick={() => filesPanel.current?.expand()} className={cn(toolBtn, "hidden lg:inline-flex")}>
              <PanelRight size={14} />
            </button>
          )}
        </div>
      </div>
      {soapError && <p role="alert" className="shrink-0 border-b border-line bg-white px-4 py-2 text-xs text-danger">{soapError}</p>}
      <div id="encounter-soap-workspace" className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <PatientCard patient={draft.patient} locked={locked} />
          {activeRunId ? (soapBusy || jsonBusy ? (
            <SoapSkeleton statusText="Đang tạo ghi chú SOAP với bằng chứng CAP…" />
          ) : (
            <SoapWorkspace key={activeRunId} embedded embeddedRunId={activeRunId} runSource={draft.soapActiveSource} onBindRegen={bindRegen} onPlainSoap={rememberSoap} onIcdSuggestions={receiveRemoteIcdSuggestions} />
          )) : (
            <div className="flex min-h-0 flex-col gap-2">
              <SoapEditor
                soap={draft.soap}
                suggestions={draft.icdSuggestions}
                selectedIcd={draft.selectedIcd}
                showIcd={true}
                locked={locked}
                loading={soapBusy || jsonBusy}
                onSoap={(soap) => setDraft((current) => (current ? { ...current, soap } : current))}
                onSelect={(selectedIcd) => setDraft((current) => (current ? { ...current, selectedIcd } : current))}
                onSuggestions={(icdSuggestions) => setDraft((current) => (current ? { ...current, icdSuggestions } : current))}
                onRegen={() => void regenTranscript()}
              />
            </div>
          )}
        </div>
      </div>
      {activeRunId && draft.transcript.length > 0 && (
        <IcdSuggestBar
          suggestions={icdSuggestions}
          selectedIcd={draft.selectedIcd}
          locked={locked}
          loading={soapBusy || jsonBusy}
          onSelect={handleSelectIcd}
          onSuggestions={(next) => setDraft((current) => current ? { ...current, icdSuggestions: next } : current)}
        />
      )}
      {!activeRunId && (
        <footer className="flex shrink-0 justify-end gap-2 border-t border-line bg-white px-3 sm:px-4 py-2.5 sm:py-3">
          <button type="button" onClick={() => leave(null)} className="h-8 sm:h-9 rounded-lg border border-line bg-white px-3 sm:px-4 text-xs sm:text-sm hover:bg-subtle">
            Hủy lượt khám
          </button>
          <button type="button" disabled={!canApprove} onClick={approve} className={`h-8 sm:h-9 rounded-lg px-3 sm:px-4 text-xs sm:text-sm font-semibold ${canApprove ? "bg-ink text-white" : "bg-line text-faint"}`}>
            {locked ? "Đã duyệt" : "Duyệt"}
          </button>
        </footer>
      )}
    </main>
  );

  return (
    <ClinicShell section="encounter">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-ink">
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-line bg-white px-3.5 sm:px-5 py-2 sm:py-0">
          <div className="min-w-0">
            <h2 className="truncate text-sm sm:text-[15px] font-extrabold tracking-tight">Phiên khám</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 truncate text-[11px] sm:text-[11.5px] text-muted">
              <span className="font-semibold text-ink">{draft.patient.name}</span>
              <span>·</span>
              <span>{draft.patient.code || "—"}</span>
              <span>·</span>
              <span>{draft.createdAt.slice(0, 10)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/patients/new" className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-2.5 sm:px-3 text-xs font-semibold hover:bg-subtle">
              Thêm bệnh nhân
            </Link>
            {!activeRunId && (
              <button
                type="button"
                disabled={!canApprove}
                onClick={approve}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ${
                  canApprove ? "bg-ink text-white hover:bg-ink/90" : "bg-line text-faint"
                }`}
              >
                {locked ? "Đã duyệt" : "Lưu ghi chú"}
              </button>
            )}
          </div>
        </header>

        {locked && (!activeRunId || showLegacyFinal) ? (
          <div className="min-h-0 flex-1 overflow-auto bg-canvas p-3 sm:p-4">
            <FinalNote encounter={draft}>
              <PatientCard patient={draft.patient} locked />
            </FinalNote>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Mobile / Tablet Tab Switcher */}
            <div className="flex shrink-0 items-center border-b border-line bg-white px-2.5 py-1.5 lg:hidden">
              <div className="flex w-full items-center rounded-xl bg-subtle p-1 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setMobileTab("soap")}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg transition-all text-center",
                    mobileTab === "soap" ? "bg-white text-ink shadow-xs" : "text-muted hover:text-ink"
                  )}
                >
                  Ghi chú SOAP
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab("transcript")}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg transition-all text-center",
                    mobileTab === "transcript" ? "bg-white text-ink shadow-xs" : "text-muted hover:text-ink"
                  )}
                >
                  Hội thoại ({draft.transcript.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTab("files")}
                  className={cn(
                    "flex-1 py-1.5 px-2 rounded-lg transition-all text-center",
                    mobileTab === "files" ? "bg-white text-ink shadow-xs" : "text-muted hover:text-ink"
                  )}
                >
                  Ghi âm & Tệp
                </button>
              </div>
            </div>

            {/* Mobile / Tablet Active View */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
              {mobileTab === "soap" && soapNode}
              {mobileTab === "transcript" && (
                <div className="h-full w-full overflow-hidden bg-white">{transcriptNode}</div>
              )}
              {mobileTab === "files" && (
                <div className="h-full w-full overflow-hidden bg-white">{filesNode}</div>
              )}
            </div>

            {/* Desktop 3-Panel Horizontal Resizable Layout */}
            <div className="hidden lg:block absolute inset-0">
              <PanelGroup direction="horizontal" className="h-full w-full" autoSaveId="encounter-workspace">
                <Panel
                  ref={transcriptPanel}
                  id="transcript"
                  defaultSize={28}
                  minSize={18}
                  collapsible
                  collapsedSize={0}
                  onCollapse={() => setTranscriptOpen(false)}
                  onExpand={() => setTranscriptOpen(true)}
                  className="min-w-0 bg-white"
                >
                  {transcriptNode}
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-line transition-colors hover:bg-ink/25" />

                <Panel id="soap" defaultSize={46} minSize={30} className="min-w-0">
                  {soapNode}
                </Panel>
                <PanelResizeHandle className="w-1.5 bg-line transition-colors hover:bg-ink/25" />

                <Panel
                  ref={filesPanel}
                  id="files"
                  defaultSize={26}
                  minSize={16}
                  collapsible
                  collapsedSize={0}
                  onCollapse={() => setFilesOpen(false)}
                  onExpand={() => setFilesOpen(true)}
                  className="min-w-0 bg-white"
                >
                  {filesNode}
                </Panel>
              </PanelGroup>
            </div>
          </div>
        )}
        {(soapBusy || regenBusy || transcriptBusy) && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
            <div
              role="status"
              className="absolute top-1/2 left-1/2 w-[min(16rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-white px-4 py-4 text-center"
            >
              <p className="text-sm font-bold">
                {transcriptBusy ? "Đang sinh lại transcript..." : regenBusy ? "Đang tạo lại SOAP..." : "Đang tạo SOAP..."}
              </p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="wf-cover-sweep block h-full w-1/3 rounded-full bg-ink" />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {transcriptBusy ? "Đang dựng lại nội dung từ hội thoại hiện có." : "Đang trích CAP và soạn ghi chú có dẫn nguồn."}
              </p>
            </div>
          </div>
        )}
        {cleanOpen && <CleanSoap soap={noteSoap()} onClose={() => setCleanOpen(false)} />}
        {guideOn && !soapBusy && !jsonBusy && !isUploading && (
          <FirstVisitGuide
            onClose={(forever, finished) => {
              if (forever) localStorage.setItem(FIRST_VISIT_GUIDE_HIDE, "1");
              if (forever || finished) sessionStorage.removeItem(firstVisitGuideKey(id));
              setGuideOn(false);
            }}
          />
        )}
      </div>
    </ClinicShell>
  );
}

const CLEAN_FIELDS = [
  ["subjective", "S", SOAP_SECTIONS[0].label],
  ["objective", "O", SOAP_SECTIONS[1].label],
  ["assessment", "A", SOAP_SECTIONS[2].label],
  ["plan", "P", SOAP_SECTIONS[3].label],
] as const;

function cleanParts(text: string) {
  return text
    .split(/\n+|(?<=\.)\s+(?=\p{Lu})/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function CleanLines({ text }: { text: string }) {
  const lines = cleanParts(text);
  if (lines.length === 0) {
    return (
      <div className="space-y-2 py-2 animate-pulse">
        <div className="h-3.5 w-4/5 rounded bg-line/70" />
        <div className="h-3.5 w-3/5 rounded bg-line/50" />
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <li key={index} className="flex items-start gap-2 text-[14px] leading-6 text-ink">
          <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function CleanSoap({ soap, onClose }: { soap: SoapNote; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]">
      <button type="button" aria-label="Đóng" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative flex h-[80vh] w-[80vw] flex-col overflow-hidden rounded-md border border-line bg-white">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-extrabold tracking-tight">Bản xem trước</h2>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle">
            Đóng
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 bg-subtle p-3 md:grid-cols-2 md:grid-rows-2">
          {CLEAN_FIELDS.map(([key, letter, title]) => (
            <article key={key} className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-white">
              <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-subtle text-xs font-extrabold text-ink">{letter}</span>
                <h3 className="text-[13px] font-extrabold leading-snug">{title}</h3>
              </header>
              <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <CleanLines text={soap[key]} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const toolBtn = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 sm:px-3 text-xs sm:text-[12.5px] font-semibold text-ink transition-colors hover:bg-subtle disabled:opacity-45";

const PatientCard = memo(function PatientCard({ patient, locked }: { patient: Encounter["patient"]; locked: boolean }) {
  return (
    <article className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-panel">
      <div className="flex min-w-0 items-center gap-3">
        <img src="/patient-avatar.jpg" alt="" className="h-10 w-10 shrink-0 rounded-full border border-line bg-white object-cover" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold">{patient.name}</span>
          <span className="block truncate text-[11.5px] text-muted">
            {patient.gender || "—"} · {dobLine(patient)} · {patient.code || "—"}
          </span>
        </span>
      </div>
      <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-muted">
        {locked ? "Đã duyệt" : "Bản nháp"}
      </span>
    </article>
  );
});

"use client";

/**
 * Clinical Editor — màn sau khi thêm bệnh nhân.
 * empty: chưa có audio. Có file: bản ghi + SOAP + ICD-10.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, PanelLeft, PanelRight, Printer, RefreshCw } from "lucide-react";
import { memo, use, useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { toast } from "sonner";
import AudioRecorder from "@/components/AudioRecorder";
import ClinicShell from "@/components/ClinicShell";
import FinalNote from "@/components/FinalNote";
import IcdSuggestBar from "@/components/IcdSuggestBar";
import SoapEditor from "@/components/SoapEditor";
import TranscriptPanel from "@/components/TranscriptPanel";
import SoapWorkspace from "@/components/soap/SoapWorkspace";
import { removeEncounter, saveEncounter, useEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { draftFromTranscript, suggestIcd } from "@/lib/draftNote";
import {
  createConsultation,
  getConsultationTranscript,
  mapSegmentToTranscriptLine,
  uploadConsultationAudio,
} from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { downloadNotePdf } from "@/lib/notePdf";
import { extractCaps, generateSoap } from "@/lib/soapApi";
import { soapTranscriptFromConsultation } from "@/lib/soapTranscript";
import type { Encounter, Patient, SoapNote } from "@/types";
import type { SoapInputFormat } from "@/types/soap";

const EMPTY_SOAP = { subjective: "", objective: "", assessment: "", plan: "" };

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (parts[0].charAt(0) + last).toLocaleUpperCase("vi-VN");
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
  const groundedRegen = useRef<(() => void) | null>(null);
  const groundedSoap = useRef<SoapNote | null>(null);
  const [printing, setPrinting] = useState(false);
  const bindRegen = useCallback((regenerate: (() => void) | null) => {
    groundedRegen.current = regenerate;
  }, []);
  const rememberSoap = useCallback((soap: SoapNote) => {
    groundedSoap.current = soap;
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
    getConsultationTranscript(consultationId)
      .then((res) => {
        if (!active || !res.segments || res.segments.length === 0) return;
        const lines = res.segments.map(mapSegmentToTranscriptLine);
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
      let lines = uploadRes.transcript.map(mapSegmentToTranscriptLine);
      try {
        const transcriptRes = await getConsultationTranscript(targetConsultationId);
        if (transcriptRes.segments && transcriptRes.segments.length > 0) {
          lines = transcriptRes.segments.map(mapSegmentToTranscriptLine);
        }
      } catch (err: unknown) {
        console.warn("Không lấy được transcript qua GET API, dùng kết quả từ upload response:", err);
      }

      setDraft((current) => {
        if (!current) return current;
        const nextSoap = current.transcript.length === 0 ? draftFromTranscript(lines) : current;
        return {
          ...current,
          status: "soap",
          audioFileName: file.name,
          consultationId: targetConsultationId,
          transcript: lines,
          soap: nextSoap.soap || current.soap,
          icdSuggestions: nextSoap.icdSuggestions || current.icdSuggestions,
          selectedIcd: current.selectedIcd || nextSoap.selectedIcd,
          missingFields: [],
          soapActiveSource: "consultation",
          soapRunOutdated: Boolean(current.soapRunId),
        };
      });
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
        throw new Error("File transcript không phải JSON hợp lệ.");
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("JSON transcript phải là một object.");
      }
      const source = parsed as Record<string, unknown>;
      let inputFormat: SoapInputFormat;
      if (Array.isArray(source.segments) && source.speaker_roles && typeof source.speaker_roles === "object") {
        inputFormat = "qwen_role_result";
        if (source.segments.length === 0) throw new Error("JSON Qwen không có đoạn hội thoại.");
      } else if (Array.isArray(source.turns)) {
        inputFormat = "canonical";
        if (source.turns.length === 0) throw new Error("JSON transcript không có lượt nói.");
      } else {
        throw new Error("JSON cần có segments và speaker_roles như mẫu Qwen, hoặc turns của transcript chuẩn.");
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
      const message = cause instanceof Error ? cause.message : "Không xử lý được transcript JSON.";
      setUploadError(runId ? `CAP đã lưu ở run ${runId}, nhưng chưa tạo được SOAP: ${message}` : message);
    } finally {
      setJsonBusy(false);
    }
  }

  async function createGroundedSoap() {
    const consultationId = draftRef.current?.consultationId;
    if (!consultationId || soapBusy || isUploading || jsonBusy) return;
    if (!isUUID(consultationId)) {
      setSoapError("Mã lượt khám không hợp lệ; không thể đọc transcript đã lưu.");
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
      toast.success("Đã tạo CAP và SOAP");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không tạo được CAP và SOAP.";
      const detail = runId ? `CAP đã được lưu trong run ${runId}, nhưng chưa tạo được SOAP: ${message}` : message;
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

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  if (!ready || (encounter && !draft)) {
    return (
      <ClinicShell section="encounter">
        <div className="grid h-full place-items-center bg-canvas text-sm text-muted">Đang tải lượt khám…</div>
      </ClinicShell>
    );
  }

  if (!encounter || !draft) {
    return (
      <ClinicShell section="encounter">
        <div className="bg-canvas p-6 text-ink">
          <p>Không có lượt khám này.</p>
          <Link href="/" className="mt-3 inline-block text-sm text-ink underline">
            Về trang chủ
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
    toast.success("Đã duyệt ghi chú");
  }

  const note = draft;
  function noteSoap() {
    return activeRunId && groundedSoap.current ? groundedSoap.current : note.soap;
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

  async function printPdf() {
    setPrinting(true);
    try {
      const supabase = getSupabase();
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const fullName = session?.user.user_metadata?.full_name;
      const doctor = typeof fullName === "string" && fullName.trim() ? fullName.trim() : "Bác sĩ";
      const approved = new Date().toLocaleString("vi-VN");
      await downloadNotePdf(
        { ...note, soap: noteSoap() },
        doctor,
        { patient: true, soap: true, icd: true, transcript: false },
        approved,
      );
      toast.success("Đã xuất PDF");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Không xuất được PDF.");
    } finally {
      setPrinting(false);
    }
  }

  function regenerateNote() {
    if (activeRunId) groundedRegen.current?.();
    else regen();
  }

  return (
    <ClinicShell section="encounter">
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-ink">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-5">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-extrabold tracking-tight">Clinical Note Session</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 truncate text-[11.5px] text-muted">
              <span>{draft.patient.name}</span>
              <span>·</span>
              <span>{draft.patient.code || "—"}</span>
              <span>·</span>
              <span>{draft.createdAt.slice(0, 10)}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/patients/new" className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle">
              New Session
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
                {locked ? "Đã duyệt" : "Save Clinical Note"}
              </button>
            )}
          </div>
        </header>

        {(draft.transcript.length > 0 || activeRunId) && (
          <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-2 text-xs" aria-label="Tạo CAP và SOAP có dẫn nguồn">
            <p className="text-muted">
              {activeRunId ? "Đang xem SOAP có dẫn nguồn." : "Transcript đã sẵn sàng để tạo CAP và SOAP có dẫn nguồn."}
              {draft.soapRunOutdated && draft.soapActiveSource !== "test" ? " Transcript đã đổi sau run trước." : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {draft.soapRunId && <button type="button" disabled={soapBusy || jsonBusy} onClick={() => { setDraft((current) => current ? { ...current, soapActiveSource: "consultation" } : current); setShowLegacyFinal(false); }} className="h-8 rounded-lg border border-line bg-white px-3 font-semibold disabled:opacity-45">SOAP từ audio</button>}
              {draft.soapTestRunId && <button type="button" disabled={soapBusy || jsonBusy} onClick={() => { setDraft((current) => current ? { ...current, soapActiveSource: "test" } : current); setShowLegacyFinal(false); }} className="h-8 rounded-lg border border-line bg-white px-3 font-semibold disabled:opacity-45">Run JSON</button>}
              {locked && activeRunId && <button type="button" onClick={() => setShowLegacyFinal((current) => !current)} className="h-8 rounded-lg border border-line bg-white px-3 font-semibold">{showLegacyFinal ? "SOAP có CAP" : "Phiếu cũ"}</button>}
              <button type="button" onClick={() => void createGroundedSoap()} disabled={soapBusy || jsonBusy || isUploading || !draft.consultationId || draft.transcript.length === 0} className="h-8 rounded-lg bg-ink px-3 font-semibold text-white disabled:opacity-45">
                {soapBusy ? "Đang tạo…" : "Generate SOAP"}
              </button>
            </div>
            {soapError && <p role="alert" className="basis-full text-danger">{soapError}</p>}
          </section>
        )}

        {locked && (!activeRunId || showLegacyFinal) ? (
          <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4">
            <FinalNote encounter={draft}>
              <PatientCard patient={draft.patient} locked />
            </FinalNote>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
          <PanelGroup direction="horizontal" className="absolute inset-0" autoSaveId="encounter-workspace">
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
              <TranscriptPanel
                variant="panel"
                lines={draft.transcript}
                locked={locked}
                onChange={onLines}
                onRegen={regen}
                onCollapse={() => transcriptPanel.current?.collapse()}
              />
            </Panel>
            <PanelResizeHandle className="w-1.5 bg-line transition-colors hover:bg-ink/25" />

            <Panel id="soap" defaultSize={46} minSize={30} className="min-w-0">
            <main className="flex h-full min-h-0 min-w-0 flex-col bg-canvas">
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4">
                <div className="flex min-w-0 items-center gap-2">
                  {!transcriptOpen && (
                    <button type="button" onClick={() => transcriptPanel.current?.expand()} className={toolBtn}>
                      <PanelLeft size={14} /> Transcript
                    </button>
                  )}
                  <h3 className="truncate text-[15px] font-extrabold">Clinical SOAP Note</h3>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!filesOpen && (
                    <button type="button" onClick={() => filesPanel.current?.expand()} className={toolBtn}>
                      <PanelRight size={14} /> Files
                    </button>
                  )}
                  <button type="button" onClick={regenerateNote} disabled={soapBusy || jsonBusy} className={toolBtn}>
                    <RefreshCw size={14} /> Regenerate
                  </button>
                  <button type="button" onClick={() => void copyNote()} className={toolBtn}>
                    <Copy size={14} /> Copy
                  </button>
                  <button type="button" onClick={() => void printPdf()} disabled={printing} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#16845B] bg-[#16845B] px-3 text-[12.5px] font-semibold text-white shadow-[0_2px_6px_rgba(22,132,91,0.18)] transition-colors hover:bg-[#12724f] disabled:opacity-60">
                    <Printer size={14} /> {printing ? "Đang tạo…" : "Print PDF"}
                  </button>
                </div>
              </div>
              <div id="encounter-soap-workspace" className="min-h-0 flex-1 overflow-auto p-4">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                  <PatientCard patient={draft.patient} locked={locked} />
                  {activeRunId ? (soapBusy || jsonBusy ? (
                    <div role="status" className="flex min-h-48 items-center justify-center rounded-2xl border border-line bg-white p-6 text-sm shadow-panel">Đang tạo CAP và SOAP…</div>
                  ) : (
                    <SoapWorkspace key={activeRunId} embedded embeddedRunId={activeRunId} runSource={draft.soapActiveSource} onBindRegen={bindRegen} onPlainSoap={rememberSoap} />
                  )) : (
                    <div className="flex min-h-0 flex-col gap-2">
                      <p className="rounded-lg border border-warn-border bg-warn-bg px-3 py-2 text-xs text-warn">Nháp nhanh, chưa có CAP. Dùng Generate SOAP để mở bản có dẫn nguồn.</p>
                      <SoapEditor
                        soap={draft.soap}
                        suggestions={draft.icdSuggestions}
                        selectedIcd={draft.selectedIcd}
                        showIcd={draft.transcript.length > 0}
                        locked={locked}
                        onSoap={(soap) => setDraft((current) => (current ? { ...current, soap } : current))}
                        onSelect={(selectedIcd) => setDraft((current) => (current ? { ...current, selectedIcd } : current))}
                        onSuggestions={(icdSuggestions) => setDraft((current) => (current ? { ...current, icdSuggestions } : current))}
                        onRegen={regen}
                      />
                    </div>
                  )}
                </div>
              </div>
              {activeRunId && draft.transcript.length > 0 && !soapBusy && !jsonBusy && (
                <IcdSuggestBar
                  suggestions={icdSuggestions}
                  selectedIcd={draft.selectedIcd}
                  locked={locked}
                  onSelect={(selectedIcd) => setDraft((current) => current ? { ...current, selectedIcd, icdSuggestions } : current)}
                  onSuggestions={(next) => setDraft((current) => current ? { ...current, icdSuggestions: next } : current)}
                />
              )}
              {!activeRunId && (
                <footer className="flex shrink-0 justify-end gap-2 border-t border-line bg-white px-4 py-3">
                  <button type="button" onClick={() => leave(null)} className="h-9 rounded-lg border border-line bg-white px-4 text-sm hover:bg-subtle">
                    Hủy lượt khám
                  </button>
                  <button type="button" disabled={!canApprove} onClick={approve} className={`h-9 rounded-lg px-4 text-sm font-semibold ${canApprove ? "bg-ink text-white" : "bg-line text-faint"}`}>
                    {locked ? "Đã duyệt" : "Duyệt"}
                  </button>
                </footer>
              )}
            </main>
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
            <aside className="flex h-full min-h-0 flex-col bg-white">
              <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
                <span className="text-[13.5px] font-bold">Session Attachments</span>
                <button type="button" aria-label="Đóng files" onClick={() => filesPanel.current?.collapse()} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white">
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
                  onRegen={regen}
                  showTranscript={false}
                />
              ) : (
                <p className="m-3 rounded-xl border border-line bg-subtle p-3 text-xs text-muted">Phiếu đã duyệt. SOAP có CAP nằm ở cột giữa.</p>
              )}
            </aside>
            </Panel>
          </PanelGroup>
          </div>
        )}
      </div>
    </ClinicShell>
  );
}

const toolBtn = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[12.5px] font-semibold text-ink transition-colors hover:bg-subtle disabled:opacity-45";

const PatientCard = memo(function PatientCard({ patient, locked }: { patient: Encounter["patient"]; locked: boolean }) {
  return (
    <article className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-panel">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-subtle text-sm font-extrabold text-ink ring-1 ring-line">
          {initials(patient.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold">{patient.name}</span>
          <span className="block truncate text-[11.5px] text-muted">
            {patient.gender || "—"} · {dobLine(patient)} · {patient.code || "—"}
          </span>
        </span>
      </div>
      <span className="shrink-0 rounded-full bg-subtle px-2.5 py-1 text-[11px] font-semibold text-muted">
        {locked ? "Đã duyệt" : "Clinical note"}
      </span>
    </article>
  );
});

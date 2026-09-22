"use client";

/**
 * Clinical Editor — màn sau khi thêm bệnh nhân.
 * empty: chưa có audio. Có file: bản ghi + SOAP + ICD-10.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, use, useCallback, useEffect, useRef, useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import AccountMenu from "@/components/AccountMenu";
import FinalNote from "@/components/FinalNote";
import SoapEditor from "@/components/SoapEditor";
import { removeEncounter, saveEncounter, useEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { draftFromTranscript } from "@/lib/draftNote";
import {
  createConsultation,
  getConsultationTranscript,
  mapSegmentToTranscriptLine,
  uploadConsultationAudio,
} from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Encounter, Patient } from "@/types";

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
  };
}

export default function ClinicalEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const authed = useRequireAuth();
  const { encounter, ready } = useEncounter(id);
  const [draft, setDraft] = useState<Encounter | null>(null);
  const [tab, setTab] = useState<"upload" | "record">("upload");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const audioUrlRef = useRef<string | null>(null);
  const seen = useRef<string | null>(null);
  const leaveRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const loadedId = useRef<string | null>(null);

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
      } catch (err: any) {
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
        };
      });
    } catch (err: any) {
      setUploadError(err.message || "Xử lý âm thanh thất bại.");
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
    setDraft((current) => (current ? { ...current, transcript } : current));
  }, []);

  const regen = useCallback(() => {
    setDraft((current) => {
      if (!current || current.transcript.length === 0) return current;
      const next = draftFromTranscript(current.transcript);
      return { ...current, soap: next.soap, icdSuggestions: next.icdSuggestions, selectedIcd: next.selectedIcd };
    });
  }, []);

  if (!authed) return <main className="nb-classic min-h-dvh bg-[#efe6d8]" />;

  if (!ready || (encounter && !draft)) {
    return <main className="plain-canvas nb-classic fixed inset-x-[5vw] inset-y-[5vh] rounded-[22px] bg-[#f6f0e6]" />;
  }

  if (!encounter || !draft) {
    return (
      <main className="plain-canvas nb-classic fixed inset-x-[5vw] inset-y-[5vh] rounded-[22px] bg-[#f6f0e6] p-6 text-[#3e342c]">
        <p>Không có lượt khám này.</p>
        <Link href="/" className="mt-3 inline-block text-sm underline">
          Về trang chủ
        </Link>
      </main>
    );
  }

  const locked = draft.status === "final";
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
  }

  return (
    <main className="plain-canvas nb-classic fixed inset-x-[5vw] inset-y-[5vh] flex flex-col overflow-hidden rounded-[22px] bg-[#f6f0e6] text-[#3e342c] shadow-[0_16px_40px_rgba(62,52,44,0.08)]">
      <header className="flex items-center justify-between px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#efe3d0]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 3v5a4 4 0 0 0 8 0V3" />
              <path d="M8.5 12v3a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-3" />
              <circle cx="17.5" cy="11.5" r="1.5" />
              <path d="M12.5 19v2" />
            </svg>
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold">ClinNote</span>
            <span className="block text-[11px] text-[#866e5a]">Lượt khám</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="inline-flex h-8 items-center rounded-lg border border-[#eadfce] bg-white px-3 text-xs shadow-sm hover:bg-[#f6f0e6]">
            ← Trang chủ
          </Link>
          <AccountMenu />
        </div>
      </header>

      {locked ? (
        <FinalNote encounter={draft}>
          <PatientCard patient={draft.patient} locked />
        </FinalNote>
      ) : (
      <>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[20.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3.5 p-3.5 lg:overflow-hidden lg:border-r lg:border-[#eadfce]">
          <PatientCard patient={draft.patient} locked={false} />

          <AudioRecorder
            tab={tab}
            onTab={setTab}
            fileName={draft.audioFileName}
            audioUrl={audioUrl}
            lines={draft.transcript}
            locked={locked}
            isUploading={isUploading}
            uploadError={uploadError}
            onFile={takeFile}
            onClear={clearFile}
            onLines={onLines}
            onRegen={regen}
          />
        </aside>

        <div className="flex min-h-[28rem] overflow-auto p-3.5 lg:min-h-0">
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
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[#eadfce] px-4 py-3 sm:px-5">
        <div className="flex gap-2.5">
          <button type="button" onClick={() => leave(null)} className="h-9 rounded-lg border border-[#eadfce] bg-white px-4 text-sm shadow-sm hover:bg-[#f6f0e6]">
            Hủy lượt khám
          </button>
          <button
            type="button"
            disabled={!canApprove}
            onClick={approve}
            className={`h-9 rounded-full px-4 text-sm font-semibold ${
              canApprove ? "bg-[#ead9c2] hover:bg-[#e3d0b4]" : "border border-dashed border-[#eadfce] bg-white text-[#b3a394]"
            }`}
          >
            {locked ? "Đã duyệt" : "Duyệt"}
          </button>
        </div>
      </footer>
      </>
      )}
    </main>
  );
}

const PatientCard = memo(function PatientCard({ patient, locked }: { patient: Encounter["patient"]; locked: boolean }) {
  return (
    <article className="relative mt-2 rounded-2xl border border-[#efe4d4] bg-[#fffdf9] shadow-sm">
      <span className="absolute -top-2 left-3 bg-[#f6f0e6] px-1.5 text-[9px] tracking-[0.16em] text-[#9a8674]">BỆNH NHÂN</span>
      <div className="flex items-center gap-3 border-b border-dashed border-[#eadfce] px-3 py-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#eadfce] bg-white text-sm font-bold">
          {initials(patient.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-snug">{patient.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm tracking-wide">{patient.code || "—"}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#eadfce] bg-white px-2 py-0.5 text-[10px] font-semibold">
              <span className={`h-2 w-2 rounded-full ${locked ? "bg-[#3e342c]" : "border border-[#eadfce] bg-white"}`} />
              {locked ? "ĐÃ DUYỆT" : "CHỜ"}
            </span>
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
        <div>
          <dt className="text-[9px] tracking-wide text-[#866e5a]">NGÀY SINH</dt>
          <dd>{dobLine(patient)}</dd>
        </div>
        <div>
          <dt className="text-[9px] tracking-wide text-[#866e5a]">GIỚI TÍNH</dt>
          <dd>{patient.gender || "—"}</dd>
        </div>
        <div>
          <dt className="text-[9px] tracking-wide text-[#866e5a]">BHYT</dt>
          <dd className="text-[#b3a394]">—</dd>
        </div>
        <div>
          <dt className="text-[9px] tracking-wide text-[#866e5a]">SỐ ĐIỆN THOẠI</dt>
          <dd className="text-[#b3a394]">—</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-[#eadfce] bg-white px-2.5 text-[10px] font-bold">
          Dị ứng <span className="font-normal text-[#866e5a]">—</span>
        </span>
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-[#eadfce] bg-white px-2.5 text-[10px] font-bold">
          Cách ly <span className="font-normal text-[#866e5a]">—</span>
        </span>
      </div>
    </article>
  );
});
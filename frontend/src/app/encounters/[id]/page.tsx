"use client";

/**
 * Clinical Editor — màn sau khi thêm bệnh nhân.
 * empty: chưa có audio. Có file: bản ghi + SOAP + ICD-10.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import SoapEditor from "@/components/SoapEditor";
import { removeEncounter, saveEncounter, useEncounter } from "@/hooks/useEncounter";
import { UPLOADED_DRAFT } from "@/lib/mock";
import type { Encounter, Patient } from "@/types";

const EMPTY_SOAP = { subjective: "", objective: "", assessment: "", plan: "" };

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

function withUpload(current: Encounter, file: File): Encounter {
  // ponytail: bản ghi/SOAP cục bộ tới khi có POST audio + STT.
  return {
    ...current,
    status: "soap",
    audioFileName: file.name,
    transcript: UPLOADED_DRAFT.transcript.map((line) => ({ ...line })),
    soap: { ...UPLOADED_DRAFT.soap, sources: { ...UPLOADED_DRAFT.soap.sources } },
    icdSuggestions: UPLOADED_DRAFT.icdSuggestions.map((item) => ({ ...item })),
    selectedIcd: UPLOADED_DRAFT.icdSuggestions[0]?.code,
    missingFields: [],
  };
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
  const { encounter, ready } = useEncounter(id);
  const [draft, setDraft] = useState<Encounter | null>(null);
  const [tab, setTab] = useState<"upload" | "record">("upload");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const seen = useRef<string | null>(null);
  const leaveRef = useRef(false);

  useEffect(() => {
    seen.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setTab("upload");
    if (encounter) setDraft(encounter);
  }, [encounter]);

  useEffect(() => {
    if (!draft || leaveRef.current) return;
    const serial = JSON.stringify(draft);
    if (seen.current === null) {
      seen.current = serial;
      return;
    }
    if (seen.current === serial) return;
    seen.current = serial;
    saveEncounter(draft);
  }, [draft]);

  useEffect(
    () => () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  if (!ready || (encounter && !draft)) {
    return <main className="nb-classic min-h-screen bg-[#f3ece1]" />;
  }

  if (!encounter || !draft) {
    return (
      <main className="nb-classic min-h-screen p-6 text-[#3e342c]">
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

  function takeFile(file: File) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    setAudioUrl(url);
    setTab("upload");
    setDraft((current) => (current ? withUpload(current, file) : current));
  }

  function clearFile() {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setDraft((current) => (current ? withoutAudio(current) : current));
  }

  function leave(next: Encounter | null) {
    leaveRef.current = true;
    if (next) saveEncounter(next);
    else removeEncounter(encounterId);
    router.push("/");
  }

  return (
    <main className="nb-classic flex min-h-dvh flex-col text-[#3e342c] lg:h-dvh lg:overflow-hidden">
      <header className="flex items-center justify-between border-b border-[#c9bba8] bg-[#efe6d8] px-4 py-3 sm:px-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center border border-[#c9bba8] bg-[#e4d5bc] shadow-[2px_2px_0_#e4d8c8]">
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
          <span className="inline-flex h-8 items-center border border-[#c9bba8] bg-[#e4d5bc] px-2.5 text-[11px] font-medium shadow-[2px_2px_0_#e4d8c8]">VI</span>
          <Link href="/" className="inline-flex h-8 items-center border border-[#c9bba8] bg-[#fffdf8] px-3 text-xs font-medium shadow-[2px_2px_0_#e4d8c8] hover:bg-[#e4d5bc]">
            ← Trang chủ
          </Link>
          <img src="/default-avatar.jpg" alt="" className="h-8 w-8 rounded-full border border-[#c9bba8] object-cover" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[20.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3.5 border-[#c9bba8] bg-[#f3ece1] p-3.5 lg:overflow-hidden lg:border-r">
          <article className="relative mt-2 border border-[#c9bba8] bg-[#fffdf8]">
            <span className="absolute -top-2 left-3 bg-[#f3ece1] px-1.5 text-[9px] tracking-[0.16em] text-[#866e5a]">BỆNH NHÂN</span>
            <div className="flex items-center gap-3 border-b border-dashed border-[#c9bba8] px-3 py-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#c9bba8] text-sm font-bold">
                {initials(draft.patient.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-semibold leading-snug">{draft.patient.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm tracking-wide">{draft.patient.code || "—"}</span>
                  <span className="inline-flex items-center gap-1 border border-[#c9bba8] bg-[#efe6d8] px-1.5 text-[10px] font-semibold">
                    <span className={`h-2 w-2 rounded-full border border-[#3e342c] ${locked ? "bg-[#3e342c]" : "bg-[#fffdf8]"}`} />
                    {locked ? "ĐÃ DUYỆT" : "CHỜ"}
                  </span>
                </span>
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
              <div>
                <dt className="text-[9px] tracking-wide text-[#866e5a]">NGÀY SINH</dt>
                <dd>{dobLine(draft.patient)}</dd>
              </div>
              <div>
                <dt className="text-[9px] tracking-wide text-[#866e5a]">GIỚI TÍNH</dt>
                <dd>{draft.patient.gender || "—"}</dd>
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
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-[#c9bba8] px-2.5 text-[10px] font-bold">
                Dị ứng <span className="font-normal text-[#866e5a]">—</span>
              </span>
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-[#c9bba8] px-2.5 text-[10px] font-bold">
                Cách ly <span className="font-normal text-[#866e5a]">—</span>
              </span>
            </div>
          </article>

          <AudioRecorder
            tab={tab}
            onTab={setTab}
            fileName={draft.audioFileName}
            audioUrl={audioUrl}
            lines={draft.transcript}
            locked={locked}
            onFile={takeFile}
            onClear={clearFile}
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
          />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c9bba8] bg-[#efe6d8] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full border border-[#3e342c] bg-[#3e342c]" />
          <span className="text-xs text-[#866e5a]">Tự lưu</span>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={() => leave(null)} className="h-8 border border-[#c9bba8] bg-[#fffdf8] px-4 text-sm hover:bg-[#efe6d8]">
            Hủy lượt khám
          </button>
          <button
            type="button"
            disabled={!canApprove}
            onClick={() => leave({ ...draft, status: "final" })}
            className={`h-8 px-4 text-sm font-semibold ${
              canApprove
                ? "border border-[#c9bba8] bg-[#e4d5bc] shadow-[2px_2px_0_#c9bba8] hover:bg-[#efe6d8]"
                : "border border-dashed border-[#c9bba8] bg-[#fffdf8] text-[#b3a394]"
            }`}
          >
            {locked ? "Đã duyệt" : "Duyệt"}
          </button>
        </div>
      </footer>
    </main>
  );
}

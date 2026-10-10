"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabase } from "@/lib/supabase";
import type { Encounter } from "@/types";

const PARTS = [
  ["patient", "Thông tin bệnh nhân"],
  ["soap", "Ghi chú SOAP"],
  ["icd", "ICD-10"],
  ["transcript", "Bản ghi"],
] as const;

type Part = (typeof PARTS)[number][0];

const SOAP = [
  ["subjective", "S", "Bệnh sử & triệu chứng cơ năng"],
  ["objective", "O", "Thám khám thực thể & dấu hiệu sinh tồn"],
  ["assessment", "A", "Đánh giá & chẩn đoán sơ bộ"],
  ["plan", "P", "Kế hoạch điều trị & đề xuất"],
] as const;

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function paperDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `Ngày ${pad(date.getDate())} tháng ${pad(date.getMonth() + 1)} năm ${date.getFullYear()}`;
}

function when(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sourceLine(encounter: Encounter) {
  const last = encounter.transcript.at(-1);
  const mark = last ? clock(last.endSec ?? last.timestampSec) : "";
  if (encounter.audioFileName) return { tag: "Tệp", text: encounter.audioFileName, mark };
  if (encounter.transcript.length) return { tag: "Ghi âm", text: "Trong phiên", mark };
  return { tag: "—", text: "Chưa có audio", mark: "" };
}

export default function FinalNote({ encounter, children }: { encounter: Encounter; children: ReactNode }) {
  const router = useRouter();
  const [parts, setParts] = useState<Record<Part, boolean>>({
    patient: true,
    soap: true,
    icd: true,
    transcript: false,
  });
  const [doctor, setDoctor] = useState("Bác sĩ");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const fullName = data.session?.user.user_metadata?.full_name;
      if (typeof fullName === "string" && fullName.trim()) setDoctor(fullName.trim());
    });
  }, []);

  const icd =
    encounter.icdSuggestions.find((item) => item.code === encounter.selectedIcd) ?? encounter.icdSuggestions[0];
  const approved = when(encounter.approvedAt ?? encounter.createdAt);
  const source = sourceLine(encounter);

  function toggle(part: Part) {
    setParts((current) => ({ ...current, [part]: !current[part] }));
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[20.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3.5 overflow-auto p-3.5 lg:border-r lg:border-line">
          {children}
          <section className="rounded-2xl border border-line bg-white">
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Phiên khám</h2>
            <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
              <dt className="text-[9px] tracking-wide text-muted">NGUỒN</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                <span className="rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold">{source.tag}</span>
                <span className="truncate">{source.text}</span>
                {source.mark && <span className="shrink-0 font-mono text-muted">{source.mark}</span>}
              </dd>
              <dt className="text-[9px] tracking-wide text-muted">BÁC SĨ</dt>
              <dd className="truncate">{doctor}</dd>
              <dt className="text-[9px] tracking-wide text-muted">DUYỆT LÚC</dt>
              <dd className="font-mono">{approved}</dd>
              <dt className="text-[9px] tracking-wide text-muted">ICD-10</dt>
              <dd>{icd ? <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-white">{icd.code}</span> : "—"}</dd>
            </dl>
          </section>
          <section className="rounded-2xl border border-line bg-white">
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Xuất bản</h2>
            <ul className="flex flex-col gap-1.5 px-3 py-2.5">
              {PARTS.map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={parts[id]}
                    onClick={() => toggle(id)}
                    className="flex items-center gap-2 text-left text-sm"
                  >
                    <span className={`grid h-3.5 w-3.5 place-items-center rounded-sm border text-[10px] leading-none ${parts[id] ? "border-[#3e342c] bg-ink text-white" : "border-line bg-white text-transparent"}`}>
                      ✓
                    </span>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="min-h-[28rem] overflow-auto bg-[#e7e1d6] p-6 lg:min-h-0">
          <NoteSheet encounter={encounter} parts={parts} icd={icd} approved={approved} doctor={doctor} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-4 py-3 sm:px-5">
        <Link href="/desk" className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-4 text-sm shadow-sm hover:bg-subtle">
          ← Bàn làm việc
        </Link>
        <button
          type="button"
          onClick={() => setPreview(true)}
          className="h-9 rounded-lg border border-line bg-white px-4 text-sm hover:bg-subtle"
        >
          Xem trước
        </button>
        <button
          type="button"
          onClick={() => router.push(`/encounters/${encounter.id}/pdf`)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90 transition-colors"
        >
          <FileDown className="h-4 w-4" /> Tải PDF
        </button>
      </footer>
      <Dialog.Root open={preview} onOpenChange={setPreview}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/35" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 max-h-[min(90dvh,52rem)] w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-[#e7e1d6] p-6 shadow-[0_16px_40px_rgb(28_31_35/0.2)]">
            <Dialog.Title className="sr-only">Xem trước phiếu khám</Dialog.Title>
            <NoteSheet encounter={encounter} parts={parts} icd={icd} approved={approved} doctor={doctor} />
            <div className="mt-4 flex justify-end">
              <Dialog.Close className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-white">Đóng</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function NoteSheet({
  encounter,
  parts,
  icd,
  approved,
  doctor,
}: {
  encounter: Encounter;
  parts: Record<Part, boolean>;
  icd: Encounter["icdSuggestions"][number] | undefined;
  approved: string;
  doctor: string;
}) {
  return (
    <article
      className="final-sheet mx-auto w-full max-w-[40rem] bg-white px-10 py-11 text-[15px] leading-7 text-[#1a1a1a] shadow-[0_10px_28px_rgba(0,0,0,0.14)]"
      style={{ fontFamily: '"Times New Roman", Times, "Palatino Linotype", Palatino, serif' }}
    >
      <header className="text-center">
        <p className="text-[12px] tracking-[0.32em] uppercase">ClinNote</p>
        <h2 className="mt-1 text-[22px] leading-tight font-bold tracking-[0.04em]">PHIẾU KHÁM BỆNH</h2>
        <p className="mt-1 text-[14px]">Đã duyệt · {approved}</p>
      </header>
      <div className="mt-3 border-t-2 border-black" />

      {parts.patient && (
        <dl className="mt-4 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          <dt>Họ và tên</dt>
          <dd className="font-bold">{encounter.patient.name}</dd>
          <dt>Ngày sinh</dt>
          <dd>
            {encounter.patient.dob || "—"}
            {encounter.patient.age > 0 ? ` (${encounter.patient.age} tuổi)` : ""}
          </dd>
          <dt>Giới tính</dt>
          <dd>{encounter.patient.gender || "—"}</dd>
          <dt>Mã bệnh nhân</dt>
          <dd>{encounter.patient.code || "—"}</dd>
          <dt>Lý do khám</dt>
          <dd>{encounter.patient.reason || "—"}</dd>
        </dl>
      )}

      {parts.soap && (
        <div className="mt-4 border-t border-black pt-3">
          {SOAP.map(([key, , name], index) => (
            <section key={key} className="mb-3">
              <h3 className="font-bold">{index + 1}. {name}</h3>
              <p className="text-justify whitespace-pre-wrap">{encounter.soap[key].trim() || "—"}</p>
            </section>
          ))}
        </div>
      )}

      {parts.icd && (
        <section className="mt-1">
          <h3 className="font-bold">Chẩn đoán (ICD-10)</h3>
          <p>{icd ? `${icd.code} — ${icd.title}` : "Chưa chọn mã"}</p>
        </section>
      )}

      {parts.transcript && (
        <section className="mt-3">
          <h3 className="font-bold">Bản ghi</h3>
          {encounter.transcript.length === 0 ? (
            <p>Không có bản ghi</p>
          ) : (
            <ol className="mt-1">
              {encounter.transcript.map((line) => (
                <li key={line.id}>
                  {clock(line.timestampSec)} {line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân"}: {line.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <div className="mt-8 flex justify-end">
        <div className="w-56 text-center">
          <p>{paperDate(encounter.approvedAt ?? encounter.createdAt)}</p>
          <p className="font-bold">Bác sĩ khám bệnh</p>
          <div className="h-12" />
          <p className="font-bold">{doctor}</p>
        </div>
      </div>
    </article>
  );
}

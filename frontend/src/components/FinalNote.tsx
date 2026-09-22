"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { downloadNotePdf } from "@/lib/notePdf";
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
  ["subjective", "S", "Chủ quan"],
  ["objective", "O", "Khách quan"],
  ["assessment", "A", "Đánh giá"],
  ["plan", "P", "Kế hoạch"],
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
  const [parts, setParts] = useState<Record<Part, boolean>>({
    patient: true,
    soap: true,
    icd: true,
    transcript: false,
  });
  const [doctor, setDoctor] = useState("Bác sĩ");
  const [saving, setSaving] = useState(false);
  const [pdfError, setPdfError] = useState("");

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

  async function exportPdf() {
    setPdfError("");
    setSaving(true);
    try {
      await downloadNotePdf(encounter, doctor, parts, approved);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Không xuất được PDF.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[20.5rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3.5 overflow-auto p-3.5 lg:border-r lg:border-[#eadfce]">
          {children}
          <section className="rounded-2xl border border-[#efe4d4] bg-[#fffdf9]">
            <h2 className="border-b border-[#efe4d4] px-3 py-2 text-sm font-semibold">Phiên khám</h2>
            <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 text-xs">
              <dt className="text-[9px] tracking-wide text-[#866e5a]">NGUỒN</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                <span className="rounded-full border border-[#eadfce] bg-white px-1.5 py-0.5 text-[10px] font-semibold">{source.tag}</span>
                <span className="truncate">{source.text}</span>
                {source.mark && <span className="shrink-0 font-mono text-[#866e5a]">{source.mark}</span>}
              </dd>
              <dt className="text-[9px] tracking-wide text-[#866e5a]">BÁC SĨ</dt>
              <dd className="truncate">{doctor}</dd>
              <dt className="text-[9px] tracking-wide text-[#866e5a]">DUYỆT LÚC</dt>
              <dd className="font-mono">{approved}</dd>
              <dt className="text-[9px] tracking-wide text-[#866e5a]">ICD-10</dt>
              <dd>{icd ? <span className="rounded-full bg-[#3e342c] px-2 py-0.5 text-[10px] font-semibold text-white">{icd.code}</span> : "—"}</dd>
            </dl>
          </section>
          <section className="rounded-2xl border border-[#efe4d4] bg-[#fffdf9]">
            <h2 className="border-b border-[#efe4d4] px-3 py-2 text-sm font-semibold">Xuất bản</h2>
            <ul className="flex flex-col gap-1.5 px-3 py-2.5">
              {PARTS.map(([id, label]) => (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={parts[id]}
                    onClick={() => toggle(id)}
                    className="flex items-center gap-2 text-left text-sm"
                  >
                    <span className={`grid h-3.5 w-3.5 place-items-center rounded-sm border text-[10px] leading-none ${parts[id] ? "border-[#3e342c] bg-[#3e342c] text-white" : "border-[#eadfce] bg-white text-transparent"}`}>
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
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#eadfce] px-4 py-3 sm:px-5">
        <Link href="/" className="inline-flex h-9 items-center rounded-lg border border-[#eadfce] bg-white px-4 text-sm shadow-sm hover:bg-[#f6f0e6]">
          ← Trang chủ
        </Link>
        <button
          type="button"
          disabled={saving}
          onClick={() => void exportPdf()}
          className="h-9 rounded-lg bg-[#ead9c2] px-4 text-sm font-semibold hover:bg-[#e3d0b4] disabled:opacity-60"
        >
          {saving ? "Đang tạo..." : "Xuất PDF"}
        </button>
        {pdfError && <p className="w-full text-right text-xs text-rose-700">{pdfError}</p>}
      </footer>
    </>
  );
}

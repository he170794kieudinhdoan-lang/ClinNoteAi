"use client";

import { useEffect, type ReactNode } from "react";
import type { ClinicalAtomicProposition, SoapTranscript } from "@/types/soap";

const TYPE_LABELS: Record<string, string> = {
  ChiefComplaint: "Lý do khám",
  Problem: "Vấn đề",
  ProblemHistory: "Tiền sử",
  ExamFinding: "Khám",
  TestResult: "Kết quả",
  MedicationStatement: "Thuốc đang dùng",
  MedicationRequest: "Điều chỉnh thuốc",
  Order: "Chỉ định",
  FollowUp: "Theo dõi",
  Counseling: "Tư vấn",
};

function timeRange(startMs: number | null, endMs: number | null) {
  if (startMs == null || endMs == null) return "Không có mốc thời gian";
  const format = (value: number) => {
    const seconds = Math.floor(value / 1000);
    const hundredths = Math.floor((value % 1000) / 10);
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
  };
  return `${format(startMs)}–${format(endMs)}`;
}

function speakerLabel(speaker: string) {
  if (speaker === "clinician" || speaker === "doctor") return "Bác sĩ";
  if (speaker === "patient") return "Người bệnh";
  return `Vai chưa rõ (${speaker || "không có"})`;
}

function highlightQuotes(text: string, quotes: string[]) {
  const ranges: Array<[number, number]> = [];
  for (const quote of [...new Set(quotes)].filter(Boolean)) {
    let from = 0;
    while (from < text.length) {
      const start = text.indexOf(quote, from);
      if (start < 0) break;
      ranges.push([start, start + quote.length]);
      from = start + Math.max(quote.length, 1);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (cursor < start) pieces.push(text.slice(cursor, start));
    pieces.push(
      <mark key={`${start}-${end}`} className="rounded bg-[#f3d680] px-0.5 text-ink ring-2 ring-[#d7a62a]/35">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return pieces;
}

function badgeClass(active: boolean) {
  return `inline-flex rounded-full border px-2 py-0.5 text-[10px] ${active ? "border-[#b5945e] bg-[#f7eccd] text-[#5b4627]" : "border-line bg-white text-muted"}`;
}

export default function CapEvidencePanel({
  transcript,
  caps,
  selectedCapId,
  selectedCapIds,
  onSelectCap,
}: {
  transcript: SoapTranscript;
  caps: ClinicalAtomicProposition[];
  selectedCapId: string | null;
  selectedCapIds: string[];
  onSelectCap: (capId: string) => void;
}) {
  const turns = transcript.turns ?? [];
  const selectedCap = caps.find((cap) => cap.prop_id === selectedCapId);
  const emphasizedCapIds = new Set(selectedCapIds.length > 0 ? selectedCapIds : selectedCapId ? [selectedCapId] : []);
  const evidenceByTurn = new Map<string, string[]>();
  for (const cap of caps) {
    if (!emphasizedCapIds.has(cap.prop_id)) continue;
    for (const evidence of cap.evidence ?? []) {
      evidenceByTurn.set(evidence.turn_id, [...(evidenceByTurn.get(evidence.turn_id) ?? []), evidence.quote]);
    }
  }
  const focusedTurnId = selectedCap?.evidence?.[0]?.turn_id ?? null;

  useEffect(() => {
    if (!focusedTurnId) return;
    document.getElementById(`soap-turn-${focusedTurnId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedTurnId]);

  return (
    <section className="grid min-h-[30rem] gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-[#f0e7dc] px-4 py-3">
          <div>
            <h2 className="text-sm font-bold">CAP và nguồn</h2>
            <p className="mt-0.5 text-xs text-muted">{caps.length} thông tin; click một thẻ để đối chiếu lời thoại.</p>
          </div>
          <span className="rounded-full bg-subtle px-2.5 py-1 text-[10px] text-muted">Nguồn văn bản</span>
        </header>
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {caps.length === 0 && <li className="rounded-xl border border-dashed border-[#d9cbb9] p-5 text-sm text-muted">Chưa có CAP cho run này.</li>}
          {caps.map((cap) => {
            const active = emphasizedCapIds.has(cap.prop_id) || selectedCapId === cap.prop_id;
            return (
              <li key={cap.prop_id}>
                <button
                  type="button"
                  onClick={() => onSelectCap(cap.prop_id)}
                  aria-pressed={active}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-[#b5945e] bg-[#fff9e9] shadow-sm" : "border-line bg-white hover:border-line hover:bg-subtle"}`}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={badgeClass(active)}>{TYPE_LABELS[cap.cap_type] ?? cap.cap_type}</span>
                    <span className={badgeClass(active)}>{cap.verification_status ?? "unknown"}</span>
                    <span className={badgeClass(active)}>{cap.resolution_status ?? "current"}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted">{cap.prop_id}</span>
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-5">{cap.proposition_text}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {cap.canonical_concept} · {cap.temporality ?? "thời điểm chưa rõ"} · {cap.clinical_status ?? "trạng thái chưa rõ"}
                    {cap.medication_state ? ` · ${cap.medication_state}` : ""}
                  </span>
                  {(cap.supersedes?.length ?? 0) > 0 && (
                    <span className="mt-2 block rounded-lg bg-[#f8eee3] px-2.5 py-1.5 text-xs text-muted">
                      Đính chính: {cap.supersedes.join(", ")}. CAP cũ vẫn được giữ để truy vết.
                    </span>
                  )}
                  <span className="mt-2 block space-y-1.5">
                    {(cap.evidence ?? []).map((evidence, index) => {
                      const turn = turns.find((item) => item.turn_id === evidence.turn_id);
                      const sourceId = evidence.source_segment_id ?? turn?.source_segment_id ?? evidence.turn_id;
                      const speaker = evidence.speaker ?? turn?.speaker ?? "unknown";
                      const startMs = evidence.start_ms ?? turn?.start_ms ?? null;
                      const endMs = evidence.end_ms ?? turn?.end_ms ?? null;
                      return (
                        <span key={`${evidence.turn_id}-${index}`} className="block rounded-lg border border-dashed border-[#d9cbb9] bg-white px-2.5 py-2">
                          <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                            <span className="font-semibold text-muted">{speakerLabel(speaker)}</span>
                            <span>segment {sourceId}</span>
                            <span>{timeRange(startMs, endMs)}</span>
                            <span className={badgeClass(evidence.quote && turn?.text.includes(evidence.quote) ? active : false)}>
                              {evidence.quote && turn?.text.includes(evidence.quote) ? "Liên kết hợp lệ" : "Chưa đối chiếu được quote"}
                            </span>
                          </span>
                          <span className="block text-xs leading-5 text-ink">“{evidence.quote}”</span>
                        </span>
                      );
                    })}
                    {(!cap.evidence || cap.evidence.length === 0) && <span className="block text-xs text-faint">CAP này chưa có trích dẫn.</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white">
        <header className="border-b border-[#f0e7dc] px-4 py-3">
          <h2 className="text-sm font-bold">Transcript đã lưu</h2>
          <p className="mt-0.5 text-xs text-muted">Đoạn có trích dẫn khớp được tô sáng; mốc giờ bao trùm toàn segment.</p>
        </header>
        <ol className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {turns.length === 0 && <li className="rounded-xl border border-dashed border-[#d9cbb9] p-5 text-sm text-muted">Run này chưa có lượt thoại để hiển thị.</li>}
          {turns.map((turn) => {
            const quotes = evidenceByTurn.get(turn.turn_id) ?? [];
            const highlighted = quotes.length > 0;
            const sourceId = turn.source_segment_id ?? turn.turn_id;
            return (
              <li
                key={turn.turn_id}
                id={`soap-turn-${turn.turn_id}`}
                className={`rounded-xl border p-3 transition-colors ${highlighted ? "border-[#d5b65c] bg-[#fff9e5] shadow-sm" : "border-line bg-white"}`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                  <span className="font-semibold text-muted">{speakerLabel(turn.speaker)}</span>
                  <span>segment {sourceId}</span>
                  <span>{timeRange(turn.start_ms, turn.end_ms)}</span>
                  <span className="font-mono">{turn.turn_id}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{highlightQuotes(turn.text, quotes)}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

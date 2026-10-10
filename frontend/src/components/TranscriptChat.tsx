"use client";

import { useEffect, useRef } from "react";
import { MessageSquareOff } from "lucide-react";
import { TranscriptSkeleton } from "@/components/Skeletons";
import type { TranscriptLine } from "@/types";
import type { SoapTranscript, SoapTranscriptTurn } from "@/types/soap";

export type ChatLine = {
  id: string;
  speaker: "doctor" | "patient" | "unknown";
  text: string;
  startSec: number | null;
  endSec: number | null;
};

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function speakerOf(value: string | null | undefined): ChatLine["speaker"] {
  if (value === "doctor" || value === "clinician") return "doctor";
  if (value === "patient") return "patient";
  return "unknown";
}

export function soapTurnKey(turn: Pick<SoapTranscriptTurn, "turn_id" | "source_segment_id">) {
  return turn.source_segment_id != null && String(turn.source_segment_id) !== ""
    ? String(turn.source_segment_id)
    : turn.turn_id;
}

function uniqueChatLines(lines: ChatLine[]): ChatLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.speaker}\0${line.startSec ?? ""}\0${line.endSec ?? ""}\0${line.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function chatLinesFromTranscript(lines: TranscriptLine[]): ChatLine[] {
  return uniqueChatLines(lines.map((line) => ({
    id: line.id,
    speaker: line.speaker,
    text: line.text,
    startSec: line.timestampSec,
    endSec: line.endSec ?? null,
  })));
}

export function chatLinesFromSoap(transcript: SoapTranscript | undefined): ChatLine[] {
  return uniqueChatLines((transcript?.turns ?? []).map((turn) => ({
    id: soapTurnKey(turn),
    speaker: speakerOf(turn.speaker),
    text: turn.text,
    startSec: turn.start_ms == null ? null : turn.start_ms / 1000,
    endSec: turn.end_ms == null ? null : turn.end_ms / 1000,
  })));
}

function speakerName(speaker: ChatLine["speaker"]) {
  if (speaker === "doctor") return "Bác sĩ";
  if (speaker === "patient") return "Bệnh nhân";
  return "Vai chưa rõ";
}

function mark(speaker: ChatLine["speaker"]) {
  if (speaker === "doctor") return "BS";
  if (speaker === "patient") return "BN";
  return "?";
}

function spanLabel(line: ChatLine) {
  if (line.startSec == null) return "Không có mốc giờ";
  const start = clock(line.startSec);
  if (line.endSec == null) return start;
  const length = Math.max(0, Math.round(line.endSec - line.startSec));
  return `${start}–${clock(line.endSec)} · ${length} giây`;
}

export default function TranscriptChat({
  lines,
  focusId,
  loading = false,
  onClose,
}: {
  lines: ChatLine[];
  focusId?: string | null;
  loading?: boolean;
  onClose: () => void;
}) {
  const focusRef = useRef<HTMLLIElement>(null);
  const turns = lines.length;
  const doctors = lines.filter((line) => line.speaker === "doctor").length;
  const patients = lines.filter((line) => line.speaker === "patient").length;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const node = focusRef.current;
    if (!node) return;
    const frame = requestAnimationFrame(() => node.scrollIntoView({ behavior: "auto", block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [focusId, lines]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px]">
      <button type="button" aria-label="Đóng hội thoại" className="absolute inset-0 cursor-default" onClick={onClose} />
      <section className="relative flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-md border border-line bg-white">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-extrabold tracking-tight">Hội thoại</h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {turns} lượt · {doctors} bác sĩ · {patients} bệnh nhân
            </p>
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle">
            Đóng
          </button>
        </header>
        <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto bg-subtle px-3 py-4">
          {lines.length === 0 && (
            loading ? (
              <TranscriptSkeleton variant="chat" count={5} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-muted shadow-xs ring-1 ring-line">
                  <MessageSquareOff size={22} />
                </div>
                <p className="mt-3 text-sm font-bold text-ink">Chưa có nội dung hội thoại</p>
                <p className="mt-1 max-w-[240px] text-xs leading-relaxed text-muted">
                  Tải âm thanh cuộc khám để hệ thống bóc băng và hiển thị hội thoại chi tiết tại đây.
                </p>
              </div>
            )
          )}
          {lines.map((line, index) => {
            const doctor = line.speaker === "doctor";
            const active = focusId != null && focusId === line.id;
            return (
              <li
                key={line.id}
                ref={active ? focusRef : undefined}
                id={`chat-line-${line.id}`}
                className={`flex items-end gap-2 ${doctor ? "flex-row-reverse" : ""} ${active ? "rounded-md bg-[#e7f6ee] px-2 py-2 ring-1 ring-[#1f7a4d]" : ""}`}
              >
                {line.speaker === "patient" ? (
                  <img src="/patient-avatar.jpg" alt="" className="h-8 w-8 shrink-0 rounded-full border border-line bg-white object-cover" />
                ) : (
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${doctor ? "bg-[#3a3a3a] text-white" : "border border-line bg-white text-ink"}`}>
                    {mark(line.speaker)}
                  </span>
                )}
                <div className={`flex max-w-[80%] flex-col ${doctor ? "items-end" : "items-start"}`}>
                  <p className="mb-1 text-[10.5px] font-semibold text-muted">
                    {speakerName(line.speaker)} · #{index + 1}
                  </p>
                  <p className={`rounded-md px-3 py-2 text-[13px] leading-relaxed ${doctor ? "bg-[#3a3a3a] text-white" : "border border-line bg-white text-ink"}`}>
                    {line.text}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-faint">{spanLabel(line)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

"use client";

/**
 * TranscriptPanel — mỗi dòng là một segment: vai, khoảng thời gian, lời nói.
 * Khung nhỏ là bản xem trước (cắt 2 dòng). Xem chi tiết hiện đủ và cho sửa.
 */

import { useState } from "react";
import type { TranscriptLine } from "@/types";

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function range(line: TranscriptLine) {
  const start = clock(line.timestampSec);
  return line.endSec == null ? start : `${start}–${clock(line.endSec)}`;
}

function roleLabel(speaker: TranscriptLine["speaker"]) {
  return speaker === "doctor" ? "BS" : "BN";
}

export default function TranscriptPanel({
  lines,
  locked,
  onChange,
  onRegen,
}: {
  lines: TranscriptLine[];
  locked?: boolean;
  onChange?: (lines: TranscriptLine[]) => void;
  onRegen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  function close() {
    setEditing(false);
    setOpen(false);
  }

  function update(id: string, text: string) {
    onChange?.(lines.map((line) => (line.id === id ? { ...line, text } : line)));
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#eadfce] bg-[#fffdf9]">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-semibold text-[#3e342c]">Bản ghi</span>
          <span className="text-[10px] tracking-wide text-[#9a8674]">STT</span>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-[#f3eadf] overflow-x-hidden overflow-y-auto px-3">
          {lines.map((line) => (
            <li key={line.id} className="grid grid-cols-[1.5rem_2.35rem_minmax(0,1fr)] items-baseline gap-1.5 py-1.5">
              <span className={`text-[10px] font-semibold ${line.speaker === "doctor" ? "text-[#3e342c]" : "text-[#a08b78]"}`}>
                {roleLabel(line.speaker)}
              </span>
              <span className="font-mono text-[10px] text-[#b3a394]">{clock(line.timestampSec)}</span>
              <span className="truncate text-xs text-[#3e342c]">{line.text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-t border-[#eadfce] bg-[#ead9c2] py-2.5 text-center text-xs font-semibold text-[#3e342c] transition-colors hover:bg-[#e3d0b4]"
        >
          Xem chi tiết
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#3e342c]/20 p-4">
          <div className="flex max-h-[min(40rem,calc(100dvh-4rem))] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-[#efe4d4] bg-[#f6f0e6] shadow-[0_16px_40px_rgba(62,52,44,0.12)]">
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
              <h2 className="font-serif text-lg font-bold text-[#3e342c]">Bản ghi</h2>
              <div className="flex items-center gap-2">
                {!locked && onRegen && (
                  <button
                    type="button"
                    onClick={onRegen}
                    disabled={lines.length === 0}
                    className="h-8 rounded-full bg-[#ead9c2] px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    Sinh lại SOAP
                  </button>
                )}
                {!locked && onChange && (
                  <button
                    type="button"
                    onClick={() => setEditing((value) => !value)}
                    className={`h-8 rounded-full px-3 text-xs font-semibold ${
                      editing ? "bg-[#ead9c2]" : "border border-[#eadfce] bg-white"
                    }`}
                  >
                    {editing ? "Xong" : "Chỉnh sửa"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={close}
                  aria-label="Đóng"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[#eadfce] bg-white text-sm"
                >
                  ✕
                </button>
              </div>
            </header>
            <ul className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-4 pb-4">
              {lines.map((line) => (
                <li key={line.id} className={`rounded-xl px-3 py-2.5 ${line.speaker === "doctor" ? "bg-white" : "bg-[#efe4d4]"}`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-[#eadfce] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#5c4e42]">
                      {line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân"}
                    </span>
                    <span className="font-mono text-xs text-[#9a8674]">{range(line)}</span>
                  </div>
                  {editing ? (
                    <textarea
                      value={line.text}
                      aria-label={`Lời ${line.speaker === "doctor" ? "bác sĩ" : "bệnh nhân"}`}
                      onChange={(event) => update(line.id, event.target.value)}
                      className="mt-2 min-h-16 w-full resize-y rounded-lg border border-[#eadfce] bg-white px-2.5 py-2 text-sm leading-relaxed text-[#3e342c] outline-none"
                    />
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed text-[#3e342c]">{line.text}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

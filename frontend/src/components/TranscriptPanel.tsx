/**
 * TranscriptPanel — danh sách lời thoại trong khung Audio (sau khi có file).
 */

import type { TranscriptLine } from "@/types";

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export default function TranscriptPanel({ lines }: { lines: TranscriptLine[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden border border-[#c9bba8] bg-[#f4e6c8] p-2.5">
      <div className="flex items-center justify-between text-xs text-[#866e5a]">
        <span>Bản ghi</span>
        <span className="border border-[#c9bba8] bg-[#efe6d8] px-1.5 text-[10px] font-semibold text-[#3e342c]">STT ✓</span>
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {lines.map((line) => (
          <li key={line.id} className="grid grid-cols-[2.6rem_1.7rem_minmax(0,1fr)] items-start gap-2">
            <span className="font-mono text-[10px] text-[#b3a394]">{clock(line.timestampSec)}</span>
            <span className="border border-[#c9bba8] text-center text-[10px] text-[#866e5a]">
              {line.speaker === "doctor" ? "BS" : "BN"}
            </span>
            <span className="text-xs leading-snug text-[#3e342c]">{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

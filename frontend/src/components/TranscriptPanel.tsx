"use client";

/**
 * TranscriptPanel — mỗi dòng là một segment: vai, khoảng thời gian, lời nói.
 * Khung nhỏ là bản xem trước (cắt 2 dòng). Xem chi tiết hiện đủ và cho sửa.
 */

import { useState } from "react";
import { updateTranscriptSegment } from "@/lib/api";
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
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  function close() {
    if (isSaving) return;
    setEditing(false);
    setDraftTexts({});
    setEditError("");
    setOpen(false);
  }

  function startEditing() {
    const initial: Record<string, string> = {};
    for (const line of lines) {
      initial[line.id] = line.text;
    }
    setDraftTexts(initial);
    setEditError("");
    setEditing(true);
  }

  function cancelEditing() {
    setDraftTexts({});
    setEditError("");
    setEditing(false);
  }

  function handleTextChange(id: string, text: string) {
    setDraftTexts((prev) => ({ ...prev, [id]: text }));
    if (editError) setEditError("");
  }

  async function saveEdits() {
    // 1. Validation: Không cho phép content rỗng hoặc chỉ có khoảng trắng
    for (const line of lines) {
      const val = draftTexts[line.id] ?? line.text;
      if (!val || !val.trim()) {
        setEditError("Nội dung lời thoại không được để rỗng hoặc chỉ chứa khoảng trắng.");
        return;
      }
    }

    // 2. Tìm các segment có chỉnh sửa thực tế
    const changedLines = lines.filter((line) => {
      const currentVal = draftTexts[line.id];
      return currentVal !== undefined && currentVal !== line.text;
    });

    if (changedLines.length === 0) {
      setEditing(false);
      return;
    }

    setIsSaving(true);
    setEditError("");

    try {
      // 3. Gọi PATCH API cho từng segment thay đổi
      await Promise.all(
        changedLines.map((line) => updateTranscriptSegment(line.id, draftTexts[line.id]))
      );

      // 4. Cập nhật state lines
      const updatedLines = lines.map((line) => {
        const text = draftTexts[line.id];
        return text !== undefined ? { ...line, text } : line;
      });

      onChange?.(updatedLines);
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Lưu chỉnh sửa thất bại. Vui lòng thử lại.");
    } finally {
      setIsSaving(false);
    }
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
                {!editing && !locked && onRegen && (
                  <button
                    type="button"
                    onClick={onRegen}
                    disabled={lines.length === 0}
                    className="h-8 rounded-full bg-[#ead9c2] px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    Sinh lại nháp nhanh
                  </button>
                )}
                {!locked && onChange && !editing && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="h-8 rounded-full border border-[#eadfce] bg-white px-3 text-xs font-semibold hover:bg-[#f6f0e6]"
                  >
                    Chỉnh sửa
                  </button>
                )}
                {editing && (
                  <>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={isSaving}
                      className="h-8 rounded-full border border-[#eadfce] bg-white px-3 text-xs font-semibold disabled:opacity-50 hover:bg-[#f6f0e6]"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={saveEdits}
                      disabled={isSaving}
                      className="h-8 rounded-full bg-[#ead9c2] px-4 text-xs font-semibold disabled:opacity-50 hover:bg-[#e3d0b4]"
                    >
                      {isSaving ? "Đang lưu..." : "Lưu"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={close}
                  disabled={isSaving}
                  aria-label="Đóng"
                  className="grid h-8 w-8 place-items-center rounded-lg border border-[#eadfce] bg-white text-sm disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            </header>

            {editError && (
              <div className="mx-4 mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                ❌ {editError}
              </div>
            )}

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
                      value={draftTexts[line.id] ?? line.text}
                      aria-label={`Lời ${line.speaker === "doctor" ? "bác sĩ" : "bệnh nhân"}`}
                      onChange={(event) => handleTextChange(line.id, event.target.value)}
                      disabled={isSaving}
                      className="mt-2 min-h-16 w-full resize-y rounded-lg border border-[#eadfce] bg-white px-2.5 py-2 text-sm leading-relaxed text-[#3e342c] outline-none disabled:opacity-60"
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

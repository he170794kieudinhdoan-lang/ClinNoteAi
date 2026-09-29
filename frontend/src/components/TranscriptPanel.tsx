"use client";

/**
 * TranscriptPanel — mỗi dòng là một segment: vai, khoảng thời gian, lời nói.
 * variant=compact: bản xem trước. variant=panel: cột hội thoại của workspace.
 */

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { PanelLeftClose } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
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
  variant = "compact",
  onCollapse,
}: {
  lines: TranscriptLine[];
  locked?: boolean;
  onChange?: (lines: TranscriptLine[]) => void;
  onRegen?: () => void;
  variant?: "compact" | "panel";
  onCollapse?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
    if (variant === "compact") setOpen(true);
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

  const virtualizer = useVirtualizer({
    count: variant === "panel" ? lines.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 8,
    getItemKey: (index) => lines[index]?.id ?? index,
  });

  if (variant === "panel") {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
          <span className="text-[13.5px] font-bold">Transcript</span>
          <div className="flex items-center gap-1">
            {!locked && onRegen && !editing && (
              <button type="button" onClick={onRegen} disabled={lines.length === 0} className="h-7 rounded-md px-2 text-[11px] font-semibold text-muted hover:bg-white disabled:opacity-40">
                Sinh lại
              </button>
            )}
            {!locked && onChange && !editing && (
              <button type="button" onClick={startEditing} disabled={lines.length === 0} className="h-7 rounded-md px-2 text-[11px] font-semibold text-muted hover:bg-white disabled:opacity-40">
                Sửa
              </button>
            )}
            {editing && (
              <>
                <button type="button" onClick={cancelEditing} disabled={isSaving} className="h-7 rounded-md px-2 text-[11px] font-semibold text-muted hover:bg-white">
                  Hủy
                </button>
                <button type="button" onClick={saveEdits} disabled={isSaving} className="h-7 rounded-md bg-ink px-2.5 text-[11px] font-semibold text-white disabled:opacity-50">
                  {isSaving ? "…" : "Lưu"}
                </button>
              </>
            )}
            {onCollapse && (
              <button type="button" aria-label="Thu gọn transcript" onClick={onCollapse} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white">
                <PanelLeftClose size={15} />
              </button>
            )}
          </div>
        </header>
        {editError && <p className="border-b border-line bg-warn-bg px-3.5 py-2 text-xs text-danger">{editError}</p>}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          {lines.length === 0 && <p className="p-3.5 text-sm text-muted">Chưa có hội thoại.</p>}
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const line = lines[item.index];
              if (!line) return null;
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full px-3.5 pt-2.5"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <article className={`rounded-[10px] border px-3 py-2.5 ${line.speaker === "doctor" ? "border-line bg-subtle" : "border-line bg-white"}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${line.speaker === "doctor" ? "bg-white text-ink" : "bg-subtle text-muted"}`}>
                        {line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân"}
                      </span>
                      <span className="font-mono text-[10.5px] text-faint">{range(line)}</span>
                    </div>
                    {editing ? (
                      <TextareaAutosize
                        value={draftTexts[line.id] ?? line.text}
                        minRows={2}
                        aria-label={`Lời ${line.speaker === "doctor" ? "bác sĩ" : "bệnh nhân"}`}
                        onChange={(event) => handleTextChange(line.id, event.target.value)}
                        disabled={isSaving}
                        className="mt-1 w-full resize-none rounded-md border border-line bg-white px-2 py-1.5 text-[13px] leading-snug outline-none focus:border-ink"
                      />
                    ) : (
                      <p className="text-[13px] leading-snug text-ink">{line.text}</p>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-semibold text-ink">Bản ghi</span>
          <span className="text-[10px] tracking-wide text-faint">STT</span>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-line-soft overflow-x-hidden overflow-y-auto px-3">
          {lines.map((line) => (
            <li key={line.id} className="grid grid-cols-[1.5rem_2.35rem_minmax(0,1fr)] items-baseline gap-1.5 py-1.5">
              <span className={`text-[10px] font-semibold ${line.speaker === "doctor" ? "text-ink" : "text-[#a08b78]"}`}>
                {roleLabel(line.speaker)}
              </span>
              <span className="font-mono text-[10px] text-faint">{clock(line.timestampSec)}</span>
              <span className="truncate text-xs text-ink">{line.text}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-t border-line bg-ink py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-ink/90"
        >
          Xem chi tiết
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/20 p-4">
          <div className="flex max-h-[min(40rem,calc(100dvh-4rem))] w-[min(42rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-line bg-subtle shadow-[0_16px_40px_rgba(62,52,44,0.12)]">
            <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
              <h2 className="font-serif text-lg font-bold text-ink">Bản ghi</h2>
              <div className="flex items-center gap-2">
                {!editing && !locked && onRegen && (
                  <button
                    type="button"
                    onClick={onRegen}
                    disabled={lines.length === 0}
                    className="h-8 rounded-full bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Sinh lại nháp nhanh
                  </button>
                )}
                {!locked && onChange && !editing && (
                  <button
                    type="button"
                    onClick={startEditing}
                    className="h-8 rounded-full border border-line bg-white px-3 text-xs font-semibold hover:bg-subtle"
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
                      className="h-8 rounded-full border border-line bg-white px-3 text-xs font-semibold disabled:opacity-50 hover:bg-subtle"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={saveEdits}
                      disabled={isSaving}
                      className="h-8 rounded-full bg-ink px-4 text-xs font-semibold text-white disabled:opacity-50 hover:bg-ink/90"
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
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-white text-sm disabled:opacity-50"
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
                    <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân"}
                    </span>
                    <span className="font-mono text-xs text-faint">{range(line)}</span>
                  </div>
                  {editing ? (
                    <TextareaAutosize
                      value={draftTexts[line.id] ?? line.text}
                      minRows={2}
                      aria-label={`Lời ${line.speaker === "doctor" ? "bác sĩ" : "bệnh nhân"}`}
                      onChange={(event) => handleTextChange(line.id, event.target.value)}
                      disabled={isSaving}
                      className="mt-2 w-full resize-none rounded-lg border border-line bg-white px-2.5 py-2 text-sm leading-relaxed text-ink outline-none disabled:opacity-60"
                    />
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">{line.text}</p>
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

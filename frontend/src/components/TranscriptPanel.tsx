"use client";

/**
 * TranscriptPanel — mỗi dòng là một segment: vai, khoảng thời gian, lời nói.
 * variant=compact: bản xem trước. variant=panel: cột hội thoại của workspace.
 */

import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Mic, PanelLeftClose } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import TranscriptChat, { chatLinesFromTranscript } from "@/components/TranscriptChat";
import { updateTranscriptSegment } from "@/lib/api";
import { TranscriptSkeleton } from "@/components/Skeletons";
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
  loading = false,
  onChange,
  onRegen,
  variant = "compact",
  onCollapse,
}: {
  lines: TranscriptLine[];
  locked?: boolean;
  loading?: boolean;
  onChange?: (lines: TranscriptLine[]) => void;
  onRegen?: () => void;
  variant?: "compact" | "panel";
  onCollapse?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

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

  const virtualizer = useVirtualizer({
    count: variant === "panel" ? lines.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 8,
    getItemKey: (index) => lines[index]?.id ?? index,
  });

  if (loading && lines.length === 0) {
    return <TranscriptSkeleton variant={variant} onCollapse={onCollapse} />;
  }

  if (lines.length === 0) {
    if (variant === "compact") {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-subtle/50 p-4 text-center">
          <Mic size={20} className="text-muted/60" />
          <p className="mt-2 text-xs font-semibold text-ink">Chưa có bản ghi thoại</p>
          <p className="mt-0.5 text-[11px] text-muted">Tải file âm thanh để bóc băng</p>
        </div>
      );
    }

    return (
      <div data-guide="transcript" className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold">Hội thoại</span>
          </div>
          {onCollapse && (
            <button
              type="button"
              aria-label="Thu gọn hội thoại"
              onClick={onCollapse}
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-subtle text-muted shadow-xs ring-1 ring-line">
            <Mic size={22} className="text-muted" />
          </div>
          <h3 className="mt-3.5 text-sm font-bold text-ink">Chưa có bản ghi âm cuộc khám</h3>
          <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted">
            Tải lên tệp âm thanh hoặc ghi âm trực tiếp ở cột bên phải để hệ thống tự động bóc băng hội thoại và trích xuất dữ liệu lâm sàng.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-faint">
            <span className="rounded-md bg-subtle px-2 py-0.5 ring-1 ring-line-soft">.mp3</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 ring-1 ring-line-soft">.wav</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 ring-1 ring-line-soft">.m4a</span>
            <span className="rounded-md bg-subtle px-2 py-0.5 ring-1 ring-line-soft">Tối đa 100MB</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div data-guide="transcript" className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-bold">Hội thoại</span>
            {loading && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-line animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
                Đang xử lý…
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {!locked && onRegen && !editing && (
              <button type="button" onClick={onRegen} disabled={lines.length === 0} className="hidden h-7 rounded-md px-2 text-[11px] font-semibold text-muted hover:bg-white disabled:opacity-40">
                Sinh lại
              </button>
            )}
            {!locked && onChange && !editing && (
              <button type="button" onClick={startEditing} disabled={lines.length === 0} className="h-7 rounded-md px-2 text-[11px] font-semibold text-muted hover:bg-white disabled:opacity-40">
                Sửa
              </button>
            )}
            <button type="button" onClick={() => setDetailOpen(true)} disabled={lines.length === 0} className="h-7 rounded-md px-2 text-[11px] font-semibold text-ink hover:bg-white disabled:opacity-40">
              Xem chi tiết
            </button>
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
              <button type="button" aria-label="Thu gọn hội thoại" onClick={onCollapse} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-white">
                <PanelLeftClose size={15} />
              </button>
            )}
          </div>
        </header>
        {editError && <p className="border-b border-line bg-warn-bg px-3.5 py-2 text-xs text-danger">{editError}</p>}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
        {detailOpen && (
          <TranscriptChat lines={chatLinesFromTranscript(lines)} onClose={() => setDetailOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-semibold text-ink">Bản ghi</span>
          <span className="text-[10px] tracking-wide text-faint">Âm thanh</span>
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
          onClick={() => setDetailOpen(true)}
          className="border-t border-line bg-ink py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-ink/90"
        >
          Xem chi tiết
        </button>
      </div>
      {detailOpen && (
        <TranscriptChat lines={chatLinesFromTranscript(lines)} onClose={() => setDetailOpen(false)} />
      )}
    </>
  );
}

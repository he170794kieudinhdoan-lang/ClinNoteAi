"use client";

import { PanelLeftClose } from "lucide-react";

export function TranscriptSkeleton({
  variant = "panel",
  count = 8,
  onCollapse,
}: {
  variant?: "panel" | "compact" | "chat";
  count?: number;
  onCollapse?: () => void;
}) {
  if (variant === "compact") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white animate-pulse">
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-semibold text-ink">Bản ghi</span>
          <span className="text-[10px] tracking-wide text-faint">Đang đồng bộ…</span>
        </div>
        <div className="min-h-0 flex-1 divide-y divide-line-soft px-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[1.5rem_2.35rem_minmax(0,1fr)] items-center gap-1.5 py-2">
              <span className="h-3 w-5 rounded bg-line" />
              <span className="h-3 w-8 rounded bg-line/70" />
              <span
                className="h-3 rounded bg-line/80"
                style={{ width: `${60 + (index % 3) * 15}%` }}
              />
            </div>
          ))}
        </div>
        <div className="border-t border-line bg-subtle py-2.5 text-center text-xs font-semibold text-muted">
          Đang tải hội thoại…
        </div>
      </div>
    );
  }

  if (variant === "chat") {
    return (
      <div className="flex flex-col gap-3.5 p-4 animate-pulse">
        {Array.from({ length: count }).map((_, index) => {
          const isDoctor = index % 2 === 1;
          return (
            <div
              key={index}
              className={`flex items-end gap-2.5 ${isDoctor ? "flex-row-reverse" : "flex-row"}`}
            >
              <div className="h-8 w-8 shrink-0 rounded-full bg-line" />
              <div className={`flex max-w-[78%] flex-col gap-1 ${isDoctor ? "items-end" : "items-start"}`}>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-12 rounded bg-line/70" />
                  <span className="h-2.5 w-10 rounded bg-line/50" />
                </div>
                <div
                  className={`rounded-xl border p-3 ${
                    isDoctor ? "border-line bg-subtle" : "border-line bg-white"
                  }`}
                  style={{ width: `${180 + (index % 3) * 45}px` }}
                >
                  <div className="h-3.5 w-full rounded bg-line/80" />
                  <div className="mt-1.5 h-3.5 w-3/4 rounded bg-line/60" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // variant === "panel"
  return (
    <div data-guide="transcript" className="flex h-full min-h-0 flex-col bg-white">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-subtle px-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-bold">Hội thoại</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-medium text-muted ring-1 ring-line animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
            Đang xử lý âm thanh…
          </span>
        </div>
        <div className="flex items-center gap-1">
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
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5 animate-pulse">
        {Array.from({ length: count }).map((_, index) => {
          const isDoctor = index % 2 === 1;
          return (
            <article
              key={index}
              className={`rounded-[10px] border px-3 py-2.5 transition-colors ${
                isDoctor ? "border-line bg-subtle" : "border-line bg-white"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-12 rounded-full bg-line" />
                  <div className="h-3 w-8 rounded bg-line/60" />
                </div>
                <div className="h-3 w-14 rounded bg-line/50 font-mono" />
              </div>
              <div className="space-y-1.5">
                <div
                  className="h-3.5 rounded bg-line/80"
                  style={{ width: `${80 + (index % 4) * 5}%` }}
                />
                <div
                  className="h-3.5 rounded bg-line/60"
                  style={{ width: `${50 + (index % 3) * 15}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function SoapSkeleton({
  showHeader = false,
  statusText = "Đang trích xuất thông tin lâm sàng và tạo SOAP…",
  className = "",
}: {
  showHeader?: boolean;
  statusText?: string;
  className?: string;
}) {
  const sections = [
    { letter: "S", label: "Bệnh sử & triệu chứng cơ năng (Subjective)" },
    { letter: "O", label: "Thăm khám thực thể & dấu hiệu sinh tồn (Objective)" },
    { letter: "A", label: "Đánh giá & chẩn đoán sơ bộ (Assessment)" },
    { letter: "P", label: "Kế hoạch điều trị & đề xuất (Plan)" },
  ];

  return (
    <section className={`overflow-hidden rounded-2xl border border-line bg-white shadow-panel animate-pulse ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between border-b border-line bg-subtle px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
            <span className="text-xs font-bold text-ink">{statusText}</span>
          </div>
          <div className="h-4 w-20 rounded bg-line/70" />
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {statusText && !showHeader && (
          <div className="flex items-center gap-2 rounded-lg bg-accent-bg px-3 py-2 text-xs font-semibold text-accent">
            <span className="h-2 w-2 rounded-full bg-accent animate-ping" />
            <span>{statusText}</span>
          </div>
        )}

        {sections.map(({ letter, label }, index) => (
          <article key={letter} className="rounded-[10px] border border-line-soft bg-subtle p-3.5">
            <header className="mb-2.5 flex items-center gap-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-xs font-extrabold text-muted ring-1 ring-line">
                {letter}
              </span>
              <span className="text-[13.5px] font-extrabold text-ink/80">{label}</span>
            </header>

            <div className="min-h-20 rounded-lg border border-line bg-white p-3 space-y-2">
              <div
                className="h-3.5 rounded bg-line/80"
                style={{ width: `${85 + (index % 3) * 5}%` }}
              />
              <div
                className="h-3.5 rounded bg-line/65"
                style={{ width: `${70 + (index % 4) * 6}%` }}
              />
              <div
                className="h-3.5 rounded bg-line/50"
                style={{ width: `${40 + (index % 2) * 20}%` }}
              />
            </div>
          </article>
        ))}
      </div>

      <div className="border-t border-line-soft px-4 py-2.5 flex items-center justify-between text-[11px] text-muted">
        <span className="h-3 w-48 rounded bg-line/60" />
        <span className="h-3 w-24 rounded bg-line/40" />
      </div>
    </section>
  );
}

export function IcdSuggestSkeleton({
  count = 3,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`border-t border-line bg-white px-4 py-3 animate-pulse ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink">Gợi ý ICD-10</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
            Đang đối chiếu danh mục KCB…
          </span>
        </div>
        <div className="h-3 w-28 rounded bg-line/60" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-subtle px-2.5"
          >
            <div className="h-4.5 w-10 rounded bg-line font-mono" />
            <div
              className="h-3.5 rounded bg-line/75"
              style={{ width: `${70 + (index % 3) * 25}px` }}
            />
            <div className="h-3 w-8 rounded bg-line/50" />
          </div>
        ))}
        <div className="h-8 w-24 rounded-lg border border-dashed border-line bg-subtle/50" />
      </div>
    </div>
  );
}

export function IcdSearchItemSkeleton() {
  return (
    <div className="space-y-2 px-1 py-1 animate-pulse">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center justify-between rounded-lg px-2.5 py-2 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-14 rounded bg-line font-mono" />
            <div
              className="h-3.5 rounded bg-line/70"
              style={{ width: `${120 + (index % 3) * 40}px` }}
            />
          </div>
          <div className="h-3 w-10 rounded bg-line/40" />
        </div>
      ))}
    </div>
  );
}

export function PatientCardSkeleton() {
  return (
    <article className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-panel animate-pulse">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full border border-line bg-line" />
        <div className="min-w-0 space-y-1.5">
          <div className="h-4 w-32 rounded bg-line" />
          <div className="h-3 w-48 rounded bg-line/60" />
        </div>
      </div>
      <div className="h-6 w-16 rounded-full bg-line/60" />
    </article>
  );
}

export function EncounterPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      {/* Header */}
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-line bg-white px-3.5 sm:px-5 py-2 sm:py-0 animate-pulse">
        <div className="min-w-0 space-y-1">
          <div className="h-4 w-28 rounded bg-line" />
          <div className="h-3 w-44 rounded bg-line/60" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="h-8 w-28 rounded-lg bg-line/70" />
          <div className="h-8 w-24 rounded-lg bg-line" />
        </div>
      </header>

      {/* 3-column Layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left column: Transcript */}
        <div className="hidden md:block w-72 shrink-0 border-r border-line bg-white">
          <TranscriptSkeleton variant="panel" />
        </div>

        {/* Center column: SOAP Workspace */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3 sm:p-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
            <PatientCardSkeleton />
            <SoapSkeleton statusText="Đang tải dữ liệu lượt khám…" />
            <IcdSuggestSkeleton />
          </div>
        </div>

        {/* Right column: Audio & Attachments */}
        <div className="hidden lg:block w-64 shrink-0 border-l border-line bg-white animate-pulse">
          <div className="flex h-12 items-center border-b border-line bg-subtle px-3.5">
            <div className="h-4 w-24 rounded bg-line" />
          </div>
          <div className="p-3.5 space-y-3">
            <div className="h-28 rounded-xl border-2 border-dashed border-line bg-subtle flex flex-col items-center justify-center p-4">
              <div className="h-8 w-8 rounded-full bg-line/70 mb-2" />
              <div className="h-3 w-28 rounded bg-line/60" />
            </div>
            <div className="h-10 rounded-lg bg-line/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

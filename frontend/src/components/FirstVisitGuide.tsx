"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    key: "upload",
    title: "Tải file âm thanh",
    body: "Kéo thả hoặc chọn file ghi âm buổi khám. Đây là bước đầu, trước khi có hội thoại và ghi chú.",
  },
  {
    key: "transcript",
    title: "Hội thoại",
    body: "Bấm Xuất hội thoại. Lời bác sĩ và bệnh nhân sẽ hiện ở cột này.",
  },
  {
    key: "generate",
    title: "Tạo SOAP",
    body: "Khi đã có hội thoại, bấm Tạo SOAP để soạn ghi chú.",
  },
] as const;

export function firstVisitGuideKey(id: string) {
  return `clinnote-first-guide:${id}`;
}

export const FIRST_VISIT_GUIDE_HIDE = "clinnote-first-guide-hide";

export default function FirstVisitGuide({ onClose }: { onClose: (forever: boolean, finished: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [hideAgain, setHideAgain] = useState(false);
  const [box, setBox] = useState<DOMRect | null>(null);
  const item = STEPS[step];
  const last = step === STEPS.length - 1;

  useEffect(() => {
    function measure() {
      const node = document.querySelector(`[data-guide="${STEPS[step].key}"]`);
      const next = node?.getBoundingClientRect();
      setBox(next && next.width > 8 && next.height > 8 ? next : null);
    }
    measure();
    const frame = requestAnimationFrame(measure);
    const timer = window.setInterval(measure, 250);
    const stop = window.setTimeout(() => window.clearInterval(timer), 1500);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose(hideAgain, false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideAgain, onClose]);

  const card = cardPosition(box);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <div
        className="absolute rounded-xl border-2 border-ink"
        style={
          box
            ? {
                top: box.top - 6,
                left: box.left - 6,
                width: box.width + 12,
                height: box.height + 12,
                boxShadow: "0 0 0 9999px rgba(10, 10, 10, 0.45)",
              }
            : { inset: 0, border: "none", background: "rgba(10, 10, 10, 0.45)" }
        }
      />
      <section
        role="dialog"
        aria-labelledby="first-visit-title"
        className="pointer-events-auto absolute w-[min(18.5rem,calc(100vw-1.5rem))] rounded-md border border-line bg-white p-4"
        style={{ top: card.top, left: card.left }}
      >
        <p className="text-[11px] font-semibold text-muted">Bước {step + 1}/{STEPS.length}</p>
        <h2 id="first-visit-title" className="mt-1 text-[15px] font-extrabold tracking-tight">{item.title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{item.body}</p>
        <label className="mt-3 flex items-center gap-2 text-[12.5px] text-ink">
          <input
            type="checkbox"
            checked={hideAgain}
            onChange={(event) => setHideAgain(event.target.checked)}
            className="h-3.5 w-3.5 accent-ink"
          />
          Không hiển thị lại
        </label>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={() => onClose(hideAgain, false)} className="h-8 rounded-md px-2 text-xs font-semibold text-muted hover:bg-subtle">
            Bỏ qua
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose(hideAgain, true) : setStep((current) => current + 1))}
            className="h-8 rounded-md bg-ink px-3 text-xs font-semibold text-white"
          >
            {last ? "Xong" : "Tiếp"}
          </button>
        </div>
      </section>
    </div>
  );
}

function cardPosition(box: DOMRect | null) {
  const width = 296;
  const height = 220;
  if (!box || typeof window === "undefined") {
    return { top: 24, left: 24 };
  }
  const gap = 14;
  let left = box.left - width - gap;
  if (left < 12) left = box.right + gap;
  if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
  let top = box.top;
  if (top + height > window.innerHeight - 12) top = Math.max(12, window.innerHeight - height - 12);
  return { top, left };
}

"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import type { ClinicalAtomicProposition, SoapContent, SoapItem, SoapSectionKey, SoapTranscript } from "@/types/soap";
import { SOAP_SECTIONS } from "@/types/soap";

function newItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `reviewer-${crypto.randomUUID()}`
    : `reviewer-${Date.now()}`;
}

function clock(ms: number | null | undefined) {
  if (ms == null) return "";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function speakerLabel(speaker: string | null | undefined) {
  if (speaker === "clinician" || speaker === "doctor") return "Bác sĩ";
  if (speaker === "patient") return "Bệnh nhân";
  return speaker ? "Vai chưa rõ" : "Nguồn";
}

function sourcesFor(item: SoapItem, caps: ClinicalAtomicProposition[], transcript?: SoapTranscript) {
  const turns = transcript?.turns ?? [];
  const rows: { speaker: string; time: string; quote: string }[] = [];
  for (const cap of caps.filter((entry) => item.cap_ids.includes(entry.prop_id))) {
    for (const evidence of cap.evidence ?? []) {
      const turn = turns.find((entry) => entry.turn_id === evidence.turn_id);
      const quote = evidence.quote || turn?.text || "";
      if (!quote) continue;
      rows.push({
        speaker: speakerLabel(evidence.speaker ?? turn?.speaker),
        time: clock(evidence.start_ms ?? turn?.start_ms),
        quote,
      });
    }
  }
  return rows;
}

export default function SoapReviewPanel({
  soap,
  caps,
  transcript,
  readOnly,
  onSoap,
  onSelectEvidence,
}: {
  soap: SoapContent;
  caps: ClinicalAtomicProposition[];
  transcript?: SoapTranscript;
  readOnly: boolean;
  revisionNumber: number;
  revisionStatus: string;
  onSoap: (soap: SoapContent) => void;
  onSelectEvidence: (item: SoapItem) => void;
}) {
  const allItems = SOAP_SECTIONS.flatMap(({ key }) => soap[key]?.items ?? []);
  const bulkReviewCount = allItems.filter(
    (item) => item.origin !== "reviewer" && item.cap_ids.length > 0 && item.source_link_status === "valid" && item.support_status === "pending",
  ).length;

  function updateItem(sectionKey: SoapSectionKey, itemId: string, change: Partial<SoapItem>, contentChanged = false) {
    const currentSection = soap[sectionKey];
    const nextItems = currentSection.items.map((item) => {
      if (item.item_id !== itemId) return item;
      const next = { ...item, ...change };
      if (contentChanged) {
        next.origin = "reviewer";
        next.review_status = "needs_review";
        next.source_link_status = "invalid";
        next.support_status = next.cap_ids.length > 0 ? "pending" : "unsupported";
      }
      if (next.cap_ids.length === 0) next.support_status = "unsupported";
      return next;
    });
    onSoap({ ...soap, [sectionKey]: { ...currentSection, items: nextItems } });
  }

  function removeItem(sectionKey: SoapSectionKey, itemId: string) {
    const currentSection = soap[sectionKey];
    const items = currentSection.items.filter((item) => item.item_id !== itemId);
    onSoap({ ...soap, [sectionKey]: { ...currentSection, items, missing: items.length === 0 ? true : currentSection.missing } });
  }

  function addManualItem(sectionKey: SoapSectionKey) {
    const currentSection = soap[sectionKey];
    const item: SoapItem = {
      item_id: newItemId(),
      text: "",
      cap_ids: [],
      origin: "reviewer",
      review_status: "needs_review",
      source_link_status: "invalid",
      support_status: "unsupported",
      manual_reason: "",
    };
    onSoap({ ...soap, [sectionKey]: { items: [...currentSection.items, item], missing: false } });
    onSelectEvidence(item);
  }

  function confirmSupportedItems() {
    if (bulkReviewCount === 0 || !window.confirm(`Đánh dấu ${bulkReviewCount} câu có nguồn hợp lệ là đã được hỗ trợ? Hãy chỉ xác nhận sau khi đã đọc các trích dẫn.`)) return;
    const next = { ...soap };
    for (const { key } of SOAP_SECTIONS) {
      next[key] = {
        ...soap[key],
        items: soap[key].items.map((item) =>
          item.origin !== "reviewer" && item.cap_ids.length > 0 && item.source_link_status === "valid" && item.support_status === "pending"
            ? { ...item, support_status: "supported", review_status: "reviewed" }
            : item,
        ),
      };
    }
    onSoap(next);
    toast.success(`Đã xác nhận ${bulkReviewCount} câu`);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
      <div className="flex flex-col gap-3.5 px-4 py-4 sm:px-5">
        {SOAP_SECTIONS.map(({ key, label, description }) => {
          const section = soap[key];
          return (
            <article key={key} className="rounded-[10px] bg-subtle px-3.5 py-3">
              <header className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-[13px] font-extrabold text-ink ring-1 ring-line">{key}</span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-extrabold">{label}</span>
                  <span className="block text-[11px] text-muted">{description}</span>
                </span>
                {!readOnly && (
                  <button type="button" onClick={() => addManualItem(key)} className="ml-auto shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-ink ring-1 ring-line hover:bg-canvas">
                    + Add line
                  </button>
                )}
              </header>

              {section.items.length === 0 && (
                <p className="rounded-lg border border-dashed border-line bg-white px-3 py-3 text-xs text-muted">
                  {section.missing ? "Chưa có thông tin trong hội thoại." : "Chưa có câu trong phần này."}
                </p>
              )}

              <ul className="flex flex-col gap-1.5">
                {section.items.map((item, index) => {
                  const sources = sourcesFor(item, caps, transcript);
                  const manualOnly = item.origin === "reviewer" && item.cap_ids.length === 0;
                  return (
                    <li key={item.item_id} className="flex items-start gap-1.5 text-[13px] leading-snug">
                      <span className="mt-1 select-none font-black text-ink" aria-hidden>•</span>
                      <TextareaAutosize
                        aria-label={`${label}, câu ${index + 1}`}
                        value={item.text}
                        readOnly={readOnly}
                        minRows={1}
                        onChange={(event) => updateItem(key, item.item_id, { text: event.target.value }, true)}
                        placeholder="Nhập nội dung đã đối chiếu."
                        className="min-h-6 flex-1 resize-none rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] leading-snug outline-none hover:border-line hover:bg-white focus:border-ink focus:bg-white read-only:hover:border-transparent"
                      />
                      {sources.length > 0 && (
                        <EvidenceHint sources={sources} onOpen={() => onSelectEvidence(item)} />
                      )}
                      {!readOnly && (
                        <button type="button" aria-label="Xóa câu" onClick={() => removeItem(key, item.item_id)} className="mt-0.5 px-1 text-[11px] text-faint hover:text-ink">
                          ×
                        </button>
                      )}
                      {manualOnly && (
                        <span className="mt-1 shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9.5px] font-bold text-muted ring-1 ring-line">Thủ công</span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {section.items.some((item) => item.origin === "reviewer" && item.cap_ids.length === 0) && (
                <div className="mt-2 space-y-1.5">
                  {section.items.filter((item) => item.origin === "reviewer" && item.cap_ids.length === 0).map((item) => (
                    <label key={`${item.item_id}-reason`} className="block text-[11px] text-muted">
                      Lý do bổ sung thủ công
                      <input
                        value={item.manual_reason ?? ""}
                        readOnly={readOnly}
                        onChange={(event) => updateItem(key, item.item_id, { manual_reason: event.target.value, origin: "reviewer", review_status: "needs_review", support_status: "unsupported" })}
                        placeholder="Nguồn ngoài transcript"
                        className="mt-1 h-8 w-full rounded-lg border border-line bg-white px-2 text-xs outline-none focus:border-ink"
                      />
                    </label>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!readOnly && bulkReviewCount > 0 && (
        <div className="border-t border-line-soft px-4 py-2.5 sm:px-5">
          <button type="button" onClick={confirmSupportedItems} className="text-[11.5px] font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
            Xác nhận {bulkReviewCount} câu đã có nguồn
          </button>
        </div>
      )}
    </section>
  );
}

function EvidenceHint({
  sources,
  onOpen,
}: {
  sources: { speaker: string; time: string; quote: string }[];
  onOpen: () => void;
}) {
  return (
    <HoverCard.Root openDelay={180} closeDelay={120}>
      <HoverCard.Trigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-ink ring-1 ring-line hover:bg-ink hover:text-white"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Nguồn{sources.length > 1 ? ` · ${sources.length}` : ""}
        </button>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-80 rounded-2xl bg-ink px-3 py-2.5 text-white shadow-[0_12px_28px_rgb(28_31_35/0.28)]"
        >
          <p className="border-b border-white/15 pb-1 text-[10.5px] font-bold text-white/70">
            Transcript{sources.length > 1 ? ` · ${sources.length} nguồn` : ""}
          </p>
          <div className="mt-1.5 max-h-64 space-y-2 overflow-auto">
            {sources.slice(0, 4).map((source, index) => (
              <div key={`${source.time}-${index}`}>
                <p className="text-[11px] font-bold text-white/80">
                  {source.speaker}{source.time ? ` · ${source.time}` : ""}
                </p>
                <p className="text-[11.5px] leading-snug text-white/95 italic">“{source.quote}”</p>
              </div>
            ))}
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

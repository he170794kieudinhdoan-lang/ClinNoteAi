"use client";

import type { ClinicalAtomicProposition, SoapContent, SoapItem, SoapSectionKey, SoapSupportStatus } from "@/types/soap";
import { SOAP_SECTIONS } from "@/types/soap";

const SUPPORT_LABEL: Record<SoapSupportStatus, string> = {
  pending: "Chưa review",
  supported: "Được nguồn hỗ trợ",
  partial: "Hỗ trợ một phần",
  unsupported: "Chưa được hỗ trợ",
  conflicting: "Nguồn mâu thuẫn",
};

function newItemId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `reviewer-${crypto.randomUUID()}`
    : `reviewer-${Date.now()}`;
}

export default function SoapReviewPanel({
  soap,
  caps,
  readOnly,
  revisionNumber,
  revisionStatus,
  onSoap,
  onSelectEvidence,
}: {
  soap: SoapContent;
  caps: ClinicalAtomicProposition[];
  readOnly: boolean;
  revisionNumber: number;
  revisionStatus: string;
  onSoap: (soap: SoapContent) => void;
  onSelectEvidence: (item: SoapItem) => void;
}) {
  const allItems = SOAP_SECTIONS.flatMap(({ key }) => soap[key]?.items ?? []);
  const pendingCount = allItems.filter((item) => item.support_status === "pending" || item.review_status === "needs_review").length;
  const unsupportedCount = allItems.filter((item) => item.support_status === "partial" || item.support_status === "unsupported" || item.support_status === "conflicting").length;
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
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#eadfce] bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0e7dc] px-4 py-3">
        <div>
          <h2 className="text-sm font-bold">Review SOAP</h2>
          <p className="mt-0.5 text-xs text-[#866e5a]">
            Revision {revisionNumber} · {revisionStatus === "approved" || revisionStatus === "final" ? "đã duyệt, chỉ đọc" : "bản nháp"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-[#eadfce] bg-[#fffdf9] px-2.5 py-1">{pendingCount} cần review</span>
          <span className="rounded-full border border-[#eadfce] bg-[#fffdf9] px-2.5 py-1">{unsupportedCount} cần xử lý</span>
        </div>
      </header>

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0e7dc] bg-[#fffaf0] px-4 py-2.5">
          <p className="text-xs text-[#72563d]">Chọn một câu để mở CAP và lời thoại nguồn. Sửa nội dung sẽ xóa trạng thái review trước đó.</p>
          <button
            type="button"
            onClick={confirmSupportedItems}
            disabled={bulkReviewCount === 0}
            className="h-8 rounded-lg border border-[#d9c5a4] bg-white px-3 text-xs font-semibold text-[#5c4e42] hover:bg-[#f6f0e6] disabled:opacity-50"
          >
            Xác nhận các câu có nguồn hợp lệ ({bulkReviewCount})
          </button>
        </div>
      )}

      <div className="grid gap-3 p-3 xl:grid-cols-2">
        {SOAP_SECTIONS.map(({ key, label, description }) => {
          const section = soap[key];
          return (
            <article key={key} className="flex min-w-0 flex-col rounded-xl border border-[#efe4d4] bg-[#fffdf9]">
              <header className="flex items-start justify-between gap-3 border-b border-[#f0e7dc] px-3 py-2.5">
                <div className="flex gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ead9c2] text-sm font-bold">{key}</span>
                  <span>
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-[#866e5a]">{description}</span>
                  </span>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] ${section.missing ? "bg-[#f6f0e6] text-[#866e5a]" : "bg-[#e4f0e7] text-[#3c6246]"}`}>
                  {section.missing ? "Thiếu dữ liệu trong hội thoại" : `${section.items.length} câu`}
                </span>
              </header>

              <div className="space-y-2.5 p-3">
                {section.items.map((item, index) => {
                  const manualOnly = item.origin === "reviewer" && item.cap_ids.length === 0;
                  return (
                    <article
                      key={item.item_id}
                      className="overflow-hidden rounded-xl border border-[#e7dccc] bg-white"
                    >
                      <button type="button" onClick={() => onSelectEvidence(item)} className="flex w-full items-center justify-between gap-2 px-3 pt-2.5 text-left">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#866e5a]">Câu {index + 1} · {item.origin === "ai" ? "AI" : "người review"}</span>
                        <span className="flex flex-wrap justify-end gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.source_link_status === "valid" ? "bg-[#e4f0e7] text-[#3c6246]" : "bg-[#f7ebde] text-[#8b5c2f]"}`}>
                            Nguồn {item.source_link_status === "valid" ? "liên kết hợp lệ" : "cần kiểm tra"}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] ${item.support_status === "supported" ? "bg-[#e4f0e7] text-[#3c6246]" : "bg-[#f4ecda] text-[#72563d]"}`}>
                            {SUPPORT_LABEL[item.support_status]}
                          </span>
                        </span>
                      </button>

                      <div className="px-3 pb-3 pt-2">
                        <textarea
                          aria-label={`${label}, câu ${index + 1}`}
                          value={item.text}
                          readOnly={readOnly}
                          onFocus={() => onSelectEvidence(item)}
                          onChange={(event) => updateItem(key, item.item_id, { text: event.target.value }, true)}
                          placeholder="Nhập nội dung ngắn, chỉ giữ thông tin đã đối chiếu."
                          rows={2}
                          className="w-full resize-y rounded-lg border border-[#eadfce] bg-[#fffefa] px-3 py-2 text-sm leading-6 outline-none focus:border-[#b5945e] read-only:bg-[#faf7f2]"
                        />

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="text-[10px] font-semibold text-[#72563d]" htmlFor={`${item.item_id}-support`}>Đánh giá nguồn</label>
                          <select
                            id={`${item.item_id}-support`}
                            value={item.support_status}
                            disabled={readOnly || manualOnly || item.source_link_status !== "valid"}
                            onChange={(event) => {
                              const supportStatus = event.target.value as SoapSupportStatus;
                              updateItem(key, item.item_id, {
                                support_status: supportStatus,
                                review_status: supportStatus === "supported" ? "reviewed" : "needs_review",
                              });
                            }}
                            className="h-8 rounded-lg border border-[#eadfce] bg-white px-2 text-xs outline-none disabled:opacity-70"
                          >
                            {Object.entries(SUPPORT_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                          </select>
                          <span className={`text-[10px] ${item.review_status === "reviewed" ? "text-[#4e7757]" : "text-[#99623b]"}`}>
                            {item.review_status === "reviewed" ? "Quyết định đã lưu trên item" : "Cần quyết định review"}
                          </span>
                          {!readOnly && (
                            <button type="button" onClick={() => removeItem(key, item.item_id)} className="ml-auto text-[11px] text-[#99623b] underline underline-offset-2">
                              Xóa câu
                            </button>
                          )}
                        </div>

                        {!manualOnly && item.source_link_status !== "valid" && (
                          <p className="mt-1 text-[10px] text-[#99623b]">Lưu nội dung sửa trước; sau đó kiểm tra lại nguồn trên revision mới rồi mới xác nhận hỗ trợ.</p>
                        )}

                        {manualOnly && (
                          <div className="mt-2 text-[11px] text-[#72563d]">
                            <label className="block">
                              Lý do bổ sung thủ công (bắt buộc)
                              <textarea
                                value={item.manual_reason ?? ""}
                                readOnly={readOnly}
                                onChange={(event) => updateItem(key, item.item_id, { manual_reason: event.target.value, origin: "reviewer", review_status: "needs_review", support_status: "unsupported" })}
                                placeholder="Ghi rõ thông tin được bổ sung từ đâu và vì sao cần có."
                                rows={2}
                                className="mt-1 w-full resize-y rounded-lg border border-[#eadfce] bg-[#fffefa] px-3 py-2 text-xs leading-5 outline-none focus:border-[#b5945e] read-only:bg-[#faf7f2]"
                              />
                            </label>
                            {!readOnly && (
                              <button
                                type="button"
                                disabled={!item.text.trim() || !item.manual_reason?.trim()}
                                onClick={() => updateItem(key, item.item_id, { review_status: "reviewed", support_status: "unsupported" })}
                                className="mt-2 h-8 rounded-lg border border-[#d9c5a4] bg-[#fffaf0] px-3 text-[11px] font-semibold disabled:opacity-50"
                              >
                                Xác nhận nội dung thủ công
                              </button>
                            )}
                            <span className="mt-1 block text-[10px]">Nội dung này không được đánh dấu là có bằng chứng từ transcript.</span>
                          </div>
                        )}

                        <fieldset className="mt-3">
                          <legend className="mb-1.5 text-[10px] font-semibold text-[#72563d]">CAP nguồn · chọn một hoặc nhiều</legend>
                          {caps.length === 0 ? (
                            <p className="rounded-lg bg-[#f6f0e6] px-2.5 py-2 text-[11px] text-[#866e5a]">Chưa có CAP. Câu không có nguồn cần được ghi là bổ sung thủ công và nêu lý do.</p>
                          ) : (
                            <div className="max-h-36 space-y-1 overflow-auto rounded-lg border border-[#f0e7dc] bg-[#fffefa] p-2">
                              {caps.map((cap) => {
                                const checked = item.cap_ids.includes(cap.prop_id);
                                const superseded = cap.resolution_status === "superseded";
                                return (
                                  <label key={cap.prop_id} className={`flex gap-2 rounded-md px-1.5 py-1 text-[11px] ${superseded ? "text-[#9a8674]" : "text-[#5c4e42]"}`}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={readOnly || superseded}
                                      onChange={(event) => {
                                        const capIds = event.target.checked
                                          ? [...item.cap_ids, cap.prop_id]
                                          : item.cap_ids.filter((id) => id !== cap.prop_id);
                                        updateItem(key, item.item_id, { cap_ids: capIds, manual_reason: capIds.length > 0 ? null : item.manual_reason }, true);
                                      }}
                                    />
                                    <span className="min-w-0">
                                      <span className="font-mono">{cap.prop_id}</span> · {cap.proposition_text}
                                      {superseded && <span className="ml-1 text-[#99623b]">(đã được đính chính)</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </fieldset>
                      </div>
                    </article>
                  );
                })}

                {section.items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-[#d9cbb9] px-3 py-4 text-center text-xs text-[#866e5a]">
                    {section.missing ? "Chưa có thông tin trong hội thoại." : "Chưa có câu SOAP trong phần này."}
                  </p>
                )}
                {!readOnly && (
                  <button type="button" onClick={() => addManualItem(key)} className="h-8 rounded-lg border border-dashed border-[#c9bba8] px-3 text-xs font-medium text-[#6d5c4e] hover:bg-[#f6f0e6]">
                    + Thêm câu review
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

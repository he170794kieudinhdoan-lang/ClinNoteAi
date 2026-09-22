"use client";

/**
 * Cột phải Clinical Editor: 4 ô SOAP + gợi ý ICD-10.
 * Ô trống khi chưa có audio. Có chữ thì bác sĩ sửa được, tới khi duyệt.
 */

import { useEffect, useState } from "react";
import { ICD_CODE, searchIcd } from "@/lib/icdCatalog";
import type { IcdSuggestion, SoapNote } from "@/types";

const FIELDS = [
  ["subjective", "S", "Chủ quan"],
  ["objective", "O", "Khách quan"],
  ["assessment", "A", "Đánh giá"],
  ["plan", "P", "Kế hoạch"],
] as const;

export default function SoapEditor({
  soap,
  suggestions,
  selectedIcd,
  showIcd,
  locked,
  onSoap,
  onSelect,
  onSuggestions,
  onRegen,
}: {
  soap: SoapNote;
  suggestions: IcdSuggestion[];
  selectedIcd?: string;
  showIcd: boolean;
  locked?: boolean;
  onSoap: (soap: SoapNote) => void;
  onSelect: (code: string) => void;
  onSuggestions: (items: IcdSuggestion[]) => void;
  onRegen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = suggestions.some((item) => item.code === selectedIcd) ? selectedIcd : suggestions[0]?.code;
  const results = searchIcd(query, suggestions);
  const typed = query.trim().toUpperCase();
  const manual = ICD_CODE.test(typed) && !results.some((item) => item.code === typed);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(item: IcdSuggestion) {
    onSelect(item.code);
    if (!suggestions.some((current) => current.code === item.code)) onSuggestions([...suggestions, item]);
    setQuery("");
    setOpen(false);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#efe4d4] bg-[#fffdf9] shadow-sm">
      <header className="flex items-center gap-3.5 border-b border-[#f3eadf] px-3.5 py-2">
        <h2 className="text-sm font-bold">Ghi chú SOAP</h2>
        <div className="flex gap-1" aria-label="Tiến độ SOAP">
          {FIELDS.map(([key, letter]) => {
            const done = Boolean(soap[key].trim());
            return (
              <span
                key={key}
                className={`grid h-4 w-5 place-items-center rounded text-[10px] ${
                  done ? "bg-[#3e342c] text-white" : "border border-[#eadfce] bg-white text-[#866e5a]"
                }`}
              >
                {letter}
              </span>
            );
          })}
        </div>
        {!locked && onRegen && (
          <button type="button" onClick={onRegen} className="ml-auto h-7 rounded-full bg-[#ead9c2] px-3 text-[11px] font-semibold hover:bg-[#e3d0b4]">
            Sinh lại từ bản ghi
          </button>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 sm:grid-rows-2">
        {FIELDS.map(([key, letter, name]) => {
          const value = soap[key];
          const filled = Boolean(value.trim());
          return (
            <article key={key} className="flex min-h-36 flex-col overflow-hidden rounded-xl border border-[#eadfce]">
              <header className="flex items-center gap-2 border-b border-[#f3eadf] px-2.5 py-1.5">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full text-xs font-bold ${
                    filled ? "bg-[#3e342c] text-white" : "border border-[#eadfce] bg-white"
                  }`}
                >
                  {letter}
                </span>
                <span className="text-xs font-bold">{name}</span>
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col">
                <textarea
                  value={value}
                  readOnly={locked}
                  aria-label={name}
                  placeholder="Viết ghi chú..."
                  onChange={(event) => onSoap({ ...soap, [key]: event.target.value })}
                  className="min-h-16 w-full flex-1 resize-none bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_27px,#eadfce_27px,#eadfce_28px)] bg-local px-3 py-0 text-sm leading-7 text-[#3e342c] outline-none placeholder:text-[#c9bba8]"
                />
              </div>
            </article>
          );
        })}
      </div>

      {showIcd && (
        <div className="flex flex-col gap-2 border-t border-[#f3eadf] bg-[#f6f0e6] px-3.5 py-2.5">
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-xs font-bold">Gợi ý ICD-10</h3>
            <span className="text-[11px] text-[#866e5a]">từ Đánh giá</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((item) => {
              const on = item.code === selected;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => onSelect(item.code)}
                  disabled={locked}
                  className={`inline-flex h-7 max-w-full items-center gap-2 rounded-full border border-[#eadfce] px-2.5 text-[11px] ${
                    on ? "bg-[#e7d8c0] font-semibold" : "bg-white hover:bg-[#f6f0e6]"
                  }`}
                >
                  {on && <span aria-hidden>✓</span>}
                  <span className="font-mono">{item.code}</span>
                  <span className="max-w-40 truncate">{item.title}</span>
                  {item.confidence != null && <span className="text-[10px] font-normal text-[#866e5a]">{item.confidence}%</span>}
                </button>
              );
            })}
            {!locked && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-7 items-center rounded-full border border-dashed border-[#eadfce] bg-white px-2.5 text-[11px] text-[#866e5a] hover:bg-[#f6f0e6]"
              >
                + Tìm mã
              </button>
            )}
          </div>
        </div>
      )}
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-[#3e342c]/20 p-4"
          onMouseDown={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Tìm mã ICD-10"
            onMouseDown={(event) => event.stopPropagation()}
            className="flex max-h-[min(32rem,calc(100dvh-4rem))] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[22px] border border-[#efe4d4] bg-[#f6f0e6] text-[#3e342c] shadow-[0_16px_40px_rgba(62,52,44,0.12)]"
          >
            <header className="flex items-center justify-between px-4 py-3">
              <h3 className="font-serif text-lg font-bold">Tìm mã ICD-10</h3>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-[#eadfce] bg-white text-sm hover:bg-[#f6f0e6]"
              >
                ✕
              </button>
            </header>
            <div className="px-4">
              <input
                autoFocus
                value={query}
                aria-label="Tìm mã hoặc tên bệnh"
                placeholder="Mã hoặc tên bệnh, ví dụ khớp gối"
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#eadfce] bg-white px-3 text-sm outline-none"
              />
            </div>
            <ul className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
              {query.trim() === "" && <li className="px-2 pb-1 text-[11px] text-[#9a8674]">Gợi ý cho lượt khám này</li>}
              {results.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[#fffdf9]"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold">{item.code}</span>
                    <span>{item.title}</span>
                  </button>
                </li>
              ))}
              {manual && (
                <li>
                  <button
                    type="button"
                    onClick={() => choose({ code: typed, title: "Mã nhập tay" })}
                    className="flex w-full items-baseline gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[#fffdf9]"
                  >
                    <span className="w-16 shrink-0 font-mono text-xs font-semibold">{typed}</span>
                    <span>Dùng mã này</span>
                  </button>
                </li>
              )}
              {results.length === 0 && !manual && (
                <li className="px-2 py-6 text-center text-sm text-[#9a8674]">Không thấy mã phù hợp</li>
              )}
            </ul>
          </div>
        </div>
      )}
      <p className="border-t border-[#f3eadf] px-3.5 py-2 text-[11px] text-[#866e5a]">
        AI có thể sai, hãy kiểm tra lại kĩ trước khi bấm xác nhận.
      </p>
    </section>
  );
}

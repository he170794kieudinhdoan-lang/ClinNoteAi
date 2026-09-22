"use client";

/**
 * Cột phải Clinical Editor: 4 ô SOAP + gợi ý ICD-10.
 * Ô trống khi chưa có audio. Có chữ thì bác sĩ sửa được, tới khi duyệt.
 */

import { FormEvent, useState } from "react";
import type { IcdSuggestion, SoapNote } from "@/types";

const FIELDS = [
  ["subjective", "S", "Chủ quan"],
  ["objective", "O", "Khách quan"],
  ["assessment", "A", "Đánh giá"],
  ["plan", "P", "Kế hoạch"],
] as const;

const ICD_CODE = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;

export default function SoapEditor({
  soap,
  suggestions,
  selectedIcd,
  showIcd,
  locked,
  onSoap,
  onSelect,
  onSuggestions,
}: {
  soap: SoapNote;
  suggestions: IcdSuggestion[];
  selectedIcd?: string;
  showIcd: boolean;
  locked?: boolean;
  onSoap: (soap: SoapNote) => void;
  onSelect: (code: string) => void;
  onSuggestions: (items: IcdSuggestion[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const selected = suggestions.some((item) => item.code === selectedIcd) ? selectedIcd : suggestions[0]?.code;

  function addCode(event: FormEvent) {
    event.preventDefault();
    const code = query.trim().toUpperCase();
    if (!ICD_CODE.test(code)) {
      setError("Mã ICD-10 chưa đúng.");
      return;
    }
    setError("");
    setQuery("");
    setAdding(false);
    onSelect(code);
    if (!suggestions.some((item) => item.code === code)) {
      onSuggestions([...suggestions, { code, title: "Mã thủ công" }]);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col border border-[#c9bba8] bg-[#fffdf8]">
      <header className="flex items-center gap-3.5 border-b border-[#c9bba8] bg-[#efe6d8] px-3.5 py-2">
        <h2 className="text-sm font-bold">Ghi chú SOAP</h2>
        <div className="flex gap-0.5" aria-label="Tiến độ SOAP">
          {FIELDS.map(([key, letter]) => {
            const done = Boolean(soap[key].trim());
            return (
              <span
                key={key}
                className={`grid h-4 w-5 place-items-center border text-[10px] ${
                  done ? "border-[#3e342c] bg-[#3e342c] text-[#fffdf8]" : "border-[#c9bba8] bg-[#fffdf8] text-[#866e5a]"
                }`}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 sm:grid-rows-2">
        {FIELDS.map(([key, letter, name]) => {
          const value = soap[key];
          const filled = Boolean(value.trim());
          const source = soap.sources?.[key];
          return (
            <article key={key} className="flex min-h-36 flex-col border border-[#c9bba8]">
              <header className="flex items-center gap-2 border-b border-[#c9bba8] px-2.5 py-1.5">
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border text-xs font-bold ${
                    filled ? "border-[#3e342c] bg-[#3e342c] text-[#fffdf8]" : "border-[#c9bba8] bg-[#fffdf8]"
                  }`}
                >
                  {letter}
                </span>
                <span className="text-xs font-bold">{name}</span>
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col p-2.5">
                {!value && (
                  <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-[#b3a394]">—</span>
                )}
                <textarea
                  value={value}
                  readOnly={locked}
                  aria-label={name}
                  onChange={(event) => onSoap({ ...soap, [key]: event.target.value })}
                  className="min-h-16 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
                />
                {source && filled && <p className="pt-1 text-[10px] text-[#866e5a]">↳ {source}</p>}
              </div>
            </article>
          );
        })}
      </div>

      {showIcd && (
        <div className="flex flex-col gap-2 border-t border-[#c9bba8] bg-[#f3ece1] px-3.5 py-2.5">
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
                  className={`inline-flex h-7 max-w-full items-center gap-2 rounded-full border border-[#c9bba8] px-2.5 text-[11px] ${
                    on ? "bg-[#e4d5bc] font-bold" : "bg-[#fffdf8] hover:bg-[#efe6d8]"
                  }`}
                >
                  {on && <span aria-hidden>✓</span>}
                  <span className="font-mono">{item.code}</span>
                  <span className="max-w-40 truncate">{item.title}</span>
                  {item.confidence != null && <span className="text-[10px] font-normal text-[#866e5a]">{item.confidence}%</span>}
                </button>
              );
            })}
            {!locked &&
              (adding ? (
                <form onSubmit={addCode} className="inline-flex h-7 items-center rounded-full border border-dashed border-[#c9bba8] bg-[#fffdf8] px-2">
                  <input
                    value={query}
                    autoFocus
                    aria-label="Mã ICD-10"
                    placeholder="J06.9"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setAdding(false);
                        setError("");
                      }
                    }}
                    className="w-16 bg-transparent font-mono text-[11px] outline-none placeholder:font-sans"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="inline-flex h-7 items-center rounded-full border border-dashed border-[#c9bba8] bg-[#fffdf8] px-2.5 text-[11px] text-[#866e5a] hover:bg-[#efe6d8]"
                >
                  + Tìm mã
                </button>
              ))}
          </div>
          {error && <p className="text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}

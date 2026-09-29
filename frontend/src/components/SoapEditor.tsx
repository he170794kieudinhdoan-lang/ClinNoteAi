"use client";

/**
 * Cột phải Clinical Editor: 4 ô SOAP + gợi ý ICD-10.
 * Ô trống khi chưa có audio. Có chữ thì bác sĩ sửa được, tới khi duyệt.
 */

import TextareaAutosize from "react-textarea-autosize";
import IcdSuggestBar from "@/components/IcdSuggestBar";
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
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
      <div className="flex flex-col gap-3 p-4">
        {FIELDS.map(([key, letter, name]) => {
          const value = soap[key];
          return (
            <article key={key} className="rounded-[10px] border border-line-soft bg-subtle p-3">
              <header className="mb-2 flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-xs font-extrabold text-ink ring-1 ring-line">
                  {letter}
                </span>
                <span className="text-[13.5px] font-extrabold">{name}</span>
              </header>
              <TextareaAutosize
                value={value}
                readOnly={locked}
                minRows={3}
                aria-label={name}
                placeholder="Viết ghi chú..."
                onChange={(event) => onSoap({ ...soap, [key]: event.target.value })}
                className="min-h-20 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-6 text-ink outline-none placeholder:text-faint focus:border-ink"
              />
            </article>
          );
        })}
      </div>

      {showIcd && (
        <IcdSuggestBar
          suggestions={suggestions}
          selectedIcd={selectedIcd}
          locked={locked}
          onSelect={onSelect}
          onSuggestions={onSuggestions}
        />
      )}
      <p className="border-t border-line-soft px-3.5 py-2 text-[11px] text-muted">
        AI có thể sai, hãy kiểm tra lại kĩ trước khi bấm xác nhận.
      </p>
    </section>
  );
}

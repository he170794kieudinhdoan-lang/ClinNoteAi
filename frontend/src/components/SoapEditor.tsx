"use client";

/**
 * Cột phải Clinical Editor: 4 ô SOAP + gợi ý ICD-10.
 * Ô trống khi chưa có audio. Có chữ thì bác sĩ sửa được, tới khi duyệt.
 */

import { FileEdit } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import IcdSuggestBar from "@/components/IcdSuggestBar";
import { SoapSkeleton } from "@/components/Skeletons";
import type { IcdSuggestion, SoapNote } from "@/types";

const FIELDS = [
  ["subjective", "S", "Bệnh sử & triệu chứng cơ năng"],
  ["objective", "O", "Thám khám thực thể & dấu hiệu sinh tồn"],
  ["assessment", "A", "Đánh giá & chẩn đoán sơ bộ"],
  ["plan", "P", "Kế hoạch điều trị & đề xuất"],
] as const;

const PLACEHOLDERS: Record<"subjective" | "objective" | "assessment" | "plan", string> = {
  subjective: "Lý do vào khám, triệu chứng cơ năng, bệnh sử hiện tại và tiền sử bệnh...",
  objective: "Thăm khám thực thể, dấu hiệu sinh tồn (HA, mạch, SpO2, nhiệt độ), kết quả cận lâm sàng...",
  assessment: "Chẩn đoán sơ bộ hoặc xác định, phân biệt bệnh, tiên lượng...",
  plan: "Phác đồ điều trị, đơn thuốc, chỉ định cận lâm sàng tiếp theo, hướng dẫn và hẹn tái khám...",
};

export default function SoapEditor({
  soap,
  suggestions,
  selectedIcd,
  showIcd,
  locked,
  loading = false,
  onSoap,
  onSelect,
  onSuggestions,
}: {
  soap: SoapNote;
  suggestions: IcdSuggestion[];
  selectedIcd?: string;
  showIcd: boolean;
  locked?: boolean;
  loading?: boolean;
  onSoap: (soap: SoapNote) => void;
  onSelect: (code: string) => void;
  onSuggestions: (items: IcdSuggestion[]) => void;
  onRegen?: () => void;
}) {
  const isSoapEmpty = !soap.subjective.trim() && !soap.objective.trim() && !soap.assessment.trim() && !soap.plan.trim();
  if (loading) {
    return <SoapSkeleton statusText="Đang tạo ghi chú SOAP…" />;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-panel">
      <div className="flex flex-col gap-3 p-4">
        {isSoapEmpty && !locked && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-line bg-subtle/80 p-3.5 text-xs">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-muted ring-1 ring-line">
              <FileEdit size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">Ghi chú SOAP đang để trống</p>
              <p className="text-[11.5px] leading-relaxed text-muted">
                Bác sĩ có thể nhập trực tiếp vào các mục bên dưới hoặc tải tệp âm thanh để AI tự động trích xuất thông tin lâm sàng.
              </p>
            </div>
          </div>
        )}
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
                disabled={locked}
                minRows={3}
                aria-label={name}
                placeholder={PLACEHOLDERS[key] ?? "Viết ghi chú..."}
                onChange={(event) => onSoap({ ...soap, [key]: event.target.value })}
                className="min-h-20 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-[13px] leading-6 text-ink outline-none placeholder:text-faint focus:border-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted"
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

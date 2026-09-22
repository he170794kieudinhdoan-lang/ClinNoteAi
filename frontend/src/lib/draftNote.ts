/**
 * MOCK: nháp SOAP + ICD từ bản ghi trên màn hình, không phải model.
 * Sẽ thay bằng POST /api/v1/encounters/:id/soap khi có API.
 */

import type { IcdSuggestion, SoapNote, TranscriptLine } from "@/types";

// MOCK: luật ghép từ khóa → mã ICD. Sẽ bỏ khi API SOAP trả icdSuggestions.
const ICD_RULES: { test: RegExp; item: IcdSuggestion }[] = [
  { test: /thoái hóa khớp|khớp gối/, item: { code: "M17.9", title: "Thoái hóa khớp gối, không xác định", confidence: 82 } },
  { test: /gối trái/, item: { code: "M25.562", title: "Đau khớp gối trái", confidence: 74 } },
  { test: /ho|sốt|đau họng|hô hấp/, item: { code: "J06.9", title: "Nhiễm trùng hô hấp trên cấp, không xác định", confidence: 80 } },
  { test: /tăng huyết áp|huyết áp cao/, item: { code: "I10", title: "Tăng huyết áp nguyên phát", confidence: 64 } },
  { test: /đau lưng/, item: { code: "M54.5", title: "Đau thắt lưng", confidence: 70 } },
];

function clip(parts: string[], max = 320) {
  const text = parts.map((part) => part.trim()).filter(Boolean).join(" ");
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function draftFromTranscript(lines: TranscriptLine[]): {
  soap: SoapNote;
  icdSuggestions: IcdSuggestion[];
  selectedIcd: string;
} {
  const patient = lines.filter((line) => line.speaker === "patient").map((line) => line.text);
  const doctor = lines.filter((line) => line.speaker === "doctor").map((line) => line.text);
  const findings = doctor.filter((text) => /huyết áp|mạch|nhịp|nhiệt|sưng|ấn|nghiệm|khám|gập|duỗi/i.test(text));
  const plan = doctor.filter((text) => /tái khám|thuốc|x-quang|mri|tập|nẹp|kê|giới thiệu/i.test(text));
  const blob = lines.map((line) => line.text).join(" ");
  const icdSuggestions = ICD_RULES.filter((rule) => rule.test.test(blob)).map((rule) => rule.item);
  const suggestions = icdSuggestions.length
    ? icdSuggestions.slice(0, 3)
    : [{ code: "R69", title: "Nguyên nhân bệnh chưa xác định", confidence: 30 }];

  return {
    soap: {
      subjective: clip(patient.slice(0, 4)) || "Chưa có lời bệnh nhân trong bản ghi.",
      objective: clip(findings.length ? findings : doctor.slice(0, 3)) || "Chưa có mô tả khám trong bản ghi.",
      assessment: "Bản nháp từ bản ghi đã sửa. Cần bác sĩ xác nhận trước khi duyệt.",
      plan: clip(plan.length ? plan.slice(0, 3) : doctor.slice(-2)) || "Bổ sung kế hoạch sau khi xem lại bản ghi.",
    },
    icdSuggestions: suggestions,
    selectedIcd: suggestions[0].code,
  };
}

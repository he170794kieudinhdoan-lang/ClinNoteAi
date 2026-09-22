/**
 * Kiểu dữ liệu FE — khớp luồng ClinNote AI:
 * Dashboard → Add Patient → Clinical Editor (empty / record / SOAP / final)
 *
 * Khi BE có schema thật, chỉnh các field ở đây rồi sửa mock + api.ts.
 */

/** Trạng thái Clinical Editor, map screen flow buổi 1. */
export type EncounterStatus = "empty" | "recording" | "uploaded" | "soap" | "final";

export type Speaker = "doctor" | "patient";
export type Gender = "Nam" | "Nữ" | "Khác";

export interface Patient {
  name: string;
  age: number;
  gender?: Gender;
  reason: string; // lý do khám
  code?: string;
  dob?: string;
}

export interface TranscriptLine {
  id: string;
  speaker: Speaker;
  text: string;
  timestampSec: number;
}

/** Bản nháp SOAP — AI chỉ draft, bác sĩ sửa + duyệt (HITL). */
export interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  /** Câu dẫn nguồn dưới mỗi ô, ví dụ "bản ghi 00:14 – 01:10". */
  sources?: Partial<Record<"subjective" | "objective" | "assessment" | "plan", string>>;
}

export interface IcdSuggestion {
  code: string;
  title: string;
  confidence?: number;
}

export interface Encounter {
  id: string;
  patient: Patient;
  status: EncounterStatus;
  createdAt: string;
  transcript: TranscriptLine[];
  soap: SoapNote;
  icdSuggestions: IcdSuggestion[];
  /** Mã đang chọn trên dải ICD-10. Gợi ý vẫn nằm ở icdSuggestions. */
  selectedIcd?: string;
  missingFields: string[]; // cảnh báo thiếu / chưa grounded
  audioFileName?: string;
}

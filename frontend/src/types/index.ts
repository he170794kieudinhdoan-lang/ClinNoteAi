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
  gender: Gender;
  reason: string; // lý do khám
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
}

export interface IcdSuggestion {
  code: string;
  title: string;
}

export interface Encounter {
  id: string;
  patient: Patient;
  status: EncounterStatus;
  createdAt: string;
  transcript: TranscriptLine[];
  soap: SoapNote;
  icdSuggestions: IcdSuggestion[];
  missingFields: string[]; // cảnh báo thiếu / chưa grounded
  audioFileName?: string;
}

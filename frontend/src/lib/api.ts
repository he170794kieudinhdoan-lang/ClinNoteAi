import { modelPreferenceForRequest } from "@/lib/modelPreferences";
import type { Encounter, Gender, TranscriptLine } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getApiBase() {
  return API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const errorText = await res.text();
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function getHealth() {
  return request<{ status: string; env?: string }>("/health");
}

export interface IcdDetail {
  icd10_code: string;
  disease_name_vi: string;
  description_vi: string;
  chapter: { code: string; title: string };
  section: { code: string; title: string };
  parent_group: { code: string; title: string };
}

const icdDetails = new Map<string, Promise<IcdDetail>>();
const icdReady = new Map<string, IcdDetail>();

export function peekIcd(code: string) {
  return icdReady.get(code.trim().toUpperCase());
}

export function lookupIcd(code: string) {
  const key = code.trim().toUpperCase();
  const cached = icdDetails.get(key);
  if (cached) return cached;
  const pending = request<IcdDetail>(`/api/v1/icd/codes/${encodeURIComponent(key)}`)
    .then((detail) => {
      icdReady.set(key, detail);
      return detail;
    })
    .catch((error) => {
      icdDetails.delete(key);
      throw error;
    });
  icdDetails.set(key, pending);
  return pending;
}

export function searchIcdRemote(query: string) {
  return request<{ code: string; title: string }[]>(`/api/v1/icd/search?q=${encodeURIComponent(query)}`);
}

export function getAgentStatus() {
  return request<{ status: string; agent?: string }>("/api/v1/status");
}

export function chat(message: string) {
  return request<{ response: string; analysis: string }>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export interface CreatePatientRequest {
  patient_code: string;
  full_name: string;
  date_of_birth?: string | null;
  sex?: string | null;
}

export interface PatientResponse {
  id: string;
  patient_code: string;
  full_name: string;
  date_of_birth: string | null;
  sex: string | null;
  created_at: string;
}

/**
 * 0. POST /api/v1/patients
 * Create a new patient record in backend DB.
 */
export function createPatient(data: CreatePatientRequest) {
  return request<PatientResponse>("/api/v1/patients", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Types & Helper function matching backend transcript segment schema.
 */
export interface BackendTranscriptSegment {
  id: string;
  speaker_label: string;
  resolved_role: string | null;
  content: string;
  start_ms: number | null;
  end_ms: number | null;
  asr_confidence?: number | null;
  role_confidence?: number | null;
}

export interface CreateConsultationRequest {
  patient_id: string;
  doctor_id: string;
}

export interface ConsultationResponse {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  audio_path: string | null;
  language: string;
}

export interface UploadAudioResponse {
  consultation_id: string;
  status: string;
  segments_count: number;
  transcript: BackendTranscriptSegment[];
}

export interface GetTranscriptResponse {
  consultation_id: string;
  status: string;
  segments: BackendTranscriptSegment[];
}

/**
 * Map backend BackendTranscriptSegment to frontend TranscriptLine.
 * Rules:
 * - resolved_role === "doctor" -> speaker: "doctor"
 * - resolved_role === "patient" -> speaker: "patient"
 * - content -> text
 * - start_ms / 1000 -> timestampSec
 * - end_ms / 1000 -> endSec
 */
export function mapSegmentToTranscriptLine(seg: BackendTranscriptSegment): TranscriptLine {
  return {
    id: seg.id,
    speaker: seg.resolved_role === "doctor" ? "doctor" : "patient",
    text: seg.content,
    timestampSec: seg.start_ms != null ? seg.start_ms / 1000 : 0,
    endSec: seg.end_ms != null ? seg.end_ms / 1000 : undefined,
  };
}

/** Bỏ bản ghi trùng nguyên văn và trùng mốc giờ, giữ lần xuất hiện đầu. */
export function dedupeTranscriptLines(lines: TranscriptLine[]): TranscriptLine[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.speaker}\0${line.timestampSec}\0${line.endSec ?? ""}\0${line.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 1. POST /api/v1/consultations
 * Create a new consultation record in backend DB.
 */
export function createConsultation(data: CreateConsultationRequest) {
  return request<ConsultationResponse>("/api/v1/consultations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ConsultationListItemBackend {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  has_transcript: boolean;
  patient: {
    full_name: string;
    patient_code: string;
    date_of_birth: string | null;
    sex: string | null;
  };
}

/**
 * 5. GET /api/v1/consultations?doctor_id=
 * Danh sách lượt khám lưu theo từng bác sĩ trên backend DB.
 */
export function listConsultations(doctorId: string) {
  return request<ConsultationListItemBackend[]>(
    `/api/v1/consultations?doctor_id=${encodeURIComponent(doctorId)}`
  );
}

const SEX_TO_GENDER: Record<string, Gender> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

function ageFromDob(dob: string | null): number {
  if (!dob) return 0;
  const d = Number(dob.slice(8, 10));
  const m = Number(dob.slice(5, 7));
  const y = Number(dob.slice(0, 4));
  if (!d || !m || !y) return 0;
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return Math.max(age, 0);
}

/** Map backend ConsultationListItem -> FE Encounter. */
export function mapConsultationToEncounter(item: ConsultationListItemBackend): Encounter {
  return {
    id: item.id,
    patientId: item.patient_id,
    doctorId: item.doctor_id,
    consultationId: item.id,
    patient: {
      id: item.patient_id,
      name: item.patient.full_name,
      age: ageFromDob(item.patient.date_of_birth),
      gender: item.patient.sex ? SEX_TO_GENDER[item.patient.sex.toUpperCase()] : undefined,
      reason: "",
      code: item.patient.patient_code,
      dob: item.patient.date_of_birth ?? undefined,
    },
    status: item.has_transcript ? "uploaded" : "empty",
    createdAt: item.created_at,
    transcript: [],
    soap: { subjective: "", objective: "", assessment: "", plan: "" },
    icdSuggestions: [],
    missingFields: item.has_transcript ? [] : ["Audio / transcript"],
  };
}

/**
 * 2. POST /api/v1/consultations/{consultation_id}/audio
 * Upload audio file to backend. Runs Blaze STT + Qwen speaker role classifier + DB saving.
 */
export async function uploadConsultationAudio(
  consultationId: string,
  file: File
): Promise<UploadAudioResponse> {
  const formData = new FormData();
  formData.append("audio_file", file);
  formData.append("model_preferences", JSON.stringify({ stt: modelPreferenceForRequest("stt"), roles: modelPreferenceForRequest("roles") }));

  const res = await fetch(`${API_BASE}/api/v1/consultations/${consultationId}/audio`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    let detail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    } catch {}
    throw new Error(detail);
  }

  return res.json() as Promise<UploadAudioResponse>;
}

/**
 * 3. GET /api/v1/consultations/{consultation_id}/transcript
 * Retrieve persisted transcript segments for a consultation.
 */
export function getConsultationTranscript(consultationId: string) {
  return request<GetTranscriptResponse>(`/api/v1/consultations/${consultationId}/transcript`);
}

/**
 * 4. PATCH /api/v1/transcript-segments/{segment_id}
 * Update content of a single transcript segment in backend DB.
 */
export function updateTranscriptSegment(segmentId: string, content: string) {
  return request<BackendTranscriptSegment>(`/api/v1/transcript-segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}


export type SoapInputFormat = "qwen_role_result" | "canonical" | "text";

export type TranscriptSpeaker = "clinician" | "patient" | string;

export interface SoapTranscriptTurn {
  turn_id: string;
  source_segment_id: string | number | null;
  source_speaker_id: string | null;
  speaker: TranscriptSpeaker;
  text: string;
  start_ms: number | null;
  end_ms: number | null;
  role_confidence?: number | null;
}

export interface SoapTranscript {
  schema_version?: string;
  language?: string;
  turns: SoapTranscriptTurn[];
  source_metadata?: Record<string, unknown>;
}

export interface SoapEvidence {
  turn_id: string;
  quote: string;
  source_segment_id?: string | number | null;
  speaker?: TranscriptSpeaker | null;
  start_ms?: number | null;
  end_ms?: number | null;
}

export type CapType =
  | "ChiefComplaint"
  | "Problem"
  | "ProblemHistory"
  | "ExamFinding"
  | "TestResult"
  | "MedicationStatement"
  | "MedicationRequest"
  | "Order"
  | "FollowUp"
  | "Counseling"
  | string;

export interface ClinicalAtomicProposition {
  prop_id: string;
  cap_type: CapType;
  canonical_concept: string;
  proposition_text: string;
  speaker_source: "clinician" | "patient" | string;
  temporality?: "current" | "past" | "future" | "unknown" | string | null;
  verification_status?: "affirmed" | "negated" | "uncertain" | "unknown" | string | null;
  clinical_status?: "active" | "resolved" | "planned" | "unknown" | string | null;
  medication_state?: string | null;
  evidence: SoapEvidence[];
  supersedes: string[];
  resolution_status: "current" | "superseded" | "needs_review" | string;
}

export type SoapSupportStatus = "pending" | "supported" | "partial" | "unsupported" | "conflicting";
export type SoapReviewStatus = "needs_review" | "reviewed";
export type SoapOrigin = "ai" | "reviewer";

export interface SoapItem {
  item_id: string;
  text: string;
  cap_ids: string[];
  origin: SoapOrigin;
  review_status: SoapReviewStatus;
  source_link_status: "valid" | "invalid";
  support_status: SoapSupportStatus;
  manual_reason?: string | null;
}

export interface SoapSection {
  items: SoapItem[];
  missing: boolean;
}

export interface SoapContent {
  S: SoapSection;
  O: SoapSection;
  A: SoapSection;
  P: SoapSection;
}

export interface SoapWarning {
  code?: string;
  message?: string;
  text?: string;
  warning?: string;
  prop_id?: string;
  cap_ids?: string[];
  [key: string]: unknown;
}

export type SoapWarningValue = string | SoapWarning;
export type SoapWarningDecisions = Record<string, string>;

export interface SoapRevision {
  revision: number;
  parent_revision: number | null;
  status: string;
  soap: SoapContent;
  reviewer_name?: string | null;
  warning_decisions?: SoapWarningDecisions;
  created_at?: string | null;
  approved_at?: string | null;
}

export type LatestSoapRevision = SoapRevision | number | null;

export interface SoapRunResponse {
  run_id: string;
  transcript: SoapTranscript;
  caps: ClinicalAtomicProposition[];
  caps_complete?: boolean;
  cap_warnings: SoapWarningValue[];
  latest_revision: LatestSoapRevision;
  revisions: SoapRevision[];
}

export interface ExtractCapsResponse {
  run_id: string;
  transcript: SoapTranscript;
  caps: ClinicalAtomicProposition[];
  cap_warnings: SoapWarningValue[];
}

export interface SoapRevisionResponse {
  run_id: string;
  revision: SoapRevision;
}

export interface ExtractCapsRequest {
  input_format: SoapInputFormat;
  content: string | Record<string, unknown>;
}

export interface SaveSoapRevisionRequest {
  expected_revision: number;
  soap: SoapContent;
  reviewer_name?: string;
  warning_decisions?: SoapWarningDecisions;
}

export interface ApproveSoapRequest {
  expected_revision: number;
  reviewer_name: string;
  warning_decisions?: SoapWarningDecisions;
}

export const SOAP_SECTIONS = [
  { key: "S", label: "Bệnh sử & triệu chứng cơ năng", description: "" },
  { key: "O", label: "Thám khám thực thể & dấu hiệu sinh tồn", description: "" },
  { key: "A", label: "Đánh giá & chẩn đoán sơ bộ", description: "" },
  { key: "P", label: "Kế hoạch điều trị & đề xuất", description: "" },
] as const;

export type SoapSectionKey = (typeof SOAP_SECTIONS)[number]["key"];

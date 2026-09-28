import type { GetTranscriptResponse } from "@/lib/api";
import type { SoapTranscript, SoapTranscriptTurn } from "@/types/soap";

/** Build a SOAP input from the transcript already saved by the audio flow. */
export function soapTranscriptFromConsultation(response: GetTranscriptResponse): SoapTranscript {
  if (response.segments.length === 0) {
    throw new Error("Lượt khám chưa có transcript để tạo CAP và SOAP.");
  }

  const turns: SoapTranscriptTurn[] = response.segments.map((segment, index) => {
    if (segment.resolved_role !== "doctor" && segment.resolved_role !== "patient") {
      throw new Error(`Lượt nói ${index + 1} chưa xác định được vai bác sĩ hoặc bệnh nhân.`);
    }
    if (!segment.content.trim()) {
      throw new Error(`Lượt nói ${index + 1} không có nội dung.`);
    }
    if ((segment.start_ms === null) !== (segment.end_ms === null)) {
      throw new Error(`Lượt nói ${index + 1} thiếu mốc bắt đầu hoặc kết thúc.`);
    }

    return {
      turn_id: `T${index + 1}`,
      source_segment_id: segment.id,
      source_speaker_id: segment.speaker_label,
      speaker: segment.resolved_role === "doctor" ? "clinician" : "patient",
      text: segment.content,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
      role_confidence: segment.role_confidence ?? null,
    };
  });

  return {
    schema_version: "1.0",
    language: "vi",
    turns,
    source_metadata: {
      source: "consultation_transcript",
      consultation_id: response.consultation_id,
    },
  };
}

/**
 * Mock data — dùng khi BE chưa có endpoint encounter.
 * Dashboard / Editor đọc từ đây qua hooks. Đổi mock = đổi ví dụ trên UI.
 */

import type { Encounter, TranscriptLine } from "@/types";

export const MOCK_TRANSCRIPT: TranscriptLine[] = [
  { id: "1", speaker: "doctor", text: "Hôm nay anh đến khám vì lý do gì?", timestampSec: 2 },
  { id: "2", speaker: "patient", text: "Em ho và sốt 3 ngày, mệt.", timestampSec: 7 },
];

const EMPTY_SOAP = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

/** 2 lượt khám mẫu: 1 empty, 1 đã có SOAP draft. */
export const MOCK_ENCOUNTERS: Encounter[] = [
  {
    id: "enc-1",
    patient: { name: "Nguyễn Văn An", age: 42, gender: "Nam", reason: "Ho, sốt 3 ngày" },
    status: "empty",
    createdAt: "2026-09-21T08:00:00.000Z",
    transcript: [],
    soap: EMPTY_SOAP,
    icdSuggestions: [],
    missingFields: ["Audio / transcript"],
  },
  {
    id: "enc-2",
    patient: { name: "Trần Thị Bình", age: 35, gender: "Nữ", reason: "Đau họng" },
    status: "soap",
    createdAt: "2026-09-21T09:00:00.000Z",
    transcript: MOCK_TRANSCRIPT,
    soap: {
      subjective: "Ho, sốt 3 ngày, mệt, chưa dùng kháng sinh.",
      objective: "Chưa có chỉ số sinh tồn trong transcript.",
      assessment: "Theo dõi viêm đường hô hấp trên (bản nháp).",
      plan: "Bổ sung nhiệt độ, huyết áp. Không tự kê đơn.",
    },
    icdSuggestions: [
      { code: "J06.9", title: "Nhiễm trùng hô hấp trên cấp, không xác định" },
    ],
    missingFields: ["Nhiệt độ", "Huyết áp"],
    audioFileName: "consult-binh.wav",
  },
];

/**
 * Mock data — dùng khi BE chưa có endpoint encounter.
 * Dashboard / Editor đọc từ đây qua hooks. Đổi mock = đổi ví dụ trên UI.
 */

import type { Encounter } from "@/types";

const EMPTY_SOAP = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

/**
 * Nội dung hiện khi bác sĩ vừa tải audio.
 * ponytail: bản nháp cục bộ tới khi có POST audio + STT. Không phải kết quả model.
 */
export const UPLOADED_DRAFT: Pick<Encounter, "transcript" | "soap" | "icdSuggestions"> = {
  transcript: [
    { id: "u1", speaker: "doctor", text: "Hôm nay anh đến khám vì lý do gì?", timestampSec: 0 },
    { id: "u2", speaker: "patient", text: "Em ho và sốt khoảng ba ngày, người mệt.", timestampSec: 14 },
    { id: "u3", speaker: "patient", text: "Chưa uống kháng sinh, chỉ nghỉ ở nhà.", timestampSec: 32 },
    { id: "u4", speaker: "doctor", text: "Có khó thở, đau ngực hay đau họng không?", timestampSec: 51 },
    { id: "u5", speaker: "patient", text: "Hơi đau họng, không khó thở.", timestampSec: 70 },
    { id: "u6", speaker: "doctor", text: "Tôi sẽ nghe phổi và đo nhiệt độ.", timestampSec: 88 },
    { id: "u7", speaker: "patient", text: "Dạ, em thấy sốt về chiều.", timestampSec: 107 },
    { id: "u8", speaker: "doctor", text: "Mình theo dõi viêm đường hô hấp trên, chưa kê đơn.", timestampSec: 125 },
  ],
  soap: {
    subjective: "Ho, sốt khoảng 3 ngày, mệt, đau họng nhẹ, chưa dùng kháng sinh.",
    objective: "Chưa có số đo nhiệt độ hay huyết áp trong đoạn ghi.",
    assessment: "Theo dõi viêm đường hô hấp trên cấp. Bản nháp, cần bác sĩ xác nhận.",
    plan: "Đo nhiệt độ và huyết áp. Không tự kê đơn. Tái khám nếu khó thở.",
    sources: {
      subjective: "bản ghi 00:14 – 01:10",
      objective: "bản ghi 01:28 – 02:05",
      assessment: "bản nháp AI · cần xem lại",
      plan: "bản nháp AI · cần xem lại",
    },
  },
  icdSuggestions: [
    { code: "J06.9", title: "Nhiễm trùng hô hấp trên cấp, không xác định", confidence: 92 },
    { code: "J02.9", title: "Viêm họng cấp, không xác định", confidence: 64 },
    { code: "R50.9", title: "Sốt, không xác định", confidence: 41 },
  ],
};

/** 2 lượt khám mẫu: 1 empty, 1 đã có SOAP draft. */
export const MOCK_ENCOUNTERS: Encounter[] = [
  {
    id: "enc-1",
    patient: {
      name: "Nguyễn Văn An",
      age: 42,
      gender: "Nam",
      reason: "Ho, sốt 3 ngày",
      code: "0123456789",
      dob: "1984-03-12",
    },
    status: "empty",
    createdAt: "2026-09-21T08:00:00.000Z",
    transcript: [],
    soap: EMPTY_SOAP,
    icdSuggestions: [],
    missingFields: ["Audio / transcript"],
  },
  {
    id: "enc-2",
    patient: {
      name: "Trần Thị Bình",
      age: 35,
      gender: "Nữ",
      reason: "Đau họng",
      code: "0987654321",
      dob: "1991-06-02",
    },
    status: "soap",
    createdAt: "2026-09-21T09:00:00.000Z",
    transcript: UPLOADED_DRAFT.transcript,
    soap: UPLOADED_DRAFT.soap,
    icdSuggestions: UPLOADED_DRAFT.icdSuggestions,
    selectedIcd: "J06.9",
    missingFields: ["Nhiệt độ", "Huyết áp"],
    audioFileName: "consult-binh.wav",
  },
];

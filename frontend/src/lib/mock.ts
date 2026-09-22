/**
 * MOCK: toàn bộ file này là data giả.
 * Sẽ thay bằng data API (GET /api/v1/encounters và POST audio/STT) khi có endpoint.
 * Dashboard / Editor không đọc file này trực tiếp — đi qua React Query trong useEncounter.
 */

import type { Encounter, TranscriptLine } from "@/types";

const EMPTY_SOAP = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

function seg(id: number, start: number, end: number, speaker: TranscriptLine["speaker"], text: string): TranscriptLine {
  return { id: String(id), timestampSec: start, endSec: end, speaker, text };
}

/**
 * MOCK: bản ghi + SOAP + ICD giả khi bác sĩ vừa tải audio.
 * Sẽ thay bằng response của POST /api/v1/encounters/:id/audio (STT) và POST .../soap.
 * Segment theo mẫu STT: start/end + vai bác sĩ hoặc bệnh nhân.
 */
export const UPLOADED_DRAFT: Pick<Encounter, "transcript" | "soap" | "icdSuggestions"> = {
  transcript: [
    seg(1, 0.09, 0.93, "patient", "Xin chào cô."),
    seg(2, 1.29, 5.61, "doctor", "Chào bác, rất vui được gặp bác hôm nay. Tôi có thể giúp gì cho bác nào?"),
    seg(3, 5.97, 9.39, "patient", "Chào bác sĩ. Gần đây khớp gối trái của tôi bị đau nhiều quá."),
    seg(4, 10.05, 15.87, "doctor", "Nghe có vẻ khó chịu đấy. Bác có thể chia sẻ kỹ hơn cơn đau như thế nào và đã kéo dài bao lâu rồi không?"),
    seg(5, 16.29, 21.99, "patient", "Vâng. Cơn đau khá nặng nề, từ mức vừa đến đau dữ dội, kéo dài suốt 3 tuần nay rồi."),
    seg(6, 22.35, 28.23, "doctor", "Ồ, nghe có vẻ không dễ chịu chút nào. Có vận động hay tư thế cụ thể nào làm cơn đau tăng lên không bác?"),
    seg(7, 28.53, 35.43, "patient", "Có chứ, cứ hễ vận động là đau tăng rõ rệt. Đi bộ, leo cầu thang hay đứng lâu tất cả đều làm tôi đau hơn nhiều."),
    seg(8, 35.79, 39.33, "doctor", "Tôi hiểu rồi. Bác có thấy đầu gối bị sưng hay cứng khớp không?"),
    seg(9, 39.63, 43.95, "patient", "Có, thỉnh thoảng có sưng và bị cứng khớp nhiều, nhất là vào các buổi sáng."),
    seg(10, 44.31, 50.07, "doctor", "Được rồi. Bác có thấy thêm triệu chứng nào khác không, ví dụ như sốt, sụt cân hay tương tự thế?"),
    seg(11, 50.49, 52.71, "patient", "Không, tôi không bị sốt hay sụt cân gì cả."),
    seg(12, 53.07, 58.11, "doctor", "Còn triệu chứng đau ngực hay hồi hộp, đánh trống ngực thì sao? Tim mạch có gì bất thường không bác?"),
    seg(13, 58.53, 62.37, "patient", "Không, tim tôi bình thường. Không đau ngực hay hồi hộp gì đâu."),
    seg(14, 62.79, 66.63, "doctor", "Tốt. Cơn đau khớp gối này có làm ảnh hưởng đến giấc ngủ của bác không?"),
    seg(15, 66.93, 69.27, "patient", "Có chứ, nó làm tôi mất ngủ khá nhiều."),
    seg(16, 69.57, 75.81, "doctor", "Tôi hiểu. Chúng ta trao đổi một chút về sức khỏe tổng quát nhé. Trước đây bác có đang mắc bệnh lý nền nào khác không?"),
    seg(17, 76.29, 82.17, "patient", "À, tôi có bị tăng huyết áp, nhưng được kiểm soát tốt rồi. Ngoài ra không có vấn đề lớn nào khác."),
    seg(18, 82.53, 87.09, "doctor", "Thế thì tốt. Hiện tại bác có đang dùng thuốc điều trị huyết áp hay loại thuốc nào khác không?"),
    seg(19, 87.45, 91.65, "patient", "Vâng, tôi uống thuốc huyết áp đều đặn, còn lại không uống thêm thuốc nào khác."),
    seg(20, 91.95, 100.17, "doctor", "Được rồi. Giờ chúng ta cùng kiểm tra khớp gối nhé. Nãy bác có nói là bị sưng và cứng khớp, bác có thể chỉ cho tôi chỗ đau nhiều nhất ở đâu không?"),
    seg(21, 100.53, 104.61, "patient", "Đau chủ yếu quanh khớp gối, đặc biệt là ở hai bên rìa khớp gối này này."),
    seg(22, 105.03, 117.93, "doctor", "Vâng, để tôi đo các chỉ số sinh tồn trước nhé. Huyết áp của bác là 128/82, nhịp tim 72 lần một phút, nhịp thở 16 lần một phút và nhiệt độ là 37°C. Mọi chỉ số cơ bản đều bình thường."),
    seg(23, 118.23, 119.31, "patient", "Thế thì yên tâm rồi."),
    seg(24, 119.73, 127.23, "doctor", "Giờ tôi khám khớp gối nhé. Khớp gối trái hơi sưng nhẹ, nhưng không thấy biến dạng khớp. Tôi ấn vào chỗ này bác có thấy đau nhói không?"),
    seg(25, 127.59, 129.03, "patient", "Có, chỗ đó thốn lắm."),
    seg(26, 129.51, 130.71, "doctor", "Còn bên này thì sao?"),
    seg(27, 131.19, 132.87, "patient", "Vâng, chỗ đấy cũng bị đau thốn."),
    seg(28, 133.35, 138.93, "doctor", "Được rồi. Bây giờ kiểm tra tầm vận động nhé. Bác thử co và duỗi thẳng đầu gối ra giúp tôi xem nào."),
    seg(29, 139.53, 141.63, "patient", "Co vào với duỗi ra đều đau lắm bác sĩ ơi."),
    seg(30, 142.05, 153.21, "doctor", "Vâng, biên độ gập duỗi của bác đang bị hạn chế do đau. Giờ tôi sẽ làm vài nghiệm pháp để đánh giá độ vững của khớp nhé. Sẽ hơi khó chịu một chút đấy, nhưng rất cần thiết. Đầu tiên là nghiệm pháp Lachman."),
    seg(31, 153.69, 154.35, "patient", "Vâng được."),
    seg(32, 154.65, 158.49, "doctor", "Nghiệm pháp Lachman âm tính. Giờ thử sang nghiệm pháp McMurray nhé."),
    seg(33, 158.97, 159.33, "patient", "Vâng."),
    seg(34, 159.81, 164.85, "doctor", "McMurray cũng âm tính. Bây giờ tôi ép nhẹ sang hai bên, bác có thấy khó chịu không?"),
    seg(35, 165.15, 166.95, "patient", "Có, hơi khó chịu một chút."),
    seg(36, 167.31, 180.63, "doctor", "Được rồi, có cảm giác khó chịu nhẹ khi làm nghiệm pháp ép vẹo trong và vẹo ngoài. Tôi sẽ chỉ định chụp X-quang khớp gối trái để loại trừ tổn thương cấu trúc xương. Nếu kết quả X-quang chưa rõ ràng, chúng ta có thể cần cân nhắc chụp cộng hưởng từ MRI."),
    seg(37, 181.17, 182.73, "patient", "Vâng, như vậy thì tốt quá."),
    seg(38, 183.39, 191.85, "doctor", "Dựa trên mô tả và các triệu chứng vừa khám, có khả năng bác đang bị đợt bùng phát thoái hóa khớp gối mức độ nhẹ. Trước đây bác đã từng được chẩn đoán thoái hóa khớp chưa?"),
    seg(39, 192.33, 194.25, "patient", "Dạ chưa, tôi chưa từng bị."),
    seg(40, 194.55, 208.05, "doctor", "Chúng ta sẽ cần kết quả hình ảnh để khẳng định, nhưng triệu chứng hiện tại hướng nhiều về khả năng này. Trước mắt, tôi khuyên bác nên bắt đầu tập vật lý trị liệu để tăng sức cơ và cải thiện độ linh hoạt cho khớp gối. Việc này sẽ giúp giảm đau và giảm cứng khớp đáng kể."),
    seg(41, 208.41, 211.65, "patient", "Nghe hợp lý đấy. Tôi cần làm thêm gì nữa không bác sĩ?"),
    seg(42, 212.01, 221.67, "doctor", "Bác cũng nên điều chỉnh một chút trong sinh hoạt để giảm bớt tải trọng lên gối. Cố gắng tránh các động tác làm tăng cơn đau, và có thể dùng gậy hoặc nẹp bảo vệ khớp gối hỗ trợ nếu cần thiết nhé."),
    seg(43, 222.21, 224.01, "patient", "Vâng, việc này tôi làm được."),
    seg(44, 224.31, 232.71, "doctor", "Về kiểm soát cơn đau, bác có thể dùng thuốc giảm đau kháng viêm không steroid không kê đơn khi thấy đau nhiều. Thuốc này sẽ giúp làm dịu cơn đau và giảm viêm."),
    seg(45, 233.13, 235.59, "patient", "Vâng, tôi sẽ mua thuốc giảm đau kháng viêm đó."),
    seg(46, 235.89, 246.03, "doctor", "Rất tốt. Chúng ta hẹn tái khám sau 4 tuần nữa để đánh giá xem tình trạng đáp ứng với phác đồ điều trị thế nào nhé. Nếu cơn đau vẫn dai dẳng hoặc tăng lên, chúng ta sẽ tính phương án khác."),
    seg(47, 246.33, 248.79, "patient", "Vâng, đúng 4 tuần nữa tôi sẽ quay lại khám."),
    seg(48, 249.21, 259.77, "doctor", "Được rồi. Tôi sẽ viết giấy giới thiệu chụp X-quang gối trái cho bác, và cân nhắc chụp MRI nếu X-quang chưa rõ. Bác đã có sẵn địa chỉ cơ sở y tế uy tín để thực hiện các chụp chiếu này chưa?"),
    seg(49, 260.19, 261.45, "patient", "Vâng, tôi có rồi."),
    seg(50, 261.81, 271.65, "doctor", "Rất tốt. Bác hiểu rất rõ về tình trạng của mình và có ý thức hợp tác điều trị cao, tôi tin chúng ta sẽ kiểm soát tốt tình trạng này thôi. Cứ làm theo đúng hướng dẫn và theo dõi tiến triển nhé."),
    seg(51, 272.13, 273.27, "patient", "Cảm ơn bác sĩ nhiều lắm."),
    seg(52, 273.81, 277.11, "doctor", "Không có gì. Bác còn thắc mắc hay băn khoăn nào nữa không?"),
    seg(53, 277.53, 279.75, "patient", "Không đâu, như vậy là đầy đủ hết rồi."),
    seg(54, 280.17, 283.83, "doctor", "Vâng, giữ gìn sức khỏe nhé, hẹn gặp lại bác sau 4 tuần nữa."),
    seg(55, 284.31, 286.71, "patient", "Cảm ơn bác sĩ, hẹn gặp lại bác sĩ."),
  ],
  soap: {
    subjective: "Đau khớp gối trái 3 tuần, tăng khi đi bộ, leo cầu thang, đứng lâu. Có sưng, cứng khớp buổi sáng, mất ngủ. Tăng huyết áp đang điều trị, không sốt, không đau ngực.",
    objective: "HA 128/82, mạch 72, nhịp thở 16, nhiệt độ 37°C. Gối trái sưng nhẹ, không biến dạng, đau hai rìa khớp. Gập duỗi hạn chế do đau. Lachman và McMurray âm tính, ép vẹo khó chịu nhẹ.",
    assessment: "Đợt bùng phát thoái hóa khớp gối trái mức độ nhẹ. Bản nháp, cần bác sĩ xác nhận sau hình ảnh.",
    plan: "X-quang gối trái, cân nhắc MRI. Tập vật lý trị liệu, giảm tải gối, NSAID khi đau. Tái khám sau 4 tuần.",
    sources: {
      subjective: "bản ghi 00:16 – 01:09",
      objective: "bản ghi 01:45 – 02:46",
      assessment: "bản ghi 03:03 – 03:11",
      plan: "bản ghi 03:14 – 04:06",
    },
  },
  icdSuggestions: [
    { code: "M17.9", title: "Thoái hóa khớp gối, không xác định", confidence: 88 },
    { code: "M25.562", title: "Đau khớp gối trái", confidence: 74 },
    { code: "M25.462", title: "Tràn dịch khớp gối trái", confidence: 36 },
  ],
};

/** MOCK: danh sách lượt khám mẫu. Sẽ thay bằng GET /api/v1/encounters. */
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
      reason: "Đau khớp gối trái",
      code: "0987654321",
      dob: "1991-06-02",
    },
    status: "soap",
    createdAt: "2026-09-21T09:00:00.000Z",
    transcript: UPLOADED_DRAFT.transcript,
    soap: UPLOADED_DRAFT.soap,
    icdSuggestions: UPLOADED_DRAFT.icdSuggestions,
    selectedIcd: "M17.9",
    missingFields: [],
    audioFileName: "M25562_doctor2.wav",
  },
  {
    id: "enc-3",
    patient: {
      name: "Lê Minh Châu",
      age: 28,
      gender: "Nữ",
      reason: "Tái khám huyết áp",
      code: "0135792468",
      dob: "1998-11-20",
    },
    status: "final",
    createdAt: "2026-09-21T10:30:00.000Z",
    transcript: [],
    soap: {
      subjective: "Đau đầu nhẹ, huyết áp đo tại nhà cao.",
      objective: "Chưa đo lại tại phòng khám.",
      assessment: "Theo dõi huyết áp.",
      plan: "Đo lại và hẹn tuần sau.",
    },
    icdSuggestions: [],
    missingFields: [],
  },
  {
    id: "enc-4",
    patient: {
      name: "Phạm Quốc Huy",
      age: 51,
      gender: "Nam",
      reason: "Đau lưng 1 tuần",
      code: "0246813579",
      dob: "1975-02-08",
    },
    status: "empty",
    createdAt: "2026-09-21T11:15:00.000Z",
    transcript: [],
    soap: EMPTY_SOAP,
    icdSuggestions: [],
    missingFields: ["Audio / transcript"],
  },
];

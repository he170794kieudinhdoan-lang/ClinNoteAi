import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Encounter } from "@/types";

export type NoteParts = {
  patient: boolean;
  soap: boolean;
  icd: boolean;
  transcript: boolean;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 46,
    paddingHorizontal: 40,
    fontFamily: "Tinos",
    fontSize: 11,
    color: "#1a1a1a",
    lineHeight: 1.45,
  },
  mast: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  mastText: { fontSize: 9 },
  title: { textAlign: "center", fontSize: 16, fontWeight: 700 },
  meta: { textAlign: "center", fontSize: 10, marginTop: 2, marginBottom: 8 },
  rule: { borderBottomWidth: 1.25, borderBottomColor: "#111", marginBottom: 8 },
  head: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 4 },
  sub: { fontSize: 11, fontWeight: 700, marginTop: 6, marginBottom: 2 },
  body: { fontSize: 11, marginBottom: 2 },
  box: { borderWidth: 0.7, borderColor: "#222" },
  row: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: "#222" },
  rowLast: { flexDirection: "row" },
  half: { flex: 1, flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8 },
  halfSplit: { borderRightWidth: 0.4, borderRightColor: "#222" },
  wide: { width: "100%", flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8 },
  key: { width: 78, fontSize: 9, color: "#444", paddingTop: 1 },
  val: { flex: 1, fontSize: 11, fontWeight: 700 },
  sign: { marginTop: 22, alignItems: "flex-end" },
  signLine: { fontSize: 11, textAlign: "right" },
  signGap: { height: 36 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#666",
    textAlign: "center",
  },
});

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function paperDate(stamp: string) {
  const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return stamp;
  return `Ngày ${match[3]} tháng ${match[2]} năm ${match[1]}`;
}

function linesOf(text: string) {
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

const VITAL = /huyết áp|mạch|nhịp tim|nhịp thở|nhiệt độ|spo2|cân nặng|chiều cao|\bbmi\b/i;

function splitExam(lines: string[]) {
  const whole = lines.filter((line) => VITAL.test(line));
  const parts = lines.filter((line) => !VITAL.test(line));
  return { whole, parts };
}

function splitHistory(lines: string[]) {
  const family = lines.filter((line) => /gia đình/i.test(line));
  const self = lines.filter((line) => !family.includes(line) && /tiền sử|đang uống|đang dùng|thuốc điều trị/i.test(line));
  const course = lines.filter((line) => !family.includes(line) && !self.includes(line));
  return { course, self, family };
}

function Prose({ lines }: { lines: string[] }) {
  if (lines.length === 0) return <Text style={styles.body}>—</Text>;
  return lines.map((line, index) => <Text key={index} style={styles.body}>{line}</Text>);
}

let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  const origin = window.location.origin;
  Font.register({
    family: "Tinos",
    fonts: [
      { src: `${origin}/fonts/Tinos-Regular.ttf` },
      { src: `${origin}/fonts/Tinos-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

function NoteDocument({
  encounter,
  doctor,
  parts,
  approved,
}: {
  encounter: Encounter;
  doctor: string;
  parts: NoteParts;
  approved: string;
}) {
  const patient = encounter.patient;
  const age = patient.age > 0 ? `${patient.age} tuổi` : "—";
  const name = patient.name ? patient.name.toLocaleUpperCase("vi-VN") : "—";
  const icd = encounter.icdSuggestions.find((item) => item.code === encounter.selectedIcd) ?? encounter.icdSuggestions[0];
  const history = splitHistory(linesOf(encounter.soap.subjective));
  const exam = splitExam(linesOf(encounter.soap.objective));
  const diagnosis = linesOf(encounter.soap.assessment);
  const treatment = linesOf(encounter.soap.plan);
  const diagnosisLine = [
    diagnosis.join(" "),
    parts.icd && icd ? `Mã ${icd.code} — ${icd.title}` : "",
  ].filter(Boolean).join(". ");

  return (
    <Document title="Bệnh án ngoại trú" author={doctor} language="vi">
      <Page size="A4" style={styles.page}>
        <View style={styles.mast}>
          <Text style={styles.mastText}>ClinNote</Text>
          <Text style={styles.mastText}>MS: 15/BV-01</Text>
        </View>
        <Text style={styles.title}>BỆNH ÁN NGOẠI TRÚ</Text>
        <Text style={styles.meta}>{`Số ngoại trú: ${patient.code || "—"}`}</Text>
        <View style={styles.rule} />

        {parts.patient && (
          <View>
            <Text style={styles.head}>I. HÀNH CHÍNH</Text>
            <View style={styles.box}>
              <View style={styles.row}>
                <View style={styles.wide}>
                  <Text style={styles.key}>Họ và tên</Text>
                  <Text style={styles.val}>{name}</Text>
                </View>
              </View>
              <View style={styles.row}>
                <View style={[styles.half, styles.halfSplit]}>
                  <Text style={styles.key}>Sinh ngày</Text>
                  <Text style={styles.val}>{patient.dob || "—"}</Text>
                </View>
                <View style={styles.half}>
                  <Text style={styles.key}>Tuổi</Text>
                  <Text style={styles.val}>{age}</Text>
                </View>
              </View>
              <View style={styles.rowLast}>
                <View style={[styles.half, styles.halfSplit]}>
                  <Text style={styles.key}>Giới</Text>
                  <Text style={styles.val}>{patient.gender || "—"}</Text>
                </View>
                <View style={styles.half}>
                  <Text style={styles.key}>Đến khám</Text>
                  <Text style={styles.val}>{paperDate(encounter.createdAt)}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.head}>II. LÝ DO VÀO VIỆN</Text>
            <Text style={styles.body}>{patient.reason.trim() || "—"}</Text>
          </View>
        )}

        {parts.soap && (
          <View>
            <Text style={styles.head}>III. HỎI BỆNH</Text>
            <Text style={styles.sub}>1. Quá trình bệnh lý</Text>
            <Prose lines={history.course} />
            <Text style={styles.sub}>2. Tiền sử bệnh</Text>
            <Text style={styles.body}>{`Bản thân: ${history.self.join(" ") || "—"}`}</Text>
            <Text style={styles.body}>{`Gia đình: ${history.family.join(" ") || "—"}`}</Text>

            <Text style={styles.head}>IV. KHÁM BỆNH</Text>
            <Text style={styles.sub}>1. Toàn thân</Text>
            <Prose lines={exam.whole} />
            <Text style={styles.sub}>2. Các bộ phận</Text>
            <Prose lines={exam.parts} />
            <Text style={styles.sub}>3. Tóm tắt kết quả cận lâm sàng</Text>
            <Text style={styles.body}>—</Text>
            <Text style={styles.sub}>4. Chẩn đoán ban đầu</Text>
            <Prose lines={diagnosis} />
            <Text style={styles.sub}>5. Đã xử lý (thuốc, chăm sóc) và điều trị ngoại trú</Text>
            <Prose lines={treatment} />
            <Text style={styles.sub}>6. Chẩn đoán khi ra viện</Text>
            <Text style={styles.body}>{diagnosisLine || "—"}</Text>
          </View>
        )}

        {!parts.soap && parts.icd && (
          <View>
            <Text style={styles.head}>CHẨN ĐOÁN</Text>
            <Text style={styles.body}>{icd ? `Mã ${icd.code} — ${icd.title}` : "Chưa chọn mã"}</Text>
          </View>
        )}

        {parts.transcript && (
          <View>
            <Text style={styles.head}>BẢN GHI</Text>
            {encounter.transcript.length === 0 ? <Text style={styles.body}>Không có bản ghi</Text> : encounter.transcript.map((line) => (
              <Text key={line.id} style={styles.body}>
                {`${clock(line.timestampSec)}   ${line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân"}:  ${line.text}`}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.sign}>
          <Text style={styles.signLine}>{paperDate(encounter.createdAt)}</Text>
          <Text style={[styles.signLine, { fontWeight: 700, marginTop: 2 }]}>Bác sĩ khám bệnh</Text>
          <View style={styles.signGap} />
          <Text style={[styles.signLine, { fontWeight: 700 }]}>{doctor}</Text>
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) => `ClinNote  ·  ${pageNumber}/${totalPages}`}
        />
      </Page>
    </Document>
  );
}

/** Tải phiếu khám A4. Tinos là font serif có dấu tiếng Việt. */
export async function downloadNotePdf(encounter: Encounter, doctor: string, parts: NoteParts, approved: string) {
  ensureFonts();
  const blob = await pdf(<NoteDocument encounter={encounter} doctor={doctor} parts={parts} approved={approved} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const code = (encounter.patient.code || encounter.id).replace(/[^\w-]+/g, "");
  anchor.href = url;
  anchor.download = `benh-an-ngoai-tru-${code}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

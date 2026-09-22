import { jsPDF } from "jspdf";
import type { Encounter } from "@/types";

const SOAP = [
  ["subjective", "Chủ quan"],
  ["objective", "Khách quan"],
  ["assessment", "Đánh giá"],
  ["plan", "Kế hoạch"],
] as const;

export type NoteParts = {
  patient: boolean;
  soap: boolean;
  icd: boolean;
  transcript: boolean;
};

function clock(total: number) {
  const sec = Math.max(0, Math.floor(total));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function paperDate(stamp: string) {
  const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return stamp;
  return `Ngày ${match[3]} tháng ${match[2]} năm ${match[1]}`;
}

function bufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** Tải file PDF. Tinos là font serif có dấu tiếng Việt, gần Times trên tờ giấy. */
export async function downloadNotePdf(encounter: Encounter, doctor: string, parts: NoteParts, approved: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const [regular, bold] = await Promise.all([
    fetch("/fonts/Tinos-Regular.ttf"),
    fetch("/fonts/Tinos-Bold.ttf"),
  ]);
  if (!regular.ok || !bold.ok) throw new Error("Không tải được font để xuất PDF.");
  doc.addFileToVFS("Tinos-Regular.ttf", bufferToBase64(await regular.arrayBuffer()));
  doc.addFileToVFS("Tinos-Bold.ttf", bufferToBase64(await bold.arrayBuffer()));
  doc.addFont("Tinos-Regular.ttf", "Tinos", "normal");
  doc.addFont("Tinos-Bold.ttf", "Tinos", "bold");

  const margin = 56;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = pageW - margin * 2;
  let y = margin;

  function ensure(height: number) {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
  }

  function write(text: string, size: number, weight: "normal" | "bold" = "normal", gap = 4, align: "left" | "center" | "right" = "left") {
    doc.setFont("Tinos", weight);
    doc.setFontSize(size);
    doc.setTextColor(26, 26, 26);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    const lineH = size * 1.45;
    const x = align === "center" ? pageW / 2 : align === "right" ? pageW - margin : margin;
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, x, y, { align });
      y += lineH;
    }
    y += gap;
  }

  function rule(width: number) {
    ensure(8);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(width);
    doc.line(margin, y, margin + maxW, y);
    y += 12;
  }

  write("CLINNOTE", 11, "normal", 2, "center");
  write("PHIẾU KHÁM BỆNH", 18, "bold", 2, "center");
  write(`Đã duyệt · ${approved}`, 12, "normal", 8, "center");
  rule(1.4);

  if (parts.patient) {
    const age = encounter.patient.age > 0 ? ` (${encounter.patient.age} tuổi)` : "";
    write(`Họ và tên:  ${encounter.patient.name}`, 13, "bold", 2);
    write(`Ngày sinh:  ${encounter.patient.dob || "—"}${age}`, 13, "normal", 2);
    write(`Giới tính:  ${encounter.patient.gender || "—"}`, 13, "normal", 2);
    write(`Mã bệnh nhân:  ${encounter.patient.code || "—"}`, 13, "normal", 2);
    write(`Lý do khám:  ${encounter.patient.reason || "—"}`, 13, "normal", 8);
    rule(0.6);
  }

  if (parts.soap) {
    SOAP.forEach(([key, name], index) => {
      write(`${index + 1}. ${name}`, 13, "bold", 2);
      write(encounter.soap[key].trim() || "—", 13, "normal", 8);
    });
  }

  if (parts.icd) {
    const icd =
      encounter.icdSuggestions.find((item) => item.code === encounter.selectedIcd) ?? encounter.icdSuggestions[0];
    write("Chẩn đoán (ICD-10)", 13, "bold", 2);
    write(icd ? `${icd.code} — ${icd.title}` : "Chưa chọn mã", 13, "normal", 8);
  }

  if (parts.transcript) {
    write("Bản ghi", 13, "bold", 2);
    if (encounter.transcript.length === 0) write("Không có bản ghi", 13, "normal", 8);
    for (const line of encounter.transcript) {
      const who = line.speaker === "doctor" ? "Bác sĩ" : "Bệnh nhân";
      write(`${clock(line.timestampSec)}  ${who}: ${line.text}`, 12, "normal", 2);
    }
    y += 8;
  }

  y += 16;
  write(paperDate(approved), 13, "normal", 2, "right");
  write("Bác sĩ khám bệnh", 13, "bold", 28, "right");
  write(doctor, 13, "bold", 0, "right");

  const code = (encounter.patient.code || encounter.id).replace(/[^\w-]+/g, "");
  doc.save(`phieu-kham-${code}.pdf`);
}

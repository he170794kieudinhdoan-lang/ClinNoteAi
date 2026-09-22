"use client";

/**
 * SoapEditor — cột phải Clinical Editor (S/O/A/P).
 *
 * HITL: AI chỉ draft. Bác sĩ sửa, xem ICD gợi ý, cảnh báo thiếu, rồi Approve.
 * status === "final" → khóa edit.
 *
 * TODO: 4 textarea, ICD list, missingFields, onChange → PATCH SOAP.
 */

import type { SoapNote } from "@/types";

export default function SoapEditor({ soap }: { soap: SoapNote }) {
  return (
    <section className="rounded border p-4">
      <h2 className="font-semibold">SOAP (draft)</h2>
      <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
        {`S: ${soap.subjective || "—"}\nO: ${soap.objective || "—"}\nA: ${soap.assessment || "—"}\nP: ${soap.plan || "—"}`}
      </pre>
    </section>
  );
}

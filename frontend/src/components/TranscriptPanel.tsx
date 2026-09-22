"use client";

/**
 * TranscriptPanel — cột trái Clinical Editor.
 * Hiển thị speaker diarization (bác sĩ / bệnh nhân) + timestamp.
 *
 * TODO: scroll, highlight đoạn đang phát, map evidence SOAP ↔ dòng transcript.
 */

import type { TranscriptLine } from "@/types";

export default function TranscriptPanel({ lines }: { lines: TranscriptLine[] }) {
  return (
    <section className="rounded border p-4">
      <h2 className="font-semibold">Transcript</h2>
      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Chưa có transcript (empty / đang record).</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line.id}>
              <strong>{line.speaker === "doctor" ? "BS" : "BN"}:</strong> {line.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

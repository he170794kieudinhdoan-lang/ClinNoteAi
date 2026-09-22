"use client";

/**
 * AudioRecorder — ghi âm / upload file buổi khám.
 *
 * Screen flow:
 *   empty  → Record | Upload
 *   recording → Stop
 *   xong → transcript + SOAP (uploaded / soap)
 *
 * TODO: dùng useRecorder(); upload File/Blob qua api.ts.
 */

import { useRecorder } from "@/hooks/useRecorder";

export default function AudioRecorder() {
  const { recording, start, stop } = useRecorder();

  return (
    <section className="rounded border p-4">
      <h2 className="font-semibold">Audio</h2>
      <button type="button" className="mt-2 underline" onClick={recording ? stop : start}>
        {recording ? "Stop (mock)" : "Record (mock)"}
      </button>
    </section>
  );
}

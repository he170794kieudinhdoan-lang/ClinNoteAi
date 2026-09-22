"use client";

/**
 * Clinical Editor (/encounters/[id])
 *
 * status quyết định màn (wireframe buổi 1):
 *   empty      — chưa audio
 *   recording  — đang ghi
 *   uploaded   — có transcript
 *   soap       — bản nháp SOAP (sửa được)
 *   final      — đã duyệt, khóa
 *
 * TODO: Record/Upload → STT → generate SOAP → bác sĩ sửa → Approve.
 */

import Link from "next/link";
import { use } from "react";
import AudioRecorder from "@/components/AudioRecorder";
import SoapEditor from "@/components/SoapEditor";
import TranscriptPanel from "@/components/TranscriptPanel";
import { useEncounter } from "@/hooks/useEncounter";

export default function ClinicalEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { encounter } = useEncounter(id);

  if (!encounter) {
    return (
      <main className="p-6">
        <p>Không có encounter <code>{id}</code>. Xem mock id: enc-1, enc-2.</p>
        <Link href="/" className="underline">
          Về Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <Link href="/" className="text-sm underline">
        ← Dashboard
      </Link>
      <h1 className="text-2xl font-semibold">Clinical Editor</h1>
      <p className="text-sm text-gray-600">
        {encounter.patient.name} · {encounter.status}
      </p>

      <AudioRecorder />
      <div className="grid gap-4 md:grid-cols-2">
        <TranscriptPanel lines={encounter.transcript} />
        <SoapEditor soap={encounter.soap} />
      </div>
    </main>
  );
}

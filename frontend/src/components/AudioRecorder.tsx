"use client";

/**
 * Khung Audio trên Clinical Editor.
 * Audio upload, recording placeholder, and JSON test import use separate tabs.
 */

import { memo, useEffect, useRef, useState } from "react";
import TranscriptPanel from "@/components/TranscriptPanel";
import type { TranscriptLine } from "@/types";

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;
const JSON_EXT = /\.json$/i;

function clock(total: number) {
  if (!Number.isFinite(total) || total < 0) return "00:00";
  const sec = Math.floor(total);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function isAudio(file: File) {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

function AudioRecorder({
  tab,
  onTab,
  fileName,
  audioUrl,
  lines,
  locked,
  isUploading,
  isProcessingTranscript,
  uploadError,
  onFile,
  onTranscriptJson,
  transcriptRunId,
  onOpenTranscriptRun,
  onClear,
  onLines,
  onRegen,
  showTranscript = true,
}: {
  tab: "upload" | "record" | "test";
  onTab: (tab: "upload" | "record" | "test") => void;
  fileName?: string;
  audioUrl: string | null;
  lines: TranscriptLine[];
  locked?: boolean;
  isUploading?: boolean;
  isProcessingTranscript?: boolean;
  uploadError?: string;
  onFile: (file: File) => void;
  onTranscriptJson: (file: File) => void;
  transcriptRunId?: string | null;
  onOpenTranscriptRun?: () => void;
  onClear: () => void;
  onLines?: (lines: TranscriptLine[]) => void;
  onRegen?: () => void;
  showTranscript?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const submitted = useRef(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<File | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const uploaded = Boolean(fileName);
  const knownDuration = Number.isFinite(duration) && duration > 0;
  const shownDuration = knownDuration
    ? duration
    : lines.reduce((max, line) => Math.max(max, line.endSec ?? line.timestampSec), 0);

  function pick(file: File | undefined) {
    if (!file || isUploading || isProcessingTranscript) return;
    if (tab === "test") {
      if (!JSON_EXT.test(file.name) && file.type !== "application/json") {
        setError("Chọn file JSON hội thoại đã phân vai.");
        return;
      }
      setError("");
      setPending(file);
      return;
    }
    if (tab !== "upload" || locked) return;
    if (!isAudio(file)) {
      setError("Chọn file âm thanh. Để thử JSON, mở tab Nhập JSON.");
      return;
    }
    setError("");
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setPending(file);
  }

  function exportPending() {
    if (!pending || isUploading || isProcessingTranscript || submitted.current) return;
    submitted.current = true;
    if (tab === "test") onTranscriptJson(pending);
    else onFile(pending);
  }

  useEffect(() => {
    if (!submitted.current || !pending) return;
    if (isUploading || isProcessingTranscript) return;
    submitted.current = false;
    if (tab === "test") {
      if (!uploadError) setPending(null);
      return;
    }
    if (fileName === pending.name) setPending(null);
  }, [fileName, isProcessingTranscript, isUploading, pending, tab, uploadError]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  function switchTab(next: "upload" | "record" | "test") {
    setPlaying(false);
    setOver(false);
    setError("");
    setPending(null);
    submitted.current = false;
    onTab(next);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
        <h2 className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Âm thanh</h2>
        <div role="group" aria-label="Nguồn hội thoại" className="flex h-8 overflow-hidden rounded-lg border border-line text-[11px]">
          <button
            type="button"
            aria-pressed={tab === "upload"}
            disabled={isUploading || isProcessingTranscript}
            onClick={() => switchTab("upload")}
            className={`px-2.5 disabled:opacity-50 ${tab === "upload" ? "bg-subtle font-semibold text-ink" : "bg-white text-muted"}`}
          >
            Tải lên
          </button>
          <button
            type="button"
            aria-pressed={tab === "record"}
            disabled={isUploading || isProcessingTranscript}
            onClick={() => switchTab("record")}
            className={`border-l border-line px-2.5 disabled:opacity-50 ${tab === "record" ? "bg-subtle font-semibold text-ink" : "bg-white text-muted"}`}
          >
            Ghi âm
          </button>
          <button
            type="button"
            aria-pressed={tab === "test"}
            disabled={isUploading || isProcessingTranscript}
            onClick={() => switchTab("test")}
            className={`border-l border-line px-2.5 disabled:opacity-50 ${tab === "test" ? "bg-subtle font-semibold text-ink" : "bg-white text-muted"}`}
          >
            Nhập JSON
          </button>
        </div>
      </header>

      {tab === "record" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-bold">Ghi âm</p>
          <p className="max-w-56 text-sm text-muted">Màn ghi âm trực tiếp ở bước sau. Dùng Tải lên để đưa file vào lượt khám.</p>
        </div>
      ) : isUploading || isProcessingTranscript ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" />
          <div
            role="status"
            className="absolute top-1/2 left-1/2 w-[min(16rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-white px-4 py-4 text-center"
          >
            <p className="text-sm font-bold">{isProcessingTranscript ? "Đang tạo ghi chú từ file JSON..." : "Đang xử lý âm thanh..."}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="wf-cover-sweep block h-full w-1/3 rounded-full bg-ink" />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {isProcessingTranscript
                ? "Dùng nội dung đã phân vai; không chạy lại nhận dạng âm thanh."
                : "Đang nhận diện giọng nói và phân vai bác sĩ / bệnh nhân..."}
            </p>
          </div>
        </div>
      ) : pending ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-line px-2.5 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-line bg-subtle text-sm" aria-hidden>
              {tab === "test" ? "JSON" : "♪"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{pending.name}</span>
              <span className="text-[11px] text-muted">Đã chọn, chưa xuất hội thoại</span>
            </span>
            <button type="button" onClick={() => setPending(null)} aria-label="Bỏ file đã chọn" className="px-1 text-sm text-muted hover:text-ink">
              ✕
            </button>
          </div>
          <button
            type="button"
            onClick={exportPending}
            disabled={locked}
            className="h-9 rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-45"
          >
            Xuất hội thoại
          </button>
          {(uploadError || error) && <p role="alert" className="text-sm text-rose-700">{uploadError || error}</p>}
        </div>
      ) : tab === "test" ? (
        <div className="flex flex-1 flex-col p-3.5">
          <label
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => { event.preventDefault(); setOver(false); pick(event.dataTransfer.files[0]); }}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-8 text-center ${over ? "border-ink bg-subtle" : "border-line"}`}
          >
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ""; }}
            />
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-subtle text-xl" aria-hidden>JSON</span>
            <span className="text-sm font-bold">Kéo thả file JSON hội thoại</span>
            <span className="text-xs text-muted">Nhận file JSON đã phân vai bác sĩ và bệnh nhân.</span>
            <span className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white">Chọn file JSON</span>
          </label>
          {(uploadError || error) && <p role="alert" className="pt-2 text-sm text-rose-700">{uploadError || error}</p>}
          {transcriptRunId && <button type="button" onClick={onOpenTranscriptRun} className="w-fit pt-2 text-xs font-semibold underline">Mở bản JSON đã lưu</button>}
        </div>
      ) : uploaded ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-line px-2.5 py-2">
            <span className="grid h-7 w-7 place-items-center rounded-md border border-line bg-subtle text-sm" aria-hidden>
              ♪
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{fileName}</span>
              <span className="text-[11px] text-muted">{shownDuration > 0 ? clock(shownDuration) : "Đã tải"}</span>
            </span>
            {!locked && (
              <button type="button" onClick={onClear} aria-label="Gỡ file âm thanh" className="px-1 text-sm text-muted hover:text-ink">
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              disabled={!audioUrl}
              aria-label={playing ? "Tạm dừng" : "Phát"}
              className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-[10px] disabled:text-faint"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={knownDuration ? duration : 0}
              step={0.1}
              value={knownDuration ? Math.min(time, duration) : 0}
              disabled={!audioUrl || !knownDuration}
              aria-label="Vị trí phát"
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audioRef.current) audioRef.current.currentTime = next;
                setTime(next);
              }}
              className="h-1.5 flex-1 cursor-pointer accent-ink disabled:cursor-not-allowed"
            />
            <span className="font-mono text-[10px] text-muted">
              {clock(time)} / {shownDuration > 0 ? clock(shownDuration) : "00:00"}
            </span>
          </div>

          {audioUrl && (
            <audio
              ref={audioRef}
              className="hidden"
              src={audioUrl}
              preload="metadata"
              onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
              onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          )}

          {showTranscript && <TranscriptPanel lines={lines} locked={locked} onChange={onLines} onRegen={onRegen} />}
          {(uploadError || error) && <p role="alert" className="text-sm text-rose-700">{uploadError || error}</p>}
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-3.5">
          <label
            data-guide="upload"
            onDragOver={(event) => {
              event.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              pick(event.dataTransfer.files[0]);
            }}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-8 text-center ${
              over ? "border-ink bg-subtle" : "border-line"
            }`}
          >
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
              className="sr-only"
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-subtle text-2xl" aria-hidden>
              ♪
            </span>
            <span className="text-sm font-bold">Kéo thả file âm thanh</span>
            <span className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-white">
              Chọn file
            </span>
          </label>
          {(uploadError || error) && <p role="alert" className="pt-2 text-sm text-rose-700">{uploadError || error}</p>}
        </div>
      )}
    </section>
  );
}

export default memo(AudioRecorder);

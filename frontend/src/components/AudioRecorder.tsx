"use client";

/**
 * Khung Audio trên Clinical Editor.
 * Upload: thả file → màn đã tải. Record: màn ghi âm ở bước sau.
 */

import { useEffect, useRef, useState } from "react";
import TranscriptPanel from "@/components/TranscriptPanel";
import type { TranscriptLine } from "@/types";

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|webm|flac)$/i;

function clock(total: number) {
  if (!Number.isFinite(total) || total < 0) return "00:00";
  const sec = Math.floor(total);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function isAudio(file: File) {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

export default function AudioRecorder({
  tab,
  onTab,
  fileName,
  audioUrl,
  lines,
  locked,
  onFile,
  onClear,
}: {
  tab: "upload" | "record";
  onTab: (tab: "upload" | "record") => void;
  fileName?: string;
  audioUrl: string | null;
  lines: TranscriptLine[];
  locked?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const uploaded = Boolean(fileName);
  const knownDuration = Number.isFinite(duration) && duration > 0;
  const shownDuration = knownDuration ? duration : lines.reduce((max, line) => Math.max(max, line.timestampSec), 0);

  useEffect(() => {
    if (tab !== "upload") setPlaying(false);
  }, [tab]);

  function pick(file: File | undefined) {
    if (!file || locked) return;
    if (!isAudio(file)) {
      setError("Chọn file âm thanh.");
      return;
    }
    setError("");
    setPlaying(false);
    setTime(0);
    setDuration(0);
    onFile(file);
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }

  return (
    <section className="flex min-h-72 flex-1 flex-col border border-[#c9bba8] bg-[#fffdf8] lg:min-h-0">
      <header className="flex items-center justify-between gap-2 border-b border-[#c9bba8] bg-[#efe6d8] px-3.5 py-2">
        <h2 className="text-sm font-bold">Âm thanh</h2>
        <div className="flex h-6 w-32 overflow-hidden border border-[#c9bba8] text-[11px]">
          <button
            type="button"
            onClick={() => onTab("upload")}
            className={`flex-1 ${tab === "upload" ? "bg-[#e4d5bc] font-bold text-[#3e342c]" : "bg-[#fffdf8] text-[#866e5a]"}`}
          >
            Tải lên
          </button>
          <button
            type="button"
            onClick={() => onTab("record")}
            className={`flex-1 border-l border-[#c9bba8] ${tab === "record" ? "bg-[#e4d5bc] font-bold text-[#3e342c]" : "bg-[#fffdf8] text-[#866e5a]"}`}
          >
            Ghi âm
          </button>
        </div>
      </header>

      {tab === "record" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-sm font-bold">Ghi âm</p>
          <p className="max-w-56 text-sm text-[#866e5a]">Màn ghi âm trực tiếp ở bước sau. Dùng Tải lên để đưa file vào lượt khám.</p>
        </div>
      ) : uploaded ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 border border-[#c9bba8] px-2.5 py-2">
            <span className="grid h-7 w-7 place-items-center border border-[#c9bba8] text-sm" aria-hidden>
              ♪
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{fileName}</span>
              <span className="text-[11px] text-[#866e5a]">{shownDuration > 0 ? clock(shownDuration) : "Đã tải"}</span>
            </span>
            {!locked && (
              <button type="button" onClick={onClear} aria-label="Gỡ file âm thanh" className="px-1 text-sm text-[#866e5a] hover:text-[#3e342c]">
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
              className="grid h-7 w-7 place-items-center rounded-full border border-[#c9bba8] bg-[#fffdf8] text-[10px] disabled:text-[#b3a394]"
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
              className="h-1.5 flex-1 cursor-pointer accent-[#5c4e42] disabled:cursor-not-allowed"
            />
            <span className="font-mono text-[10px] text-[#866e5a]">
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

          <TranscriptPanel lines={lines} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col p-3.5">
          <label
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
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed px-5 py-8 text-center ${
              over ? "border-[#5c4e42] bg-[#efe6d8]" : "border-[#c9bba8]"
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
            <span className="grid h-14 w-14 place-items-center border-2 border-[#c9bba8] text-2xl" aria-hidden>
              ♪
            </span>
            <span className="text-sm font-bold">Kéo thả file âm thanh</span>
            <span className="inline-flex h-8 items-center border border-[#c9bba8] bg-[#fffdf8] px-4 text-sm shadow-[2px_2px_0_#e4d8c8]">
              Chọn file
            </span>
          </label>
          {error && <p className="pt-2 text-sm text-rose-700">{error}</p>}
        </div>
      )}
    </section>
  );
}

"use client";

/**
 * useRecorder — ghi âm buổi khám (MediaRecorder + getUserMedia).
 *
 * TODO triển khai:
 * 1. start(): navigator.mediaDevices.getUserMedia({ audio: true })
 * 2. MediaRecorder.start() / stop() → Blob
 * 3. Đưa Blob lên BE (multipart) rồi nhận transcript
 *
 * Hiện chỉ trả state giả để AudioRecorder gắn nút được.
 */

import { useState } from "react";

export function useRecorder() {
  const [recording, setRecording] = useState(false);

  const start = () => setRecording(true);
  const stop = () => setRecording(false);

  return { recording, start, stop };
}

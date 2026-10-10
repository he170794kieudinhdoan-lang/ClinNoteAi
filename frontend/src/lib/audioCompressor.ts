/**
 * Tiện ích nén và chuẩn hóa âm thanh phía client trước khi upload lên máy chủ.
 * Chuyển đổi và nén audio về chuẩn 16.000 Hz Mono (chuẩn tối ưu cho mô hình STT như Blaze và Whisper).
 * Giúp giảm 60% - 90% dung lượng file và rút ngắn đáng kể thời gian upload.
 */

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM 16-bit
  const bitDepth = 16;
  const channelData = buffer.getChannelData(0);
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = channelData.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // ChunkID: "RIFF"
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  // Format: "WAVE"
  writeString(view, 8, "WAVE");

  // Subchunk1: "fmt "
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // SubChunk1Size (16 cho PCM)
  view.setUint16(20, format, true); // AudioFormat (1)
  view.setUint16(22, numChannels, true); // Số kênh (1 = Mono)
  view.setUint32(24, sampleRate, true); // Tần số lấy mẫu (16000)
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample (16-bit)

  // Subchunk2: "data"
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Ghi các mẫu âm thanh PCM 16-bit
  let offset = 44;
  for (let i = 0; i < channelData.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  ratio: number; // Tỷ lệ giảm (0.0 - 1.0)
  wasCompressed: boolean;
}

/**
 * Nén và chuẩn hóa âm thanh sang 16kHz Mono.
 * Nếu file ban đầu đã rất nhỏ hoặc quá trình nén không giúp giảm kích thước,
 * hàm sẽ an toàn giữ nguyên file gốc.
 */
export async function optimizeAudioForStt(
  file: File,
  onProgress?: (message: string) => void
): Promise<CompressResult> {
  const originalSize = file.size;

  // Bỏ qua nếu môi trường không phải trình duyệt hoặc file dưới 300KB
  if (
    typeof window === "undefined" ||
    (!window.AudioContext && !(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) ||
    file.size < 300 * 1024
  ) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      ratio: 0,
      wasCompressed: false,
    };
  }

  try {
    onProgress?.("Đang tối ưu & nén âm thanh (16kHz Mono)...");

    const arrayBuffer = await file.arrayBuffer();
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const tempCtx = new AudioCtxClass();
    const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);
    await tempCtx.close();

    const targetSampleRate = 16000; // Chuẩn mẫu tối ưu cho STT tiếng Việt
    const targetLength = Math.ceil(decodedBuffer.duration * targetSampleRate);

    // Dùng OfflineAudioContext để xử lý siêu tốc bằng phần cứng
    const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = decodedBuffer;
    sourceNode.connect(offlineCtx.destination);
    sourceNode.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = audioBufferToWav(renderedBuffer);

    // Chỉ dùng file nén nếu kích thước nhỏ hơn file ban đầu
    if (wavBlob.size < originalSize) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      const compressedFile = new File([wavBlob], `${baseName}.wav`, {
        type: "audio/wav",
        lastModified: Date.now(),
      });
      const ratio = Math.round((1 - compressedFile.size / originalSize) * 100);

      return {
        file: compressedFile,
        originalSize,
        compressedSize: compressedFile.size,
        ratio,
        wasCompressed: true,
      };
    }

    return {
      file,
      originalSize,
      compressedSize: originalSize,
      ratio: 0,
      wasCompressed: false,
    };
  } catch (err) {
    console.warn("Không thể nén âm thanh ở client, tiếp tục dùng file gốc:", err);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      ratio: 0,
      wasCompressed: false,
    };
  }
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileCheck,
  Mic,
  ShieldCheck,
  TextQuote,
  Volume2,
} from "lucide-react";

// 3 Phân cảnh mô phỏng luồng kết nối liên hoàn:
// Mỗi cảnh ~2.4s - 2.8s, tổng cộng chỉ ~7.6 giây cho cả vòng tua
const SCENE_DURATIONS = [2400, 2400, 2800];

export default function InfinityHeroStage() {
  const [currentStep, setCurrentStep] = useState<0 | 1 | 2>(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Responsive scale cho 3D isometric stage
  useEffect(() => {
    function updateScale() {
      if (!containerRef.current) return;
      const width = containerRef.current.clientWidth;
      const baseWidth = 1040;
      const targetScale = Math.min(1.0, Math.max(0.42, (width - 16) / baseWidth));
      setScale(targetScale);
    }
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  // Thay thế rAF 60fps bằng timer nhẹ nhàng theo chuẩn fixing-motion-performance
  // Chỉ kích hoạt render khi chuyển step, giảm 99% tải CPU cho trình duyệt
  useEffect(() => {
    if (!isPlaying) return;
    const duration = SCENE_DURATIONS[currentStep];
    const timer = window.setTimeout(() => {
      setCurrentStep((prev) => ((prev + 1) % 3) as 0 | 1 | 2);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [currentStep, isPlaying]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      className="relative w-full overflow-visible bg-white pt-2 sm:pt-4 pb-4 select-none"
    >
      {/* 1. Nền Wireframe Blueprint Tinh Tế (Subtle Schematic Grid) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="wireframe-aurora" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,rgba(5,150,105,0.05),transparent_80%)]" />
      </div>

      {/* 2. KHUNG SÂN KHẤU CHÍNH */}
      <div className="relative min-h-[500px] sm:min-h-[530px] md:min-h-[560px] w-full flex items-center justify-center overflow-visible">
        
        {/* Lưới tọa độ wireframe nhạt */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_65%_50%_at_50%_50%,black_30%,transparent_90%)] pointer-events-none" />

        {/* Khung Scaled Responsive Viewport (1040px x 480px) */}
        <div
          className="origin-center transition-transform duration-500 ease-out"
          style={{
            width: "1040px",
            height: "480px",
            transform: `scale(${scale})`,
          }}
        >
          <div className="relative h-full w-full inf-iso-canvas">
            
            {/* ----------------- KHỐI 1: GHI ÂM & PHÂN VAI (x: 25px -> 315px) ----------------- */}
            <div
              className={`absolute left-[25px] top-[30px] w-[290px] rounded-3xl bg-white p-4 transition-all duration-500 ease-out ${
                currentStep === 0
                  ? "border-2 border-emerald-500 shadow-lg scale-[1.08] opacity-100 z-30 ring-2 ring-emerald-500/20"
                  : "border border-neutral-300/80 shadow-xs opacity-45 scale-[0.88] z-10"
              }`}
            >
              {/* Header Khối 1 */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${currentStep === 0 ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`} />
                  <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 text-balance">
                    <Volume2 size={14} className={currentStep === 0 ? "text-emerald-600" : "text-neutral-500"} />
                    1. Ghi âm & Phân vai
                  </span>
                </div>
                <span className={`font-mono tabular-nums text-[11px] font-bold px-2 py-0.5 rounded ${
                  currentStep === 0 ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-neutral-100 text-neutral-600"
                }`}>
                  01:25
                </span>
              </div>

              {/* Sóng âm thanh */}
              <div className="my-3 flex items-center justify-center gap-1.5 h-10 px-1 rounded-xl bg-neutral-50 border border-neutral-200/80">
                {[25, 55, 85, 100, 70, 40, 85, 95, 65, 45, 90, 60, 75, 100, 50, 70, 35].map((h, i) => (
                  <span
                    key={i}
                    className={`w-1.5 rounded-full animate-wave-bounce-loop ${
                      currentStep === 0 ? "bg-emerald-500" : "bg-neutral-400"
                    }`}
                    style={{
                      height: `${h}%`,
                      animationDelay: `${i * 0.08}s`,
                    }}
                  />
                ))}
              </div>

              {/* Lời thoại phân vai */}
              <div className="space-y-2 mt-2">
                <div className="rounded-xl bg-neutral-50 p-2.5 border border-neutral-200 text-xs">
                  <div className="flex items-center justify-between text-[10.5px] mb-0.5 font-bold text-neutral-700">
                    <span>Bệnh nhân (00:10):</span>
                    <span className="text-[10px] text-neutral-400 font-mono tabular-nums">Triệu chứng</span>
                  </div>
                  <p className="text-neutral-700 leading-snug text-pretty">
                    “2 tuần nay tôi hay bị nóng rát sau xương ức, thường ợ chua sau ăn no...”
                  </p>
                </div>
                <div className="rounded-xl bg-neutral-50 p-2.5 border border-neutral-200 text-xs">
                  <div className="flex items-center justify-between text-[10.5px] mb-0.5 font-bold text-neutral-700">
                    <span>Bác sĩ (00:35):</span>
                    <span className="text-[10px] text-neutral-400 font-mono tabular-nums">Khám lâm sàng</span>
                  </div>
                  <p className="text-neutral-700 leading-snug text-pretty">
                    “Bụng mềm, ấn tức nhẹ thượng vị. Nghiêng về trào ngược dạ dày.”
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-neutral-100 p-2 text-[11px] text-neutral-700 font-medium flex items-center justify-between border border-neutral-200">
                <span className="flex items-center gap-1.5">
                  <Mic size={13} className={currentStep === 0 ? "text-emerald-600" : "text-neutral-500"} />
                  <span>Tự nhận biết người nói</span>
                </span>
                <span className="font-bold text-neutral-900 tabular-nums">Độ khớp 99%</span>
              </div>
            </div>

            {/* ----------------- DÂY NỐI 1: TỪ KHỐI 1 SANG KHỐI 2 ----------------- */}
            <svg
              className="absolute left-0 top-0 w-full h-full pointer-events-none"
              style={{ zIndex: 15 }}
            >
              <defs>
                <linearGradient id="cableGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={currentStep >= 1 ? "#059669" : "#cbd5e1"} />
                  <stop offset="100%" stopColor={currentStep >= 1 ? "#10b981" : "#cbd5e1"} />
                </linearGradient>
              </defs>
              <path
                d="M 315 130 C 340 130, 340 100, 365 100"
                fill="none"
                stroke="url(#cableGrad1)"
                strokeWidth={currentStep === 1 ? "4" : currentStep > 1 ? "2.5" : "1.5"}
                strokeDasharray={currentStep >= 1 ? "6 3" : "4 4"}
                className={currentStep >= 1 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 1 ? 1 : currentStep > 1 ? 0.6 : 0.3 }}
              />
              <path
                d="M 315 220 C 340 220, 340 190, 365 190"
                fill="none"
                stroke="url(#cableGrad1)"
                strokeWidth={currentStep === 1 ? "4" : currentStep > 1 ? "2.5" : "1.5"}
                strokeDasharray={currentStep >= 1 ? "6 3" : "4 4"}
                className={currentStep >= 1 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 1 ? 1 : currentStep > 1 ? 0.6 : 0.3 }}
              />
              <path
                d="M 315 310 C 340 310, 340 280, 365 280"
                fill="none"
                stroke="url(#cableGrad1)"
                strokeWidth={currentStep === 1 ? "4" : currentStep > 1 ? "2.5" : "1.5"}
                strokeDasharray={currentStep >= 1 ? "6 3" : "4 4"}
                className={currentStep >= 1 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 1 ? 1 : currentStep > 1 ? 0.6 : 0.3 }}
              />
            </svg>

            {/* ----------------- KHỐI 2: BÓC TÁCH DỮ KIỆN Y KHOA (x: 365px -> 655px) ----------------- */}
            <div
              className={`absolute left-[365px] top-[30px] w-[290px] rounded-3xl bg-white p-4 transition-all duration-500 ease-out ${
                currentStep === 1
                  ? "border-2 border-emerald-500 shadow-lg scale-[1.08] opacity-100 z-30 ring-2 ring-emerald-500/20"
                  : "border border-neutral-300/80 shadow-xs opacity-45 scale-[0.88] z-10"
              }`}
            >
              {/* Header Khối 2 */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <span className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 text-balance">
                  <ShieldCheck size={15} className={currentStep === 1 ? "text-emerald-600" : "text-neutral-500"} />
                  2. Bóc tách & Đối chiếu
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  currentStep === 1 ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-neutral-100 text-neutral-600"
                }`}>
                  Khớp 100%
                </span>
              </div>

              {/* 3 Thẻ dữ kiện y khoa trích dẫn */}
              <div className="space-y-2 mt-3">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs relative overflow-hidden">
                  {currentStep === 1 && <div className="scanner-line-sweep" />}
                  <div className="flex items-center justify-between text-[10.5px] text-neutral-500 mb-0.5">
                    <span className="font-bold text-neutral-800">Triệu chứng (00:10)</span>
                    <span className="italic text-emerald-700 font-semibold">Đã xác thực</span>
                  </div>
                  <p className="text-neutral-800 font-medium leading-snug text-pretty">Nóng rát sau xương ức 2 tuần, thường ợ chua sau ăn</p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs relative overflow-hidden">
                  {currentStep === 1 && <div className="scanner-line-sweep" style={{ animationDelay: "0.8s" }} />}
                  <div className="flex items-center justify-between text-[10.5px] text-neutral-500 mb-0.5">
                    <span className="font-bold text-neutral-800">Khám thực thể (00:35)</span>
                    <span className="italic text-emerald-700 font-semibold">Đã xác thực</span>
                  </div>
                  <p className="text-neutral-800 font-medium leading-snug text-pretty">Bụng mềm, ấn tức nhẹ thượng vị, không đề kháng</p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs relative overflow-hidden">
                  {currentStep === 1 && <div className="scanner-line-sweep" style={{ animationDelay: "1.6s" }} />}
                  <div className="flex items-center justify-between text-[10.5px] text-neutral-500 mb-0.5">
                    <span className="font-bold text-neutral-800">Chẩn đoán sơ bộ (00:35)</span>
                    <span className="italic text-emerald-700 font-semibold">Đã xác thực</span>
                  </div>
                  <p className="text-neutral-800 font-medium leading-snug text-pretty">Theo dõi Trào ngược dạ dày thực quản (GERD)</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-neutral-100 p-2 text-center text-[10.5px] text-neutral-700 font-medium border border-neutral-200">
                🛡️ Cơ chế chống bịa đặt (Anti-Hallucination)
              </div>
            </div>

            {/* ----------------- DÂY NỐI 2: TỪ KHỐI 2 SANG KHỐI 3 ----------------- */}
            <svg
              className="absolute left-0 top-0 w-full h-full pointer-events-none"
              style={{ zIndex: 15 }}
            >
              <defs>
                <linearGradient id="cableGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={currentStep >= 2 ? "#059669" : "#cbd5e1"} />
                  <stop offset="100%" stopColor={currentStep >= 2 ? "#10b981" : "#cbd5e1"} />
                </linearGradient>
              </defs>
              <path
                d="M 655 100 C 680 100, 680 120, 705 120"
                fill="none"
                stroke="url(#cableGrad2)"
                strokeWidth={currentStep === 2 ? "4" : "1.5"}
                strokeDasharray={currentStep >= 2 ? "6 3" : "4 4"}
                className={currentStep >= 2 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 2 ? 1 : 0.3 }}
              />
              <path
                d="M 655 190 C 680 190, 680 200, 705 200"
                fill="none"
                stroke="url(#cableGrad2)"
                strokeWidth={currentStep === 2 ? "4" : "1.5"}
                strokeDasharray={currentStep >= 2 ? "6 3" : "4 4"}
                className={currentStep >= 2 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 2 ? 1 : 0.3 }}
              />
              <path
                d="M 655 280 C 680 280, 680 280, 705 280"
                fill="none"
                stroke="url(#cableGrad2)"
                strokeWidth={currentStep === 2 ? "4" : "1.5"}
                strokeDasharray={currentStep >= 2 ? "6 3" : "4 4"}
                className={currentStep >= 2 ? "stream-particle-line" : ""}
                style={{ opacity: currentStep === 2 ? 1 : 0.3 }}
              />
            </svg>

            {/* ----------------- KHỐI 3: DỰNG BỆNH ÁN SOAP & ICD-10 (x: 705px -> 995px) ----------------- */}
            <div
              className={`absolute left-[705px] top-[30px] w-[290px] rounded-3xl bg-white p-4 transition-all duration-500 ease-out ${
                currentStep === 2
                  ? "border-2 border-emerald-500 shadow-lg scale-[1.08] opacity-100 z-30 ring-2 ring-emerald-500/20"
                  : "border border-neutral-300/80 shadow-xs opacity-45 scale-[0.88] z-10"
              }`}
            >
              {/* Header Khối 3 */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                <div className="flex items-center gap-1.5">
                  <FileCheck size={14} className={currentStep === 2 ? "text-emerald-700" : "text-neutral-500"} />
                  <span className="text-xs font-bold text-neutral-900 text-balance">3. Bệnh án SOAP & ICD</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 size={11} />
                  Đã ký duyệt
                </span>
              </div>

              {/* 4 Mục SOAP thu gọn có nút [≡ Nguồn] */}
              <div className="mt-2.5 space-y-1.5 text-[11px] leading-snug">
                <div className="rounded-lg bg-neutral-50 p-1.5 border border-neutral-200 flex items-start justify-between gap-1">
                  <p className="text-neutral-700 truncate max-w-[205px]">
                    <strong className="font-mono text-neutral-900">[S]</strong> Nóng rát sau xương ức 2 tuần...
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-neutral-800 border border-neutral-300">
                    <TextQuote size={9} className="text-emerald-700" /> Nguồn
                  </span>
                </div>

                <div className="rounded-lg bg-neutral-50 p-1.5 border border-neutral-200 flex items-start justify-between gap-1">
                  <p className="text-neutral-700 truncate max-w-[205px]">
                    <strong className="font-mono text-neutral-900">[O]</strong> Bụng mềm, ấn tức nhẹ thượng vị...
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-neutral-800 border border-neutral-300">
                    <TextQuote size={9} className="text-emerald-700" /> Nguồn
                  </span>
                </div>

                <div className="rounded-lg bg-neutral-50 p-1.5 border border-neutral-200 flex items-start justify-between gap-1">
                  <p className="text-neutral-900 font-medium truncate max-w-[205px]">
                    <strong className="font-mono text-neutral-900">[A]</strong> Trào ngược dạ dày thực quản
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-neutral-800 border border-neutral-300">
                    <TextQuote size={9} className="text-emerald-700" /> Nguồn
                  </span>
                </div>

                <div className="rounded-lg bg-neutral-50 p-1.5 border border-neutral-200 flex items-start justify-between gap-1">
                  <p className="text-neutral-700 truncate max-w-[205px]">
                    <strong className="font-mono text-neutral-900">[P]</strong> Esomeprazole 40mg, kiêng dầu mỡ...
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-neutral-800 border border-neutral-300">
                    <TextQuote size={9} className="text-emerald-700" /> Nguồn
                  </span>
                </div>
              </div>

              {/* Thẻ gợi ý ICD-10 Bộ Y Tế */}
              <div className="mt-2.5 rounded-xl bg-emerald-50/70 p-2 border border-emerald-200 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-black text-emerald-950 text-xs">K21.9</span>
                  <span className="text-[10.5px] text-emerald-900 font-medium ml-1.5">GERD không viêm</span>
                </div>
                <span className="text-[9.5px] font-bold bg-white text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums">
                  Khớp 95%
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Styles & Animation cho Connected Pipeline */}
      <style jsx>{`
        .wireframe-aurora {
          position: absolute;
          top: -30%;
          left: -20%;
          height: 130%;
          width: 260%;
          background: radial-gradient(ellipse at center, rgba(5, 150, 105, 0.04), transparent 75%);
          opacity: 0.8;
          filter: blur(50px);
        }

        .inf-iso-canvas {
          transform: skewY(-3deg) rotateX(1.8deg);
          transform-style: preserve-3d;
        }

        /* Tia quét scanner nhẹ nhàng */
        .scanner-line-sweep {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #059669, transparent);
          animation: scan-sweep 1.6s ease-in-out infinite;
        }

        @keyframes scan-sweep {
          0% {
            top: 0%;
            opacity: 0;
          }
          20% {
            opacity: 0.8;
          }
          80% {
            opacity: 0.8;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }

        @keyframes stream-particle-flow {
          0% {
            stroke-dashoffset: 20;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }

        .stream-particle-line {
          animation: stream-particle-flow 0.85s linear infinite;
        }

        @keyframes wave-bounce-anim {
          0%, 100% {
            transform: scaleY(0.28);
          }
          50% {
            transform: scaleY(1);
          }
        }

        .animate-wave-bounce-loop {
          animation: wave-bounce-anim 0.9s ease-in-out infinite;
          transform-origin: bottom;
        }

        /* Hỗ trợ accessibility: tắt animation nếu người dùng bật giảm chuyển động */
        @media (prefers-reduced-motion: reduce) {
          .animate-wave-bounce-loop,
          .stream-particle-line,
          .scanner-line-sweep {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

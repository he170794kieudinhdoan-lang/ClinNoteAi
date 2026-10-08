"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  HelpCircle,
  Layers,
  Lock,
  Menu,
  Mic,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

const sections = [
  { id: "hero", label: "Tổng quan & Demo" },
  { id: "features", label: "So sánh lâm sàng" },
  { id: "how-it-works", label: "Quy trình CAP" },
  { id: "security", label: "Bảo mật y tế" },
  { id: "faq", label: "Hỏi đáp thường gặp" },
];

export default function HomeLandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [activeTab, setActiveTab] = useState<"transcript" | "cap" | "soap">("soap");
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>("cap-1");
  const [activeSection, setActiveSection] = useState<string>("hero");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [consultationStep, setConsultationStep] = useState(0);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session?.user));
    });
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (windowHeight > 0) {
        setScrollProgress((totalScroll / windowHeight) * 100);
      }
      setShowScrollTop(totalScroll > 400);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        rootMargin: "-25% 0px -40% 0px",
        threshold: 0,
      }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  const sampleTranscript = [
    {
      id: "tr-1",
      speaker: "Bác sĩ",
      time: "00:04",
      text: "Chào anh, hôm nay anh thấy khó chịu ở đâu mà đến khám?",
    },
    {
      id: "tr-2",
      speaker: "Bệnh nhân",
      time: "00:10",
      text: "Dạ thưa bác sĩ, khoảng 2 tuần nay tôi hay bị nóng rát vùng sau xương ức, thường ợ chua sau khi ăn no và khi nằm nghỉ.",
    },
    {
      id: "tr-3",
      speaker: "Bác sĩ",
      time: "00:22",
      text: "Anh có cảm giác đau thắt ngực lan ra sau lưng hay khó thở không?",
    },
    {
      id: "tr-4",
      speaker: "Bệnh nhân",
      time: "00:31",
      text: "Dạ không đau tức ngực, không khó thở. Tôi từng có tiền sử đau dạ dày cách đây 2 năm.",
    },
    {
      id: "tr-5",
      speaker: "Bác sĩ",
      time: "00:46",
      text: "Huyết áp hiện tại 125/80 mmHg, mạch 76 lần/phút. Bụng mềm, ấn tức nhẹ vùng thượng vị, không có đề kháng thành bụng.",
    },
    {
      id: "tr-6",
      speaker: "Bác sĩ",
      time: "01:05",
      text: "Chẩn đoán bước đầu là Trào ngược dạ dày thực quản (GERD). Tôi sẽ kê đơn Esomeprazole 40mg trong 4 tuần kèm tư vấn sinh hoạt.",
    },
  ];

  const sampleCaps = [
    {
      id: "cap-1",
      category: "Triệu chứng cơ năng",
      fact: "Nóng rát sau xương ức và ợ chua sau khi ăn no, tăng khi nằm nghỉ",
      speaker: "Bệnh nhân",
      evidence: "hay bị nóng rát vùng sau xương ức, thường ợ chua sau khi ăn no và khi nằm nghỉ",
      polarity: "Khẳng định",
    },
    {
      id: "cap-2",
      category: "Phủ định loại trừ",
      fact: "Không đau thắt ngực lan ra sau lưng, không khó thở",
      speaker: "Bệnh nhân",
      evidence: "không đau tức ngực, không khó thở",
      polarity: "Phủ định",
    },
    {
      id: "cap-3",
      category: "Tiền sử bệnh",
      fact: "Tiền sử viêm đau dạ dày cách đây 2 năm",
      speaker: "Bệnh nhân",
      evidence: "Tôi từng có tiền sử đau dạ dày cách đây 2 năm",
      polarity: "Tiền sử",
    },
    {
      id: "cap-4",
      category: "Khám thực thể",
      fact: "HA 125/80 mmHg, Mạch 76 l/p, ấn tức nhẹ thượng vị, bụng mềm",
      speaker: "Bác sĩ",
      evidence: "Huyết áp hiện tại 125/80 mmHg, mạch 76 lần/phút. Bụng mềm, ấn tức nhẹ vùng thượng vị",
      polarity: "Khách quan",
    },
    {
      id: "cap-5",
      category: "Kế hoạch điều trị",
      fact: "Kê đơn Esomeprazole 40mg dùng trong 4 tuần, hướng dẫn chế độ sinh hoạt",
      speaker: "Bác sĩ",
      evidence: "Tôi sẽ kê đơn Esomeprazole 40mg trong 4 tuần kèm tư vấn sinh hoạt",
      polarity: "Kế hoạch",
    },
  ];

  const faqs = [
    {
      q: "ClinNote AI khác biệt như thế nào so với việc đưa hội thoại vào các LLM thông thường?",
      a: "Các mô hình ngôn ngữ lớn (LLM) thông thường xử lý văn bản theo cơ chế tổng quát, tiềm ẩn nguy cơ sai lệch thông tin (hallucination), nhầm lẫn giữa lời kể chủ quan của người bệnh với nhận định chuyên môn của bác sĩ, hoặc bỏ sót các phát biểu phủ định. ClinNote AI giải quyết vấn đề này qua kiến trúc Transcript → CAP → SOAP: mỗi phát biểu được phân tách thành các mệnh đề lâm sàng độc lập có liên kết trích dẫn nguyên văn, giúp người hành nghề y dễ dàng rà soát tính xác thực của từng câu trước khi duyệt hồ sơ.",
    },
    {
      q: "Khái niệm CAP (Clinical Atomic Propositions) có vai trò gì trong hồ sơ bệnh án?",
      a: "CAP là từng đơn vị thông tin lâm sàng nhỏ nhất được bóc tách từ hội thoại, giữ nguyên vai người nói (Bác sĩ hoặc Bệnh nhân), mốc thời gian, trạng thái phủ định (ví dụ: 'không sốt', 'không đau ngực') và mức độ chắc chắn. Nhờ tầng trung gian này, hệ thống bảo toàn tính trung thực của dữ liệu nguồn và ngăn chặn việc suy diễn sai lệch.",
    },
    {
      q: "Hệ thống đề xuất mã ICD-10 dựa trên cơ sở dữ liệu nào?",
      a: "Hệ thống tự động phân tích chẩn đoán trong mục Assessment và đối chiếu với danh mục mã bệnh chuẩn của Cục Quản lý Khám, chữa bệnh – Bộ Y Tế (icd.kcb.vn). Mỗi mã đề xuất đều đi kèm tên bệnh chính thức và căn cứ lâm sàng từ lượt khám.",
    },
    {
      q: "Các phương thức nhập liệu được hỗ trợ hiện nay?",
      a: "ClinNote AI hỗ trợ 5 phương thức: (1) Ghi âm hội thoại trực tiếp tại phòng khám; (2) Tải lên tệp âm thanh có sẵn (hỗ trợ MP3, M4A, WAV); (3) Đọc chính tả y khoa sau ca khám; (4) Chuẩn hóa ghi chép vắn tắt (dạng gạch đầu dòng); (5) Tích hợp hội thoại khám bệnh từ xa (Telehealth).",
    },
    {
      q: "Chính sách bảo mật và an toàn dữ liệu bệnh nhân được thực hiện ra sao?",
      a: "Hệ thống áp dụng các nguyên tắc bảo vệ dữ liệu y tế theo chuẩn HIPAA: mã hóa dữ liệu truyền tải với TLS 1.3 và lưu trữ với chuẩn AES-256. Băng ghi âm và dữ liệu trung gian có thể được xóa tự động sau khi bác sĩ hoàn tất phiên làm việc. Chúng tôi cam kết không sử dụng dữ liệu bệnh nhân thực tế để huấn luyện các mô hình AI công cộng bên thứ ba.",
    },
    {
      q: "Hồ sơ bệnh án sau khi duyệt có thể xuất sang những định dạng nào?",
      a: "Bác sĩ có thể sao chép nhanh từng mục S-O-A-P vào phần mềm quản lý bệnh viện (HIS/EMR), xuất định dạng tài liệu PDF chuẩn hóa, hoặc trích xuất dữ liệu cấu trúc JSON có kèm mã liên kết bằng chứng phục vụ lưu trữ và giám định.",
    },
  ];


  return (
    <div className="min-h-screen bg-white text-ink selection:bg-emerald-100 selection:text-emerald-900">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-line bg-white/95 backdrop-blur-md transition-all">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <img src="/logo-mark.png" alt="ClinNote AI Logo" className="h-8 w-8 object-contain" />
            <div className="flex flex-col">
              <span className="font-serif text-lg font-bold tracking-tight text-neutral-900 leading-none">ClinNote AI</span>
              <span className="text-[10px] text-neutral-500 font-medium mt-0.5">Clinical Note Assistant</span>
            </div>
          </Link>

          {/* Desktop Navigation - Streamlined to 4 clean items */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <button
              type="button"
              onClick={() => scrollToSection("how-it-works")}
              className={`text-sm font-medium transition cursor-pointer ${
                activeSection === "how-it-works"
                  ? "text-emerald-700 font-semibold"
                  : "text-neutral-600 hover:text-emerald-700"
              }`}
            >
              Quy trình CAP
            </button>
            <Link
              href="/soap-note-guides-and-example"
              className="text-sm font-medium text-neutral-600 transition hover:text-emerald-700"
            >
              Cẩm nang SOAP
            </Link>
            <Link
              href="/terms"
              className="text-sm font-medium text-neutral-600 transition hover:text-emerald-700"
            >
              Điều khoản
            </Link>
            <button
              type="button"
              onClick={() => scrollToSection("faq")}
              className={`text-sm font-medium transition cursor-pointer ${
                activeSection === "faq" || activeSection === "security"
                  ? "text-emerald-700 font-semibold"
                  : "text-neutral-600 hover:text-emerald-700"
              }`}
            >
              Hỏi đáp & Bảo mật
            </button>
          </nav>

          {/* Right Action Buttons */}
          <div className="hidden md:flex items-center gap-3">
            {authed ? (
              <Link
                href="/desk"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-emerald-800"
              >
                <Stethoscope className="h-4 w-4" />
                <span>Bàn làm việc</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg px-3.5 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-emerald-800"
                >
                  <span>Bắt đầu miễn phí</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
            aria-label="Mở menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Scroll Progress Indicator Bar */}
        <div className="h-[2px] w-full bg-neutral-100/80">
          <div
            className="h-full bg-emerald-700 transition-[width] duration-150 ease-out"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="border-b border-line bg-white px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection("how-it-works");
                }}
                className="py-1 text-left font-medium text-neutral-700 hover:text-emerald-700"
              >
                Quy trình CAP
              </button>
              <Link
                href="/soap-note-guides-and-example"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 font-medium text-neutral-700 hover:text-emerald-700"
              >
                Cẩm nang & Mẫu SOAP
              </Link>
              <Link
                href="/terms"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1 font-medium text-neutral-700 hover:text-emerald-700"
              >
                Điều khoản & Miễn trừ
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  scrollToSection("faq");
                }}
                className="py-1 text-left font-medium text-neutral-700 hover:text-emerald-700"
              >
                Hỏi đáp & Bảo mật
              </button>
              <div className="pt-3 border-t border-line flex flex-col gap-2">
                <Link href="/login" className="w-full text-center rounded-lg border border-line py-2 font-medium text-neutral-800">
                  Đăng nhập
                </Link>
                <Link
                  href={authed ? "/desk" : "/login"}
                  className="w-full text-center rounded-lg bg-emerald-700 py-2 font-medium text-white"
                >
                  {authed ? "Bàn làm việc" : "Bắt đầu miễn phí"}
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="hero" className="relative overflow-hidden pt-12 pb-20 sm:pt-16 sm:pb-24 lg:pt-20 scroll-mt-20">
        <div className="pointer-events-none absolute inset-0 -z-10 flex justify-center">
          <div className="h-[460px] w-[860px] max-w-full rounded-full bg-gradient-to-tr from-emerald-100/40 via-teal-50/30 to-transparent blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Main Hero Header - Symmetrical & Balanced */}
          <div className="mx-auto max-w-3xl text-center">
            {/* Clinical Role Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-1 text-xs font-medium text-neutral-700">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
              <span>Trợ lý AI hỗ trợ lập bệnh án lâm sàng chuẩn SOAP</span>
            </div>

            {/* Main Title */}
            <h1 className="mt-6 font-serif text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-5xl sm:leading-[1.15]">
              Chuyển Đổi Hội Thoại Khám Bệnh Sang <br />
              <span className="text-emerald-700">Bệnh Án SOAP Chuẩn Xác</span> <br />
              Với Bằng Chứng Đối Chiếu Từng Câu
            </h1>

            {/* Subtitle with refined, serious clinical tone */}
            <p className="mt-6 text-base sm:text-lg leading-relaxed text-neutral-600">
              ClinNote AI tự động chuyển hội thoại khám bệnh thành bệnh án SOAP chuẩn xác,
              đối chiếu trích dẫn nguồn từng câu và trao toàn quyền phê duyệt cho bác sĩ điều trị.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Link
                href={authed ? "/desk" : "/login"}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-base font-semibold text-white shadow-xs transition hover:bg-emerald-800 active:scale-95"
              >
                <span>{authed ? "Mở bàn làm việc" : "Bắt đầu trải nghiệm"}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/soap-note-guides-and-example"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-6 text-base font-semibold text-neutral-800 shadow-2xs transition hover:bg-neutral-50 active:scale-95"
              >
                <BookOpen className="h-4 w-4 text-emerald-700" />
                <span>Xem cẩm nang & mẫu SOAP</span>
              </Link>
            </div>

            {/* Trust highlights */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" /> Tiết kiệm thời gian lập hồ sơ bệnh án
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" /> Đối chiếu trích dẫn nguồn cho từng câu ghi chú
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" /> Chuẩn hóa danh mục ICD-10 Bộ Y Tế
              </span>
            </div>
          </div>

          {/* Borderless Pixel Clinician Banner Showcase */}
          <div className="relative mt-10 sm:mt-14 flex flex-col items-center justify-center">
            {/* Ambient Radial Glow behind the character */}
            <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
              <div className="h-56 w-80 sm:h-72 sm:w-[600px] rounded-full bg-gradient-to-tr from-emerald-200/40 via-teal-100/30 to-transparent blur-3xl" />
            </div>

            {/* Pure Transparent PNG Image - No border, no box, natural pixel drop shadow */}
            <div className="w-full max-w-2xl sm:max-w-3xl px-4 flex justify-center">
              <img
                src="/pixel-clinician-banner.png"
                alt="ClinNote AI - Trợ lý ghi chép lâm sàng"
                className="w-full h-auto max-h-[380px] object-contain drop-shadow-[0_20px_25px_rgba(16,185,129,0.15)] drop-shadow-md select-none transition-transform duration-500 hover:scale-[1.01]"
              />
            </div>
          </div>

          {/* Section Divider & Intro to Interactive Demo */}
          <div className="mt-16 sm:mt-20 text-center">
            <span className="font-mono text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Trực Quan Hóa Quy Trình
            </span>
            <h2 className="mt-2 font-serif text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
              Minh Họa Thực Tế: Lời Thoại → CAP Facts → SOAP Note
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-neutral-600 max-w-xl mx-auto">
              Chuyển đổi qua lại giữa 3 bước để xem cách hệ thống đối chiếu trích dẫn và liên kết mã ICD-10.
            </p>
          </div>

          {/* Interactive Hero Showcase Demo Widget */}
          <div className="mt-8 mx-auto max-w-5xl rounded-2xl border border-line bg-white shadow-xl overflow-hidden">
            {/* Widget Header */}
            <div className="flex flex-wrap items-center justify-between border-b border-line bg-neutral-50 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-neutral-700">
                  Dữ Liệu Thăm Khám Lâm Sàng Mẫu
                </span>
              </div>

              {/* Step Tab Switcher */}
              <div className="flex rounded-lg bg-neutral-200/70 p-1 mt-2 sm:mt-0 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab("transcript")}
                  className={`rounded-md px-3 py-1.5 transition ${
                    activeTab === "transcript"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  1. Lời thoại (Transcript)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("cap")}
                  className={`rounded-md px-3 py-1.5 transition ${
                    activeTab === "cap"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  2. Mệnh đề CAP & Bằng chứng
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("soap")}
                  className={`rounded-md px-3 py-1.5 transition ${
                    activeTab === "soap"
                      ? "bg-white text-emerald-800 shadow-xs font-semibold"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  3. Bản thảo SOAP & ICD-10
                </button>
              </div>
            </div>

            {/* Widget Body Content */}
            <div className="p-4 sm:p-6 min-h-[420px]">
              {/* TAB 1: TRANSCRIPT */}
              {activeTab === "transcript" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 border border-neutral-200">
                    <span className="flex items-center gap-2 font-medium">
                      <Mic className="h-4 w-4 text-emerald-700" />
                      Biên bản hội thoại khám bệnh (Thời lượng: 01:25) · Nhận dạng và phân tách vai người nói
                    </span>
                    <span className="font-mono text-neutral-500">2 Người tham gia</span>
                  </div>

                  <div className="space-y-3 font-sans text-sm">
                    {sampleTranscript.map((line) => (
                      <div
                        key={line.id}
                        className={`rounded-xl p-3 border transition ${
                          line.speaker === "Bác sĩ"
                            ? "bg-emerald-50/30 border-emerald-200/60 ml-4 sm:ml-8"
                            : "bg-white border-neutral-200 mr-4 sm:mr-8"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                          <span
                            className={`font-semibold ${
                              line.speaker === "Bác sĩ" ? "text-emerald-800" : "text-neutral-800"
                            }`}
                          >
                            {line.speaker}
                          </span>
                          <span className="font-mono text-[11px] text-neutral-400">{line.time}</span>
                        </div>
                        <p className="text-neutral-800 leading-relaxed">{line.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: CAP PROPOSITIONS */}
              {activeTab === "cap" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 border border-neutral-200">
                    <span className="flex items-center gap-2 font-medium">
                      <Layers className="h-4 w-4 text-emerald-700" />
                      Trích xuất dữ liệu lâm sàng kèm trích dẫn đối chiếu
                    </span>
                    <span className="text-neutral-500">Click fact để xem trích dẫn tương ứng</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-1">
                    {sampleCaps.map((cap) => (
                      <div
                        key={cap.id}
                        onClick={() => setSelectedQuoteId(cap.id)}
                        className={`cursor-pointer rounded-xl border p-3.5 transition ${
                          selectedQuoteId === cap.id
                            ? "border-emerald-600 bg-emerald-50/30 shadow-2xs ring-1 ring-emerald-600"
                            : "border-neutral-200 bg-white hover:border-neutral-300"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-700">
                              {cap.category}
                            </span>
                            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 border border-emerald-200">
                              {cap.polarity}
                            </span>
                          </div>
                          <span className="text-xs text-neutral-400">Nguồn: {cap.speaker}</span>
                        </div>
                        <h4 className="mt-2 text-sm font-semibold text-neutral-900">{cap.fact}</h4>
                        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-neutral-50 p-2 text-xs text-neutral-600 border border-neutral-100">
                          <span className="font-semibold text-neutral-800 shrink-0">Trích dẫn:</span>
                          <span className="italic">“{cap.evidence}”</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: SOAP NOTE */}
              {activeTab === "soap" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 border border-neutral-200">
                    <div className="flex items-center gap-2">
                      <FileCheck2 className="h-4 w-4 text-emerald-700" />
                      <span className="font-semibold text-neutral-900">Bản Thảo Bệnh Án SOAP</span>
                      <span className="text-neutral-500">· Trạng thái: Chờ bác sĩ kiểm tra và ký duyệt</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        ICD-10: K21.9
                      </span>
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        Đối chiếu bằng chứng 100%
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 text-xs">
                    {/* S: Subjective */}
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        <span className="font-serif text-sm font-bold text-emerald-800">S — Triệu Chứng Cơ Năng & Bệnh Sử</span>
                        <span className="font-mono text-[10px] text-neutral-400">Subjective</span>
                      </div>
                      <div className="mt-3 space-y-2 text-neutral-700 leading-relaxed">
                        <p>
                          <strong>Lý do vào viện:</strong> Nóng rát sau xương ức, ợ chua sau khi ăn no và khi nằm nghỉ, diễn tiến 2 tuần.
                        </p>
                        <p>
                          <strong>Phủ định loại trừ:</strong> Không đau thắt ngực lan ra sau lưng, không khó thở.
                        </p>
                        <p>
                          <strong>Tiền sử:</strong> Đau dạ dày cách đây 2 năm.
                        </p>
                      </div>
                    </div>

                    {/* O: Objective */}
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        <span className="font-serif text-sm font-bold text-emerald-800">O — Khám Thực Thể</span>
                        <span className="font-mono text-[10px] text-neutral-400">Objective</span>
                      </div>
                      <div className="mt-3 space-y-2 text-neutral-700 leading-relaxed">
                        <p>
                          <strong>Sinh hiệu:</strong> Mạch 76 l/p, Huyết áp 125/80 mmHg.
                        </p>
                        <p>
                          <strong>Khám bụng:</strong> Bụng mềm, ấn tức nhẹ vùng thượng vị, không sờ thấy u cục, không có đề kháng thành bụng.
                        </p>
                        <p>
                          <strong>Tuần hoàn - Hô hấp:</strong> Tiếng tim đều T1, T2 rõ. Phổi thông khí đều hai phế trường.
                        </p>
                      </div>
                    </div>

                    {/* A: Assessment */}
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        <span className="font-serif text-sm font-bold text-emerald-800">A — Đánh Giá & Chẩn Đoán</span>
                        <span className="font-mono text-[10px] text-neutral-400">Assessment</span>
                      </div>
                      <div className="mt-3 space-y-2 text-neutral-700 leading-relaxed">
                        <p>
                          <strong>Chẩn đoán xác định:</strong> Bệnh trào ngược dạ dày thực quản (GERD).
                        </p>
                        <div className="flex items-center gap-2 rounded-md bg-neutral-50 border border-neutral-200 p-2 text-neutral-800">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>
                            <strong>Mã ICD-10 đề xuất:</strong> K21.9 — Bệnh trào ngược dạ dày thực quản, không có viêm thực quản (Danh mục Bộ Y Tế).
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* P: Plan */}
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        <span className="font-serif text-sm font-bold text-emerald-800">P — Kế Hoạch Điều Trị</span>
                        <span className="font-mono text-[10px] text-neutral-400">Plan</span>
                      </div>
                      <div className="mt-3 space-y-2 text-neutral-700 leading-relaxed">
                        <p>
                          <strong>Y lệnh thuốc:</strong> Esomeprazole 40mg x 1 viên/ngày, uống trước bữa ăn sáng 30 phút trong 4 tuần.
                        </p>
                        <p>
                          <strong>Tư vấn sinh hoạt:</strong> Tránh ăn quá no, không nằm trong vòng 2–3 giờ sau ăn, hạn chế cà phê, rượu bia và thức ăn cay nóng.
                        </p>
                        <p>
                          <strong>Theo dõi:</strong> Tái khám sau 4 tuần hoặc tái khám ngay nếu xuất hiện nuốt nghẹn, sụt cân hay nôn ra máu.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Clinical Consultation & Sign-off Dock */}
                  <div className="mt-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-4 sm:p-5 shadow-xs relative overflow-hidden">
                    {/* Ambient background decoration */}
                    <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-200/20 blur-2xl" />
                    <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-teal-200/20 blur-2xl" />

                    {/* Header banner of this pod */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100/80 pb-3 mb-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold shadow-2xs">
                          <Stethoscope className="h-4 w-4" />
                        </span>
                        <div>
                          <h4 className="font-serif text-sm font-bold text-neutral-900 flex items-center gap-2">
                            Đối Thoại Lâm Sàng & Nghiệm Thu Ca Khám
                            <span className="font-mono text-[10px] font-semibold text-emerald-700 bg-emerald-100/70 border border-emerald-200 px-2 py-0.5 rounded-full">
                              Case #GERD-082
                            </span>
                          </h4>
                          <p className="text-[11px] text-neutral-500">
                            Bác sĩ toàn quyền kiểm chứng và phê duyệt hồ sơ bệnh án
                          </p>
                        </div>
                      </div>

                      {/* Dialogue step toggle */}
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setConsultationStep((prev) => (prev === 0 ? 1 : 0))}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50/60 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition shadow-2xs cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3 text-emerald-600" />
                          <span>{consultationStep === 0 ? "Xem đoạn dặn dò toa thuốc" : "Xem đoạn hỏi bệnh sử"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                      {/* LEFT SIDE: Doctor & Bear Consultation Stage (Grounded, Dialogue Bubbles) */}
                      <div className="lg:col-span-7 flex flex-col justify-end">
                        {/* Speech bubbles area */}
                        <div className="relative mb-3 space-y-2">
                          {consultationStep === 0 ? (
                            <>
                              {/* Bear bubble */}
                              <div className="relative ml-auto max-w-[90%] sm:max-w-[80%] rounded-2xl rounded-br-xs bg-sky-50 border border-sky-200/90 p-3 text-xs text-sky-950 shadow-2xs">
                                <div className="flex items-center gap-1.5 font-semibold text-sky-800 mb-0.5 text-[11px]">
                                  <span>🐻 Bệnh nhân Gấu:</span>
                                </div>
                                <p className="leading-snug">
                                  “Dạ bác sĩ ơi, khoảng 2 tuần nay em hay bị <strong>nóng rát sau xương ức</strong> và <strong>ợ chua sau khi ăn no</strong> hoặc nằm nghỉ...”
                                </p>
                              </div>

                              {/* Doctor bubble */}
                              <div className="relative mr-auto max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-bl-xs bg-white border border-emerald-200 p-3 text-xs text-neutral-800 shadow-2xs">
                                <div className="flex items-center gap-1.5 font-semibold text-emerald-800 mb-0.5 text-[11px]">
                                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>BS. Lâm Sàng (kiểm tra tablet):</span>
                                </div>
                                <p className="leading-snug">
                                  “Bệnh án SOAP và mã gợi ý <strong>ICD-10 K21.9</strong> đã sẵn sàng kèm trích dẫn đối chiếu. Tôi sẽ duyệt ngay!”
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Bear bubble step 2 */}
                              <div className="relative ml-auto max-w-[90%] sm:max-w-[80%] rounded-2xl rounded-br-xs bg-sky-50 border border-sky-200/90 p-3 text-xs text-sky-950 shadow-2xs">
                                <div className="flex items-center gap-1.5 font-semibold text-sky-800 mb-0.5 text-[11px]">
                                  <span>🐻 Bệnh nhân Gấu:</span>
                                </div>
                                <p className="leading-snug">
                                  “Em có cần kiêng cữ thức ăn gì và bao lâu thì tái khám lại vậy bác sĩ?”
                                </p>
                              </div>

                              {/* Doctor bubble step 2 */}
                              <div className="relative mr-auto max-w-[92%] sm:max-w-[85%] rounded-2xl rounded-bl-xs bg-white border border-emerald-200 p-3 text-xs text-neutral-800 shadow-2xs">
                                <div className="flex items-center gap-1.5 font-semibold text-emerald-800 mb-0.5 text-[11px]">
                                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>BS. Lâm Sàng:</span>
                                </div>
                                <p className="leading-snug">
                                  “Uống <strong>Esomeprazole 40mg</strong> trước ăn sáng 30 phút, tránh nằm ngay sau ăn, kiêng rượu bia đồ cay. Tái khám sau 4 tuần nhé!”
                                </p>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Characters on Grounded Stage (No more floating!) */}
                        <div className="relative flex items-end justify-center sm:justify-start pt-2">
                          {/* Soft natural floor shadow under doctor and bear - removes the floating feel */}
                          <div className="absolute bottom-1 left-2 sm:left-4 w-48 sm:w-56 h-4 bg-emerald-950/20 rounded-[100%] blur-[4px] pointer-events-none" />
                          {/* Clean clinic floor line */}
                          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-300/60 via-teal-200/50 to-transparent pointer-events-none" />

                          <img
                            src="/pixel-doctor-bear-consultation.png"
                            alt="Bác sĩ và bệnh nhân tư vấn lâm sàng"
                            className="relative z-10 h-32 sm:h-36 md:h-40 w-auto object-contain select-none"
                          />
                        </div>
                      </div>

                      {/* RIGHT SIDE: Clinician Verification Summary */}
                      <div className="lg:col-span-5 flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
                        <div>
                          <div className="flex items-center justify-between pb-2.5 border-b border-neutral-100">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                BS
                              </div>
                              <div>
                                <div className="font-semibold text-xs text-neutral-900">BS. CKI Trần Thảo My</div>
                                <div className="text-[10px] text-neutral-400">Khoa Tiêu Hóa · Phụ trách ca khám</div>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-300">
                              Đã Đối Chiếu
                            </span>
                          </div>

                          {/* Verification Checkpoints */}
                          <div className="mt-3 space-y-2 text-xs text-neutral-600">
                            <div className="flex items-center gap-2 text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>Mệnh đề CAP: <strong>4/4 sự thật</strong> đã kiểm chứng</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>Mã ICD-10: <strong>K21.9</strong> chuẩn danh mục Bộ Y Tế</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span>Độ tin cậy trích dẫn: <strong>100% khớp bằng chứng</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-neutral-100 text-[11px] text-neutral-500 leading-relaxed">
                          Bản thảo SOAP được tạo tự động với liên kết nguồn đầy đủ, sẵn sàng cho bác sĩ rà soát khi lưu bệnh án.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Scroll down indicator button */}
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={() => scrollToSection("features")}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/80 px-4 py-2 text-xs font-medium text-neutral-600 shadow-2xs backdrop-blur-xs transition hover:border-emerald-500 hover:text-emerald-700 hover:shadow-xs active:scale-95 cursor-pointer"
            >
              <span>Xem phân tích lâm sàng & quy trình</span>
              <ArrowDown className="h-3.5 w-3.5 animate-bounce text-emerald-700" />
            </button>
          </div>
        </div>
      </section>

      {/* The Core Difference: Traditional vs Raw LLM vs ClinNote AI */}
      <section id="features" className="border-t border-line bg-neutral-50/60 py-20 scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-xs font-bold text-neutral-500 uppercase tracking-widest">
              So Sánh Thực Tế Lâm Sàng
            </span>
            <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Yêu Cầu Về Tính Chuẩn Xác Trong Ghi Chép Y Khoa
            </h2>
            <p className="mt-4 text-base text-neutral-600">
              Y khoa đòi hỏi tính chính xác và khả năng giải trình cao. Mỗi thông tin ghi nhận cần có cơ sở đối chiếu rõ ràng từ thực tế thăm khám.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {/* Box 1: Manual */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-bold text-neutral-900">Ghi chép thủ công</h3>
              <ul className="mt-4 space-y-2.5 text-xs text-neutral-600 leading-relaxed">
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Tiêu tốn từ 30–40% thời gian ca làm việc để hoàn tất giấy tờ, hồ sơ bệnh án.
                </li>
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Bác sĩ phải phân tâm vào bàn phím thay vì tập trung tương tác trực tiếp với người bệnh.
                </li>
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Áp lực hoàn thiện bệnh án ngoài giờ làm việc tăng nguy cơ quá tải và kiệt sức.
                </li>
              </ul>
            </div>

            {/* Box 2: ChatGPT raw */}
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xs">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
                <HelpCircle className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-bold text-neutral-900">Sử dụng LLM thông thường</h3>
              <ul className="mt-4 space-y-2.5 text-xs text-neutral-600 leading-relaxed">
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Tiềm ẩn nguy cơ tạo thông tin không có thực (hallucination) hoặc tự suy diễn chi tiết không được đề cập.
                </li>
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Nguy cơ bỏ sót trạng thái phủ định: diễn đạt nhầm 'không đau ngực' thành có triệu chứng.
                </li>
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Không có liên kết truy xuất nguồn gốc: khó đối chiếu câu trong bệnh án xuất phát từ lời thoại nào.
                </li>
                <li className="flex items-start gap-2 text-neutral-700">
                  <span className="text-neutral-400">•</span> Rủi ro bảo mật thông tin sức khỏe cá nhân khi gửi dữ liệu lên máy chủ công cộng.
                </li>
              </ul>
            </div>

            {/* Box 3: ClinNote AI */}
            <div className="rounded-2xl border-2 border-emerald-600 bg-emerald-50/30 p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-bold text-emerald-950">ClinNote AI (Mô hình CAP)</h3>
              <ul className="mt-4 space-y-2.5 text-xs text-emerald-950 leading-relaxed font-medium">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                  Mỗi câu trong bản thảo SOAP đều liên kết với trích dẫn nguyên văn từ hội thoại (Evidence Grounding).
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                  Bảo toàn trạng thái phủ định, mức độ không chắc chắn và các thông tin được người bệnh đính chính.
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                  Tích hợp đối chiếu danh mục mã bệnh ICD-10 của Bộ Y Tế phục vụ lập hồ sơ chuẩn xác.
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-700" />
                  Mô hình Human-in-the-loop: Bác sĩ trực tiếp rà soát, chỉnh sửa và ký duyệt trước khi xuất hồ sơ.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - 4 Steps */}
      <section id="how-it-works" className="py-20 border-t border-line scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Quy Trình Lâm Sàng
            </span>
            <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Từ Hội Thoại Đến Bệnh Án Ký Duyệt Qua 4 Bước
            </h2>
            <p className="mt-4 text-base text-neutral-600">
              Quy trình khép kín giúp bác sĩ duy trì quyền kiểm soát chuyên môn ở mọi giai đoạn.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            {/* Step 1 */}
            <div className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-emerald-700">01</span>
                <Mic className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Ghi nhận hội thoại</h3>
              <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                Thu âm phiên khám trực tiếp, tải lên tệp âm thanh hoặc dán biên bản thoại. Hệ thống tự động khử tạp âm và phân tách vai người nói.
              </p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-emerald-700">02</span>
                <Layers className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Bóc tách dữ liệu lâm sàng</h3>
              <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                Tự động trích xuất triệu chứng, tiền sử, thuốc và gắn kèm mốc thời gian đối chiếu chính xác với hội thoại gốc.
              </p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-emerald-700">03</span>
                <FileCheck2 className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Đề xuất bản thảo SOAP</h3>
              <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                Tổng hợp bản thảo bệnh án chuẩn 4 mục (Subjective, Objective, Assessment, Plan) và tự động tra cứu mã ICD-10 tương ứng từ danh mục Bộ Y Tế.
              </p>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold text-emerald-700">04</span>
                <ShieldCheck className="h-6 w-6 text-neutral-400" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900">Bác sĩ kiểm tra & Ký duyệt</h3>
              <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                Bác sĩ rà soát bằng chứng đối chiếu, hiệu chỉnh câu chữ, lưu các phiên bản chỉnh sửa và ký duyệt bản ghi chính thức.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security & Privacy */}
      <section id="security" className="py-20 border-t border-line bg-neutral-900 text-white scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-neutral-800 border border-neutral-700 px-3.5 py-1 text-xs font-semibold text-neutral-300">
              <Lock className="h-3.5 w-3.5 text-emerald-400" />
              <span>An Toàn Dữ Liệu & Quyền Riêng Tư Y Tế</span>
            </div>
            <h2 className="mt-4 font-serif text-3xl font-bold sm:text-4xl text-white">
              Bảo Mật Dữ Liệu Lâm Sàng Theo Tiêu Chuẩn Y Tế
            </h2>
            <p className="mt-4 text-neutral-400 text-sm sm:text-base leading-relaxed">
              Dữ liệu khám bệnh là thông tin nhạy cảm. Hệ thống được phát triển tuân thủ nghiêm ngặt các nguyên tắc bảo vệ quyền riêng tư người bệnh.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-800/60 p-5">
              <Shield className="h-6 w-6 text-emerald-400" />
              <h3 className="mt-3 text-base font-bold text-white">Mã hóa an toàn</h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                Toàn bộ dữ liệu âm thanh và văn bản đều được mã hóa bằng chuẩn TLS 1.3 khi truyền tải và mã hóa AES-256 khi lưu trữ.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-800/60 p-5">
              <RotateCcw className="h-6 w-6 text-emerald-400" />
              <h3 className="mt-3 text-base font-bold text-white">Chính sách hủy dữ liệu tạm</h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                Tệp âm thanh và biên bản thoại có thể được cài đặt tự động hủy sau khi bác sĩ hoàn tất và lưu trữ bệnh án chính thức.
              </p>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-800/60 p-5">
              <Lock className="h-6 w-6 text-emerald-400" />
              <h3 className="mt-3 text-base font-bold text-white">Không chia sẻ dữ liệu huấn luyện</h3>
              <p className="mt-2 text-xs text-neutral-400 leading-relaxed">
                Không sử dụng bất kỳ bản ghi âm hay thông tin bệnh nhân thực tế nào để đào tạo các mô hình AI công cộng bên thứ ba.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 border-t border-line scroll-mt-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="font-mono text-xs font-bold text-neutral-500 uppercase tracking-widest">
              Giải Đáp Thắc Mắc
            </span>
            <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              Câu Hỏi Thường Gặp
            </h2>
          </div>

          <div className="mt-12 space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = activeFaq === index;
              return (
                <div
                  key={index}
                  className="rounded-xl border border-neutral-200 bg-white shadow-2xs overflow-hidden transition"
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-5 text-left text-sm font-semibold text-neutral-900"
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-neutral-400 shrink-0 transition-transform ${
                        isOpen ? "rotate-180 text-emerald-700" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-neutral-600 leading-relaxed border-t border-neutral-100 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Bottom Call to Action Banner */}
      <section className="border-t border-line bg-emerald-800 py-16 text-white text-center">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            Tối Ưu Hóa Quy Trình Ghi Chép Lâm Sàng
          </h2>
          <p className="mt-4 text-emerald-100 text-base max-w-2xl mx-auto leading-relaxed">
            Giúp người hành nghề y tiết kiệm thời gian lập hồ sơ bệnh án và tập trung trọn vẹn vào việc chăm sóc người bệnh.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={authed ? "/desk" : "/login"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-bold text-emerald-900 shadow-xs transition hover:bg-neutral-100 active:scale-95"
            >
              <span>{authed ? "Vào bàn làm việc" : "Bắt đầu trải nghiệm"}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/soap-note-guides-and-example"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-emerald-900/40 px-6 text-sm font-semibold text-white transition hover:bg-emerald-900"
            >
              <BookOpen className="h-4 w-4" />
              <span>Xem cẩm nang & mẫu SOAP</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-white py-12 text-xs text-neutral-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <img src="/logo-mark.png" alt="ClinNote AI" className="h-6 w-6 object-contain" />
                <span className="font-serif text-base font-bold text-neutral-900">ClinNote AI</span>
              </div>
              <p className="mt-3 text-neutral-600 leading-relaxed">
                Hệ thống hỗ trợ ghi chép bệnh án lâm sàng chuẩn SOAP tiếng Việt với cơ chế đối chiếu bằng chứng CAP.
              </p>
              <p className="mt-4 font-mono text-[10px] text-neutral-400">ClinNote AI — P-006 © 2026</p>
            </div>

            <div>
              <h4 className="font-semibold text-neutral-900">Sản Phẩm</h4>
              <ul className="mt-3 space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("how-it-works")}
                    className="hover:text-emerald-700 cursor-pointer text-left"
                  >
                    Quy trình CAP Grounding
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("methods")}
                    className="hover:text-emerald-700 cursor-pointer text-left"
                  >
                    Phương thức nhập liệu
                  </button>
                </li>
                <li>
                  <Link href="/soap-note-guides-and-example" className="hover:text-emerald-700">Cẩm nang SOAP</Link>
                </li>
                <li>
                  <Link href="/desk" className="hover:text-emerald-700">Bàn làm việc Bác sĩ</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-neutral-900">Tài Liệu</h4>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/soap-note-guides-and-example" className="hover:text-emerald-700">
                    Hướng dẫn viết SOAP
                  </Link>
                </li>
                <li>
                  <Link href="/soap-note-guides-and-example#interactive-cases" className="hover:text-emerald-700">
                    Ca bệnh mẫu đối chiếu
                  </Link>
                </li>
                <li>
                  <a href="https://icd.kcb.vn" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-700 inline-flex items-center gap-1">
                    <span>Cổng mã ICD-10 BYT</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-neutral-900">An Toàn & Pháp Lý</h4>
              <ul className="mt-3 space-y-2">
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("security")}
                    className="hover:text-emerald-700 cursor-pointer text-left"
                  >
                    Tiêu chuẩn bảo mật HIPAA
                  </button>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-emerald-700">
                    Điều khoản & Miễn trừ trách nhiệm
                  </Link>
                </li>
                <li>
                  <span className="text-neutral-500">Quyền riêng tư dữ liệu</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-line pt-6 flex flex-wrap items-center justify-between gap-4 text-[11px] text-neutral-400">
            <p>ClinNote AI là công cụ hỗ trợ ghi chép lâm sàng (Human-in-the-loop). Mọi quyết định chẩn đoán và điều trị thuộc thẩm quyền của Bác sĩ.</p>
            <div className="flex items-center gap-3">
              <Link href="/terms" className="hover:text-emerald-700 underline">
                Điều khoản dịch vụ & Miễn trừ y tế
              </Link>
              <span>·</span>
              <p>Dự án nghiên cứu & phát triển ClinNote AI (P-006).</p>
            </div>
          </div>
        </div>
      </footer>


      {/* Back to Top Floating Button */}
      {showScrollTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-md transition hover:bg-neutral-50 hover:text-emerald-700 hover:border-emerald-300 active:scale-95 cursor-pointer"
          aria-label="Cuộn về đầu trang"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

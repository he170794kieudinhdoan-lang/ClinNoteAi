"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCheck,
  FileText,
  Folder,
  FolderOpen,
  Layers,
  Menu,
  Mic,
  Search,
  ShieldCheck,
  Stethoscope,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export default function SoapNoteGuidesAndExamplePage() {
  const [authed, setAuthed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"yes" | "no" | null>(null);
  const [selectedCase, setSelectedCase] = useState<"gerd" | "hypertension" | "pediatric">("gerd");

  // Expanded folders in sidebar tree
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    intro: true,
  });

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(Boolean(data.session?.user));
    });
  }, []);

  const toggleFolder = (key: string) => {
    setOpenFolders((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clinicalCases = {
    gerd: {
      title: "Ca 1: Nội Tiêu Hoá — Trào Ngược Dạ Dày Thực Quản (GERD)",
      patient: "Nguyễn Văn H., Nam, 46 tuổi",
      chiefComplaint: "Nóng rát sau xương ức, ợ chua 2 tuần",
      icd10: "K21.9 — Bệnh trào ngược dạ dày thực quản",
      transcript: [
        { speaker: "Bác sĩ", text: "Chào anh H., anh kể tôi nghe dạo này thấy khó chịu ở đâu?" },
        { speaker: "Bệnh nhân", text: "Dạ thưa bác sĩ, khoảng 2 tuần nay tôi cứ bị nóng rát cồn cào ở vùng sau xương ức, hay ợ chua sau khi ăn no, nhất là buổi tối nằm xuống thì nghẹn rát cổ." },
        { speaker: "Bác sĩ", text: "Anh có bị đau thắt ngực lan lên cằm hay lan ra sau lưng không? Có khó thở hay nôn ra máu không?" },
        { speaker: "Bệnh nhân", text: "Dạ không đau ngực lan đâu bác sĩ, không khó thở gì cả, cũng không nôn ói. Cách đây 2 năm tôi từng nội soi bị viêm dạ dày một lần." },
        { speaker: "Bác sĩ", text: "Huyết áp của anh 125/80 mmHg, mạch 76 lần/phút. Bụng mềm, ấn tức nhẹ thượng vị, không u cục, không đề kháng." },
      ],
      caps: [
        { fact: "Nóng rát sau xương ức và ợ chua sau ăn no, tăng khi nằm nghỉ (2 tuần)", polarity: "Khẳng định", quote: "bị nóng rát cồn cào ở vùng sau xương ức, hay ợ chua sau khi ăn no" },
        { fact: "Không đau thắt ngực lan, không khó thở, không nôn ra máu", polarity: "Phủ định loại trừ", quote: "không đau ngực lan đâu bác sĩ, không khó thở gì cả, cũng không nôn ói" },
        { fact: "Tiền sử viêm dạ dày nội soi 2 năm trước", polarity: "Tiền sử", quote: "Cách đây 2 năm tôi từng nội soi bị viêm dạ dày một lần" },
        { fact: "Khám: HA 125/80 mmHg, Mạch 76 l/p, ấn tức nhẹ thượng vị, bụng mềm", polarity: "Thực thể", quote: "Huyết áp của anh 125/80 mmHg, mạch 76 lần/phút. Bụng mềm, ấn tức nhẹ thượng vị" },
      ],
      soap: {
        s: "Bệnh nhân nam 46 tuổi, đến khám vì nóng rát sau xương ức và ợ chua kéo dài 2 tuần, triệu chứng nặng hơn sau khi ăn no và khi nằm nghỉ buổi tối. Phủ định đau thắt ngực kiểu mạch vành, không đau lan hàm/lưng, không khó thở, không nuốt nghẹn, không nôn ra máu. Tiền sử: Viêm dạ dày nội soi cách đây 2 năm.",
        o: "Thể trạng trung bình. Sinh hiệu: Mạch 76 l/p, HA 125/80 mmHg, Nhiệt độ 36.8°C, SpO2 98%. Khám bụng: Bụng phẳng, mềm, di động theo nhịp thở; ấn tức nhẹ vùng thượng vị, không có điểm đau khu trú khác, gan lách không sờ chạm, không có đề kháng thành bụng. Tim đều T1, T2 rõ. Phổi thông khí đều hai bên.",
        a: "Bệnh trào ngược dạ dày thực quản (GERD) — Mã ICD-10: K21.9. Chẩn đoán phân biệt: Viêm loét dạ dày tá tràng (K29.7). Chưa ghi nhận dấu hiệu gợi ý hội chứng mạch vành cấp.",
        p: "1. Y lệnh thuốc: Esomeprazole 40mg x 1 viên/ngày, uống trước ăn sáng 30 phút trong 4 tuần; Domperidone 10mg x 2 viên/ngày, uống trước 2 bữa ăn chính.\n2. Chế độ sinh hoạt: Chia nhỏ bữa ăn, không ăn quá no; không nằm trong vòng 2–3 giờ sau ăn; kê cao đầu giường 15cm; kiêng cà phê, trà đậm, rượu bia, đồ chua cay.\n3. Hướng dẫn theo dõi: Tái khám sau 4 tuần hoặc tái khám ngay nếu xuất hiện nuốt nghẹn, sụt cân không rõ nguyên nhân hoặc nôn máu.",
      },
    },
    hypertension: {
      title: "Ca 2: Nội Tim Mạch — Tăng Huyết Áp Vô Căn & Khó Thở Khi Gắng Sức",
      patient: "Trần Thị M., Nữ, 58 tuổi",
      chiefComplaint: "Huyết áp đo tại nhà 155/95 mmHg, đau váng đầu",
      icd10: "I10 — Bệnh tăng huyết áp vô căn (nguyên phát)",
      transcript: [
        { speaker: "Bác sĩ", text: "Chào cô M., hôm nay cô thấy mệt thế nào?" },
        { speaker: "Bệnh nhân", text: "Dạo này tôi hay bị váng đầu vùng sau gáy vào buổi sáng, đo máy huyết áp ở nhà thấy lên 155 đến 160. Khi leo cầu thang tầng 2 thì cảm thấy hơi hụt hơi." },
        { speaker: "Bác sĩ", text: "Cô có bị đau thắt ngực từng cơn hay hồi hộp đánh trống ngực không? Chân có bị sưng phù không cô?" },
        { speaker: "Bệnh nhân", text: "Dạ không đau thắt ngực, không phù chân. Tôi đang uống Amlodipine 5mg mỗi ngày nhưng hay quên uống thuốc." },
        { speaker: "Bác sĩ", text: "Khám hiện tại HA đo được 152/92 mmHg, nhịp tim 82 lần/phút. Tiếng tim T1 T2 đều, không âm thổi. Phổi sạch, không ran." },
      ],
      caps: [
        { fact: "Váng đầu vùng chẩm buổi sáng, HA đo tại nhà 155-160 mmHg", polarity: "Khẳng định", quote: "hay bị váng đầu vùng sau gáy vào buổi sáng, đo máy huyết áp ở nhà thấy lên 155 đến 160" },
        { fact: "Khó thở nhẹ khi leo cầu thang tầng 2", polarity: "Khẳng định", quote: "Khi leo cầu thang tầng 2 thì cảm thấy hơi hụt hơi" },
        { fact: "Không đau thắt ngực, không phù chân", polarity: "Phủ định", quote: "không đau thắt ngực, không phù chân" },
        { fact: "Đang dùng Amlodipine 5mg/ngày, tuân thủ kém (hay quên)", polarity: "Thuốc/Tuân thủ", quote: "đang uống Amlodipine 5mg mỗi ngày nhưng hay quên uống thuốc" },
        { fact: "Khám: HA 152/92 mmHg, nhịp tim 82 l/p, tim đều, phổi không ran", polarity: "Thực thể", quote: "HA đo được 152/92 mmHg, nhịp tim 82 lần/phút... Phổi sạch" },
      ],
      soap: {
        s: "Bệnh nhân nữ 58 tuổi, tiền sử tăng huyết áp đang điều trị Amlodipine 5mg nhưng không đều đặn. Đến khám vì nhức đầu âm ỉ vùng gáy buổi sáng và HA tại nhà dao động 155–160 mmHg. Gần đây xuất hiện khó thở nhẹ khi gắng sức (leo lầu tầng 2). Không đau thắt ngực, không khó thở kịch phát về đêm, không phù hai chi dưới.",
        o: "Sinh hiệu: Mạch 82 l/p, HA 152/92 mmHg, BMI 24.2 kg/m². Tim nhịp xoang đều, T1 T2 rõ, không nghe tiếng T3, T4, không có âm thổi bệnh lý. Phổi thông khí tốt, không rale ẩm rale nổ. Bụng mềm. Chi dưới không phù, mạch mu chân hai bên bắt rõ.",
        a: "Tăng huyết áp nguyên phát độ 2 (theo Hội Tim Mạch Việt Nam / ESC), kiểm soát chưa đạt mục tiêu do tuân thủ điều trị kém — Mã ICD-10: I10. Khó thở gắng sức độ II (NYHA).",
        p: "1. Tối ưu phác đồ: Phối hợp liều cố định Amlodipine 5mg + Perindopril 5mg (1 viên/ngày uống buổi sáng).\n2. Chỉ định cận lâm sàng: Điện tâm đồ (ECG), siêu âm tim, xét nghiệm chức năng thận (Creatinine, eGFR), Ion đồ, Lipid máu và Acid Uric.\n3. Giáo dục bệnh nhân: Nhấn mạnh tầm quan trọng của việc uống thuốc đều đặn mỗi ngày; ăn nhạt (< 5g muối/ngày), hạn chế mỡ động vật, đi bộ 30 phút/ngày.\n4. Tái khám sau 2 tuần kèm sổ nhật ký theo dõi huyết áp tại nhà.",
      },
    },
    pediatric: {
      title: "Ca 3: Nhi Khoa — Viêm Tiểu Phế Quản Cấp Ở Trẻ Nhỏ",
      patient: "Bé Lê Gia B., Nam, 14 tháng tuổi",
      chiefComplaint: "Sốt nhẹ, ho khan chuyển sang ho đờm khò khè 3 ngày",
      icd10: "J21.9 — Viêm tiểu phế quản cấp",
      transcript: [
        { speaker: "Bác sĩ", text: "Chào mẹ, bé nhà mình bị sao thế mẹ kể bác sĩ nghe?" },
        { speaker: "Thân nhân", text: "Dạ thưa bác sĩ, cháu sốt nhẹ 38 độ từ 3 hôm trước, kèm theo chảy mũi trong. Từ hôm qua cháu bắt đầu ho nhiều, thở nghe có tiếng khò khè rít rít, bú kém hơn bình thường." },
        { speaker: "Bác sĩ", text: "Bé có bị nôn trớ hết sau khi ăn không mẹ? Có co giật hay thở co rút ngực lõm vào không?" },
        { speaker: "Thân nhân", text: "Dạ không nôn trớ hết, không giật mình co giật. Bé vẫn chơi nhưng quấy khóc hơn khi bú." },
        { speaker: "Bác sĩ", text: "Bé cân nặng 10.2 kg, nhiệt độ 37.8°C, nhịp thở 44 lần/phút, SpO2 96% khí trời. Họng đỏ nhẹ, không giả mạc. Lồng ngực di động đều, có co kéo nhẹ cơ liên sườn. Phổi nghe rale rít và rale ẩm rải rác hai phế trường." },
      ],
      caps: [
        { fact: "Sốt 3 ngày (cao nhất 38°C), chảy mũi trong, ho khò khè tăng dần, bú giảm", polarity: "Khẳng định", quote: "cháu sốt nhẹ 38 độ từ 3 hôm trước... ho nhiều, thở nghe có tiếng khò khè rít rít" },
        { fact: "Không nôn trớ hoàn toàn, không co giật", polarity: "Phủ định nguy cơ", quote: "không nôn trớ hết, không giật mình co giật" },
        { fact: "Khám: Cân nặng 10.2kg, Thở 44 l/p, SpO2 96%, co kéo nhẹ cơ liên sườn", polarity: "Thực thể", quote: "nhịp thở 44 lần/phút, SpO2 96% khí trời... có co kéo nhẹ cơ liên sườn" },
        { fact: "Nghe phổi: Rale rít và rale ẩm rải rác hai phế trường", polarity: "Thực thể", quote: "Phổi nghe rale rít và rale ẩm rải rác hai phế trường" },
      ],
      soap: {
        s: "Bệnh nhi nam 14 tháng tuổi, cân nặng 10.2 kg, mẹ đưa đến khám vì ho và thở khò khè ngày thứ 3. Khởi phát sốt nhẹ 38°C kèm sổ mũi trong, sau đó ho nhiều, thở nghe tiếng khò khè, bú giảm khoảng 30%. Không nôn ói tất cả mọi thứ, không li bì, không co giật. Tiền sử tiêm chủng đầy đủ theo lứa tuổi.",
        o: "Trẻ tỉnh, tiếp xúc tốt, quấy khóc khi khám. Sinh hiệu: Mạch 120 l/p, Nhịp thở 44 l/p (ngưỡng thở nhanh nhẹ theo WHO lứa tuổi 12-59 tháng), Nhiệt độ 37.8°C, SpO2 96% khí trời. Khám hô hấp: Cánh mũi không phập phồng, co kéo nhẹ khoảng gian sườn, không co rút hõm ức. Nghe phổi: Thông khí đều, có rale rít và rale ẩm rải rác hai phế trường. Họng sung huyết nhẹ, không mủ.",
        a: "Viêm tiểu phế quản cấp đợt đầu, mức độ trung bình, chưa có suy hô hấp — Mã ICD-10: J21.9.",
        p: "1. Xử trí & Điều trị: Vệ sinh mũi họng bằng nước muối sinh lý 0.9% trước khi ăn/bú; khí dung NaCl 3% (nếu cần theo chỉ định); Paracetamol siro 150mg khi sốt ≥ 38.5°C; cho trẻ bú nhiều lần thành bữa nhỏ; uống đủ nước.\n2. Hướng dẫn theo dõi dấu hiệu nguy hiểm cần tái khám ngay lập tức: Thở nhanh hơn, rút lõm lồng ngực rõ, cánh mũi phập phồng, tím tái quanh môi, bỏ bú hoặc nôn trớ tất cả mọi thứ.\n3. Hẹn tái khám sau 48 giờ để đánh giá lại diễn tiến hô hấp.",
      },
    },
  };

  const currentCaseData = clinicalCases[selectedCase];

  return (
    <div className="min-h-screen bg-white text-ink selection:bg-emerald-100 selection:text-emerald-900">
      {/* Fixed Top Bar - Streamlined, clean, zero overflow */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-line bg-white/95 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
            aria-label="Mở cây thư mục"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="ClinNote AI" className="h-7 w-7 object-contain" />
            <span className="font-serif text-base font-bold text-neutral-900">ClinNote AI</span>
          </Link>
          <span className="hidden sm:inline-block text-neutral-300">/</span>
          <span className="hidden sm:inline-block text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            Cẩm Nang Lâm Sàng SOAP
          </span>
        </div>

        {/* Right actions: Compact search + quick links */}
        <div className="flex items-center gap-3 text-xs">
          <div className="relative w-44 sm:w-56 hidden sm:block">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Tìm chuyên khoa, mã ICD..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border border-neutral-200 bg-neutral-50 py-1 pl-8 pr-3 text-xs text-neutral-800 placeholder-neutral-400 focus:bg-white focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <Link href="/" className="hidden md:inline-block font-medium text-neutral-600 hover:text-emerald-700">
            Trang chủ
          </Link>

          <Link
            href={authed ? "/desk" : "/login"}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-700 px-3.5 py-1.5 font-medium text-white shadow-2xs transition hover:bg-emerald-800"
          >
            <Stethoscope className="h-3.5 w-3.5" />
            <span>{authed ? "Bàn làm việc" : "Vào phòng khám"}</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto flex max-w-7xl items-start">
        {/* Left Sidebar - Sticky Hierarchical Clinical Tree Structure */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 lg:w-80 border-r border-line bg-white px-3 pt-16 pb-10 transition-transform lg:sticky lg:top-14 lg:z-30 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:pt-5 lg:pb-6 lg:overflow-y-auto lg:shrink-0 ${
            sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full lg:translate-x-0"
          }`}
        >
          <div className="h-full overflow-y-auto lg:overflow-y-visible pr-1 space-y-4 text-xs">
            <div className="px-2 pb-2 border-b border-line">
              <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                CÂY THƯ MỤC LÂM SÀNG
              </span>
              <p className="text-[11px] text-neutral-500 mt-0.5">Phân loại theo khối khoa bệnh viện chuẩn</p>
            </div>

            {/* Quick search on mobile */}
            <div className="sm:hidden px-2">
              <input
                type="text"
                placeholder="Tìm kiếm chuyên khoa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 p-2 text-xs"
              />
            </div>

            {/* Folder 1: Cẩm Nang Chung */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => toggleFolder("intro")}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-neutral-800 hover:bg-neutral-100 transition"
              >
                <span className="flex items-center gap-2">
                  {openFolders.intro ? (
                    <FolderOpen className="h-4 w-4 text-emerald-700" />
                  ) : (
                    <Folder className="h-4 w-4 text-neutral-500" />
                  )}
                  <span>1. Cẩm Nang & Quy Chuẩn (4)</span>
                </span>
                <ChevronDown
                  className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
                    openFolders.intro ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>

              {openFolders.intro && (
                <div className="ml-4 border-l border-neutral-200 pl-3 space-y-1 py-1 text-neutral-600">
                  <a
                    href="#intro"
                    onClick={() => setSidebarOpen(false)}
                    className="block py-1 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Tổng quan định dạng SOAP</span>
                  </a>
                  <a
                    href="#whats-new-2026"
                    onClick={() => setSidebarOpen(false)}
                    className="block py-1 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Công nghệ đối chiếu CAP</span>
                  </a>
                  <a
                    href="#what-are-soap-notes"
                    onClick={() => setSidebarOpen(false)}
                    className="block py-1 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Cấu trúc 4 phần S-O-A-P</span>
                  </a>
                  <a
                    href="#common-mistakes"
                    onClick={() => setSidebarOpen(false)}
                    className="block py-1 hover:text-emerald-700 flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Lưu ý sai sót thường gặp</span>
                  </a>
                </div>
              )}
            </div>

            {/* Folder 2: Ca Bệnh Mẫu Thực Tế */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  document.getElementById("interactive-cases")?.scrollIntoView({ behavior: "smooth" });
                  setSidebarOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 font-semibold text-neutral-800 hover:bg-neutral-100 transition"
              >
                <span className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-700" />
                  <span>2. Ca Bệnh Mẫu Đối Chiếu (3)</span>
                </span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                  Demo
                </span>
              </button>

              <div className="ml-4 border-l border-neutral-200 pl-3 space-y-1 py-1 text-neutral-600">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCase("gerd");
                    setSidebarOpen(false);
                    document.getElementById("interactive-cases")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`block w-full text-left py-1 hover:text-emerald-700 truncate ${
                    selectedCase === "gerd" ? "font-bold text-emerald-800" : ""
                  }`}
                >
                  • Ca 1: Trào ngược GERD (K21.9)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCase("hypertension");
                    setSidebarOpen(false);
                    document.getElementById("interactive-cases")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`block w-full text-left py-1 hover:text-emerald-700 truncate ${
                    selectedCase === "hypertension" ? "font-bold text-emerald-800" : ""
                  }`}
                >
                  • Ca 2: Tăng huyết áp (I10)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCase("pediatric");
                    setSidebarOpen(false);
                    document.getElementById("interactive-cases")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`block w-full text-left py-1 hover:text-emerald-700 truncate ${
                    selectedCase === "pediatric" ? "font-bold text-emerald-800" : ""
                  }`}
                >
                  • Ca 3: Viêm tiểu phế quản (J21.9)
                </button>
              </div>
            </div>

          </div>
        </aside>

        {/* Main Content Article Body */}
        <main className="flex-1 min-w-0 px-4 py-8 sm:px-8 lg:px-12 max-w-4xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs text-neutral-500 mb-6">
            <Link href="/" className="hover:text-emerald-700">
              Trang chủ
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-neutral-800 font-medium">Hướng dẫn & Mẫu bệnh án SOAP</span>
          </nav>

          {/* Article Header */}
          <article className="prose max-w-none">
            <div id="intro" className="border-b border-line pb-8 scroll-mt-20">
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span>Tài liệu tham khảo chuyên môn lâm sàng</span>
              </div>
              <h1 className="mt-4 font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 leading-tight">
                Hướng Dẫn Viết Bệnh Án SOAP và Tuyển Tập Mẫu Lâm Sàng Chuẩn Hóa
              </h1>
              <p className="mt-4 text-base sm:text-lg leading-relaxed text-neutral-700">
                Tài liệu tổng hợp phương pháp ghi chép bệnh án theo định dạng <strong>SOAP (Subjective – Objective – Assessment – Plan)</strong>.
                Đây là cấu trúc tiêu chuẩn quốc tế giúp chuẩn hóa việc theo dõi thông tin người bệnh, đảm bảo tính liên tục trong điều trị
                và củng cố giá trị pháp lý của hồ sơ y khoa.
              </p>
              <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                Được tích hợp cùng công nghệ <strong>ClinNote AI</strong>, phương thức chuyển đổi hội thoại qua lớp trung gian
                <strong> CAP (Clinical Atomic Propositions)</strong> giúp kiểm soát nguy cơ sai lệch thông tin từ mô hình ngôn ngữ lớn
                và tối ưu hóa thời gian lập hồ sơ bệnh án cho nhân viên y tế.
              </p>
            </div>

            {/* Section: Điểm mới công nghệ */}
            <section id="whats-new-2026" className="mt-10 pt-4 border-b border-line pb-10 scroll-mt-20">
              <h2 className="font-serif text-2xl font-bold text-neutral-900 flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-700" />
                <span>Phương Pháp Mới Trong Ghi Chép Lâm Sàng</span>
              </h2>
              <p className="mt-3 text-sm text-neutral-700 leading-relaxed">
                Bộ tài liệu cập nhật các quy chuẩn ghi nhận hiện đại nhằm hỗ trợ tối đa cho thực hành lâm sàng:
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Cơ Chế Đối Chiếu Bằng Chứng CAP
                  </h3>
                  <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                    Ứng dụng công nghệ AI Scribe tiếng Việt kết hợp cơ chế CAP Grounding nhằm truy xuất nguồn gốc từng câu,
                    bảo toàn tính chuẩn xác của các phát biểu phủ định và trạng thái nghi ngờ.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    Tra Cứu Mã ICD-10 Bộ Y Tế
                  </h3>
                  <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                    Mỗi mẫu bệnh án đều đối chiếu với danh mục mã bệnh của Cục Quản lý Khám, chữa bệnh (icd.kcb.vn),
                    hỗ trợ công tác lưu trữ và giám định bảo hiểm y tế.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-emerald-700" />
                    Quy Chuẩn Ghi Chép Khám Từ Xa
                  </h3>
                  <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                    Hướng dẫn phân loại triệu chứng qua phiên thoại từ xa (Telehealth) tuân thủ quy định hiện hành về khám chữa bệnh từ xa.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-emerald-700" />
                    Phân Khối 21+ Chuyên Khoa Chuẩn Mực
                  </h3>
                  <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
                    Cấu trúc khoa học theo từng khối lâm sàng: Nội, Ngoại - Cấp cứu, Sản - Nhi, Giác quan và Y học hỗ trợ.
                  </p>
                </div>
              </div>
            </section>

            {/* Section: Bệnh án SOAP là gì? */}
            <section id="what-are-soap-notes" className="mt-10 pt-4 border-b border-line pb-10 scroll-mt-20">
              <h2 className="font-serif text-2xl font-bold text-neutral-900">
                Cấu Trúc 4 Thành Tố SOAP Trong Lâm Sàng
              </h2>
              <p className="mt-3 text-sm text-neutral-700 leading-relaxed">
                Định dạng SOAP chia tách thông tin khám bệnh thành 4 phần logic rõ ràng:
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border-l-4 border-emerald-600 bg-neutral-50/70 p-4 pl-5">
                  <h3 className="text-base font-bold text-neutral-900">
                    S — Subjective (Triệu Chứng Cơ Năng & Bệnh Sử)
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-700 leading-relaxed">
                    Ghi nhận thông tin do người bệnh hoặc người nhà trực tiếp cung cấp:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-xs text-neutral-600 space-y-1">
                    <li><strong>Lý do vào viện (Chief Complaint):</strong> Vấn đề chính khiến người bệnh đi khám.</li>
                    <li><strong>Bệnh sử hiện tại (HPI):</strong> Khởi phát, vị trí, mức độ, tính chất đau, thời gian và yếu tố tăng giảm.</li>
                    <li><strong>Triệu chứng phủ định có ý nghĩa:</strong> Những biểu hiện bệnh nhân xác nhận KHÔNG xuất hiện.</li>
                    <li><strong>Tiền sử bệnh và thuốc:</strong> Bệnh lý nền, tiền sử dị ứng và các loại thuốc đang sử dụng thường xuyên.</li>
                  </ul>
                </div>

                <div className="rounded-xl border-l-4 border-teal-600 bg-neutral-50/70 p-4 pl-5">
                  <h3 className="text-base font-bold text-neutral-900">
                    O — Objective (Dấu Hiệu Thực Thể & Cận Lâm Sàng)
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-700 leading-relaxed">
                    Các dữ liệu khách quan do nhân viên y tế đo lường và thăm khám trực tiếp:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-xs text-neutral-600 space-y-1">
                    <li><strong>Dấu hiệu sinh tồn:</strong> Mạch, Huyết áp, Nhiệt độ, Nhịp thở, SpO2, BMI.</li>
                    <li><strong>Khám thực thể:</strong> Nhìn, Sờ, Gõ, Nghe các cơ quan (Tim mạch, Hô hấp, Tiêu hóa, Thần kinh, Vận động...).</li>
                    <li><strong>Kết quả cận lâm sàng:</strong> Kết quả xét nghiệm máu, nước tiểu, hình ảnh X-quang, Siêu âm, ECG.</li>
                  </ul>
                </div>

                <div className="rounded-xl border-l-4 border-amber-600 bg-neutral-50/70 p-4 pl-5">
                  <h3 className="text-base font-bold text-neutral-900">
                    A — Assessment (Đánh Giá & Nhận Định Chẩn Đoán)
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-700 leading-relaxed">
                    Tổng hợp phân tích chuyên môn của người hành nghề dựa trên S và O:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-xs text-neutral-600 space-y-1">
                    <li><strong>Chẩn đoán xác định:</strong> Kèm mã bệnh chuẩn ICD-10.</li>
                    <li><strong>Chẩn đoán phân biệt:</strong> Các tình trạng bệnh lý tương tự cần lưu ý theo dõi.</li>
                    <li><strong>Đánh giá tiến triển:</strong> Mức độ cải thiện hoặc xấu đi so với các lần khám trước.</li>
                  </ul>
                </div>

                <div className="rounded-xl border-l-4 border-blue-600 bg-neutral-50/70 p-4 pl-5">
                  <h3 className="text-base font-bold text-neutral-900">
                    P — Plan (Kế Hoạch Điều Trị & Theo Dõi)
                  </h3>
                  <p className="mt-1.5 text-xs text-neutral-700 leading-relaxed">
                    Phác đồ can thiệp và phương án quản lý bệnh nhân tiếp theo:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-xs text-neutral-600 space-y-1">
                    <li><strong>Y lệnh thuốc:</strong> Tên thuốc, nồng độ, liều lượng, đường dùng và thời gian điều trị.</li>
                    <li><strong>Chỉ định cận lâm sàng tiếp theo:</strong> Các xét nghiệm chuyên sâu cần thực hiện.</li>
                    <li><strong>Tư vấn sinh hoạt:</strong> Hướng dẫn dinh dưỡng, vận động và nghỉ ngơi phù hợp.</li>
                    <li><strong>Kế hoạch theo dõi:</strong> Hẹn ngày tái khám và cảnh báo các dấu hiệu cần quay lại bệnh viện khẩn cấp.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section: Interactive Case Viewer */}
            <section id="interactive-cases" className="mt-10 pt-4 border-b border-line pb-10 scroll-mt-20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-neutral-900">
                    Mô Hình Ca Bệnh Thực Tế: Lời Thoại → CAP → SOAP
                  </h2>
                  <p className="text-xs text-neutral-600 mt-1">
                    Đối chiếu 3 tầng dữ liệu từ lời thoại nguyên bản đến hồ sơ bệnh án chính thức:
                  </p>
                </div>
              </div>

              {/* Case Buttons */}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCase("gerd")}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                    selectedCase === "gerd"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Ca 1: Nội Tiêu Hoá (GERD)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCase("hypertension")}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                    selectedCase === "hypertension"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Ca 2: Tim Mạch (Tăng huyết áp)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCase("pediatric")}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                    selectedCase === "pediatric"
                      ? "bg-emerald-700 text-white shadow-2xs"
                      : "border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  Ca 3: Nhi Khoa (Viêm tiểu phế quản)
                </button>
              </div>

              {/* Case Card Viewer */}
              <div className="mt-6 rounded-2xl border border-line bg-white shadow-2xs overflow-hidden">
                <div className="border-b border-line bg-neutral-50 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-serif text-base font-bold text-neutral-900">{currentCaseData.title}</h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Bệnh nhân: <strong>{currentCaseData.patient}</strong> · Lý do: <em>{currentCaseData.chiefComplaint}</em>
                    </p>
                  </div>
                  <span className="rounded bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-bold text-emerald-800">
                    {currentCaseData.icd10}
                  </span>
                </div>

                <div className="p-4 sm:p-6 space-y-6">
                  {/* Step 1: Transcript */}
                  <div>
                    <h4 className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-700 uppercase">
                      <Mic className="h-4 w-4 text-emerald-700" />
                      1. Đoạn Lời Thoại Ghi Nhận (Transcript)
                    </h4>
                    <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3.5 text-xs text-neutral-700 border border-neutral-100">
                      {currentCaseData.transcript.map((line, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span
                            className={`font-semibold shrink-0 ${
                              line.speaker === "Bác sĩ" ? "text-emerald-800" : "text-neutral-900"
                            }`}
                          >
                            {line.speaker}:
                          </span>
                          <span className="leading-relaxed">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Extracted CAP Facts */}
                  <div>
                    <h4 className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-700 uppercase">
                      <Layers className="h-4 w-4 text-emerald-700" />
                      2. Các Mệnh Đề Lâm Sàng Nguyên Tử (CAP Facts Có Trích Dẫn)
                    </h4>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                      {currentCaseData.caps.map((cap, idx) => (
                        <div key={idx} className="rounded-lg border border-neutral-200 bg-white p-3">
                          <div className="flex items-center justify-between">
                            <span className="rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                              {cap.polarity}
                            </span>
                            <span className="text-[10px] text-neutral-400">#CAP-{idx + 1}</span>
                          </div>
                          <p className="mt-1.5 font-semibold text-neutral-900">{cap.fact}</p>
                          <p className="mt-1.5 text-[11px] text-neutral-500 italic bg-neutral-50 p-1.5 rounded border border-neutral-100">
                            Trích dẫn: “{cap.quote}”
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Formatted SOAP Note */}
                  <div>
                    <h4 className="flex items-center gap-2 font-mono text-xs font-bold text-neutral-700 uppercase">
                      <FileCheck className="h-4 w-4 text-emerald-700" />
                      3. Bản Ghi Bệnh Án SOAP Chuẩn Hóa
                    </h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 text-xs">
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
                        <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-100">S — Subjective</div>
                        <p className="mt-2 text-neutral-700 leading-relaxed whitespace-pre-line">{currentCaseData.soap.s}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
                        <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-100">O — Objective</div>
                        <p className="mt-2 text-neutral-700 leading-relaxed whitespace-pre-line">{currentCaseData.soap.o}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
                        <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-100">A — Assessment</div>
                        <p className="mt-2 text-neutral-700 leading-relaxed whitespace-pre-line">{currentCaseData.soap.a}</p>
                      </div>
                      <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
                        <div className="font-bold text-emerald-800 pb-1 border-b border-neutral-100">P — Plan</div>
                        <p className="mt-2 text-neutral-700 leading-relaxed whitespace-pre-line">{currentCaseData.soap.p}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Common Mistakes */}
            <section id="common-mistakes" className="mt-10 pt-4 border-b border-line pb-10 scroll-mt-20">
              <h2 className="font-serif text-2xl font-bold text-neutral-900">
                Các Lưu Ý Thường Gặp Khi Lập Hồ Sơ SOAP
              </h2>
              <div className="mt-5 space-y-3 text-xs">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <h3 className="font-bold text-neutral-900 text-sm">1. Nhầm Lẫn Giữa Subjective (S) Và Objective (O)</h3>
                  <p className="mt-1 text-neutral-700 leading-relaxed">
                    <strong>Tình huống:</strong> Ghi nhận chỉ số sốt hoặc kết luận cận lâm sàng vào phần S dựa trên lời kể mà không có đối chiếu kết quả đo thực tế, hoặc đưa cảm nhận chủ quan của bệnh nhân vào mục O.<br />
                    <strong>Nguyên tắc:</strong> Phần S chỉ phản ánh những thông tin do người bệnh khai báo. Mọi chỉ số sinh hiệu, dấu chứng qua khám lâm sàng và kết quả xét nghiệm thuộc về phần O.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <h3 className="font-bold text-neutral-900 text-sm">2. Phần Đánh Giá (A) Chưa Tương Thích Với Dữ Liệu Lâm Sàng</h3>
                  <p className="mt-1 text-neutral-700 leading-relaxed">
                    <strong>Tình huống:</strong> Đưa ra chẩn đoán nhưng phần bệnh sử (S) và khám thực thể (O) không ghi nhận các dấu hiệu hỗ trợ tương ứng.<br />
                    <strong>Nguyên tắc:</strong> Mọi chẩn đoán trong Assessment cần có cơ sở triệu chứng hoặc kết quả cận lâm sàng minh chứng từ các mục trước.
                  </p>
                </div>

                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <h3 className="font-bold text-neutral-900 text-sm">3. Kế Hoạch (P) Thiếu Định Lượng Và Hướng Dẫn Cảnh Báo</h3>
                  <p className="mt-1 text-neutral-700 leading-relaxed">
                    <strong>Tình huống:</strong> Chỉ ghi chung chung 'kê đơn thuốc và theo dõi' mà không có tên hoạt chất, liều lượng cụ thể và thời gian tái khám.<br />
                    <strong>Nguyên tắc:</strong> Kế hoạch can thiệp cần định lượng rõ ràng kèm theo các dấu hiệu cảnh báo nguy hiểm để người bệnh kịp thời quay lại cơ sở y tế.
                  </p>
                </div>
              </div>
            </section>

            {/* Section: CTA Box */}
            <div className="mt-12 rounded-2xl bg-neutral-900 p-8 text-center text-white sm:p-10">
              <h2 className="font-serif text-2xl sm:text-3xl font-bold">
                Trải Nghiệm Trợ Lý Ghi Chép Lâm Sàng ClinNote AI
              </h2>
              <p className="mt-3 text-neutral-300 text-sm max-w-xl mx-auto leading-relaxed">
                Hỗ trợ bác sĩ chuyển đổi hội thoại khám bệnh thành hồ sơ SOAP có đối chiếu bằng chứng minh bạch.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/login"
                  className="rounded-xl bg-emerald-700 px-6 py-2.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-emerald-800"
                >
                  Tạo Bản Thảo SOAP
                </Link>
                <Link
                  href="/"
                  className="rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-2.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700"
                >
                  Về Trang Chủ ClinNote AI
                </Link>
              </div>
            </div>

            {/* Section: Feedback */}
            <div className="mt-12 border-t border-line pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-neutral-600">
              <span className="font-medium">Tài liệu này có hữu ích với quá trình thực hành của bạn không?</span>
              {feedbackGiven ? (
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Check className="h-4 w-4" /> Cảm ơn bạn đã đóng góp ý kiến.
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackGiven("yes")}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 active:scale-95"
                  >
                    <ThumbsUp className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Hữu ích</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackGiven("no")}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 active:scale-95"
                  >
                    <ThumbsDown className="h-3.5 w-3.5 text-neutral-400" />
                    <span>Cần cải thiện thêm</span>
                  </button>
                </div>
              )}
            </div>
          </article>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-line bg-neutral-50 py-10 text-xs text-neutral-500 mt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="ClinNote AI" className="h-6 w-6 object-contain" />
            <span className="font-serif font-bold text-neutral-800">ClinNote AI — Cẩm Nang Lâm Sàng SOAP</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-emerald-700">Trang chủ</Link>
            <Link href="/desk" className="hover:text-emerald-700">Bàn làm việc</Link>
            <Link href="/soap" className="hover:text-emerald-700">Thử nghiệm CAP</Link>
          </div>
          <p className="text-[11px] text-neutral-400">
            Tài liệu phục vụ mục đích học tập và tham khảo thực hành lâm sàng. Quyết định chuyên môn thuộc về Bác sĩ điều trị.
          </p>
        </div>
      </footer>
    </div>
  );
}

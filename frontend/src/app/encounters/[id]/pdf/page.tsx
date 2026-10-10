"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  Eye,
  FileBadge2,
  FileDown,
  Heading,
  Image as ImageIcon,
  Info,
  Layout,
  Minus,
  Palette,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Sliders,
  Upload,
  User,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import ClinicShell from "@/components/ClinicShell";
import { useEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getSupabase } from "@/lib/supabase";
import type { Encounter } from "@/types";
import "./pdf-config.css";

interface PdfConfig {
  patientInfo: {
    patientName: boolean;
    dob: boolean;
    age: boolean;
    gender: boolean;
    dateTime: boolean;
    doctor: boolean;
  };
  sections: {
    subjective: boolean;
    objective: boolean;
    assessment: boolean;
    plan: boolean;
    icd10: boolean;
  };
  icd: {
    showSection: boolean;
    showCode: boolean;
    showDiagnosis: boolean;
    showStatusTag: boolean;
  };
  layout: {
    pageSize: "A4" | "Letter";
    orientation: "portrait" | "landscape";
    margins: "compact" | "normal" | "wide";
    density: "comfortable" | "compact";
  };
  theme: "clinical-blue" | "medical-teal" | "professional-navy" | "minimal-gray" | "custom";
  customColors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  headerFooter: {
    hospitalName: string;
    docTitle: string;
    showLogo: boolean;
    showHospitalName: boolean;
    showDocTitle: boolean;
    showDoctorName: boolean;
    showEncounterDate: boolean;
    showPageNumber: boolean;
    showGeneratedByAi: boolean;
  };
  branding: {
    logoUrl: string | null;
    logoPosition: "left" | "center" | "right";
  };
}

const DEFAULT_PDF_CONFIG: PdfConfig = {
  patientInfo: {
    patientName: true,
    dob: true,
    age: true,
    gender: true,
    dateTime: true,
    doctor: true,
  },
  sections: {
    subjective: true,
    objective: true,
    assessment: true,
    plan: true,
    icd10: true,
  },
  icd: {
    showSection: true,
    showCode: true,
    showDiagnosis: true,
    showStatusTag: true,
  },
  layout: {
    pageSize: "A4",
    orientation: "portrait",
    margins: "normal",
    density: "comfortable",
  },
  theme: "clinical-blue",
  customColors: {
    primary: "#0284c7",
    secondary: "#0369a1",
    accent: "#0ea5e9",
  },
  headerFooter: {
    hospitalName: "Trung tâm Y tế VinMed",
    docTitle: "GHI CHÚ LÂM SÀNG",
    showLogo: true,
    showHospitalName: true,
    showDocTitle: true,
    showDoctorName: true,
    showEncounterDate: true,
    showPageNumber: true,
    showGeneratedByAi: false,
  },
  branding: {
    logoUrl: null,
    logoPosition: "left",
  },
};

const PRESET_PROFILES: Record<string, PdfConfig> = {
  standard: {
    ...DEFAULT_PDF_CONFIG,
    theme: "clinical-blue",
  },
  minimal: {
    ...DEFAULT_PDF_CONFIG,
    patientInfo: { patientName: true, dob: false, age: false, gender: true, dateTime: true, doctor: false },
    sections: { subjective: true, objective: true, assessment: true, plan: true, icd10: true },
    icd: { showSection: true, showCode: true, showDiagnosis: true, showStatusTag: false },
    layout: { pageSize: "A4", orientation: "portrait", margins: "compact", density: "compact" },
    theme: "minimal-gray",
    headerFooter: {
      hospitalName: "Trung tâm Y tế VinMed",
      docTitle: "GHI CHÚ LÂM SÀNG",
      showLogo: false,
      showHospitalName: true,
      showDocTitle: true,
      showDoctorName: false,
      showEncounterDate: true,
      showPageNumber: true,
      showGeneratedByAi: false,
    },
    branding: { logoUrl: null, logoPosition: "left" },
  },
  full: {
    ...DEFAULT_PDF_CONFIG,
    patientInfo: { patientName: true, dob: true, age: true, gender: true, dateTime: true, doctor: true },
    sections: { subjective: true, objective: true, assessment: true, plan: true, icd10: true },
    icd: { showSection: true, showCode: true, showDiagnosis: true, showStatusTag: true },
    layout: { pageSize: "A4", orientation: "portrait", margins: "normal", density: "comfortable" },
    theme: "professional-navy",
    headerFooter: {
      hospitalName: "Trung tâm Y tế VinMed",
      docTitle: "GHI CHÚ LÂM SÀNG",
      showLogo: true,
      showHospitalName: true,
      showDocTitle: true,
      showDoctorName: true,
      showEncounterDate: true,
      showPageNumber: true,
      showGeneratedByAi: true,
    },
    branding: { logoUrl: null, logoPosition: "left" },
  },
};

function formatEncounterDateTime(iso?: string) {
  if (!iso) return "Chưa cập nhật";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} – ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseListItems(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.map((line) => line.replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, ""));
}

export default function EncounterPdfConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  useRequireAuth();
  const { encounter } = useEncounter(id);

  // Encounter state with fallback to local draft
  const [activeEncounter, setActiveEncounter] = useState<Encounter | null>(null);
  const [doctorName, setDoctorName] = useState("BS. Nguyễn Hoàng Anh");

  // Config state
  const [pdfConfig, setPdfConfig] = useState<PdfConfig>(DEFAULT_PDF_CONFIG);
  const [activePreset, setActivePreset] = useState("standard");
  const [customPresets, setCustomPresets] = useState<Record<string, PdfConfig>>({});

  // Preview & Toolbar states
  const [zoomScale, setZoomScale] = useState(1.0);
  const [pageCount, setPageCount] = useState(1);

  // Modals
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [confirmVerified, setConfirmVerified] = useState(false);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const paperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load encounter data and Doctor info
  useEffect(() => {
    if (typeof window !== "undefined") {
      const draftJson = sessionStorage.getItem(`clinnote-draft-${id}`);
      if (draftJson) {
        try {
          const parsed = JSON.parse(draftJson) as Encounter;
          setActiveEncounter(parsed);
        } catch {
          // ignore
        }
      }
    }

    const supabase = getSupabase();
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        const full = data.session?.user?.user_metadata?.full_name;
        if (typeof full === "string" && full.trim()) {
          setDoctorName(full.trim());
        }
      });
    }

    try {
      const storedPresets = localStorage.getItem("vinmed_pdf_custom_presets_v3");
      if (storedPresets) {
        setCustomPresets(JSON.parse(storedPresets));
      }
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    if (encounter && !activeEncounter) {
      setActiveEncounter(encounter);
    }
  }, [encounter, activeEncounter]);

  // Recalculate estimated page count
  useEffect(() => {
    if (!paperRef.current) return;
    const pageHeight = pdfConfig.layout.orientation === "portrait" ? 1000 : 700;
    const currentHeight = paperRef.current.offsetHeight;
    const count = Math.max(1, Math.ceil(currentHeight / pageHeight));
    setPageCount(count);
  }, [pdfConfig, activeEncounter]);

  const hasUnsavedChanges = useMemo(() => {
    const reference = PRESET_PROFILES[activePreset] || customPresets[activePreset];
    if (!reference) return true;
    return JSON.stringify(pdfConfig) !== JSON.stringify(reference);
  }, [pdfConfig, activePreset, customPresets]);

  function updatePatientInfo<K extends keyof PdfConfig["patientInfo"]>(key: K, val: boolean) {
    setPdfConfig((prev) => ({
      ...prev,
      patientInfo: { ...prev.patientInfo, [key]: val },
    }));
  }

  function updateSection<K extends keyof PdfConfig["sections"]>(key: K, val: boolean) {
    setPdfConfig((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: val },
    }));
  }

  function updateIcd<K extends keyof PdfConfig["icd"]>(key: K, val: boolean) {
    setPdfConfig((prev) => ({
      ...prev,
      icd: { ...prev.icd, [key]: val },
    }));
  }

  function updateLayout<K extends keyof PdfConfig["layout"]>(key: K, val: PdfConfig["layout"][K]) {
    setPdfConfig((prev) => ({
      ...prev,
      layout: { ...prev.layout, [key]: val },
    }));
  }

  function updateHeaderFooter<K extends keyof PdfConfig["headerFooter"]>(key: K, val: PdfConfig["headerFooter"][K]) {
    setPdfConfig((prev) => ({
      ...prev,
      headerFooter: { ...prev.headerFooter, [key]: val },
    }));
  }

  function handlePresetChange(key: string) {
    setActivePreset(key);
    if (PRESET_PROFILES[key]) {
      setPdfConfig(JSON.parse(JSON.stringify(PRESET_PROFILES[key])));
      toast.info(`Đã tải mẫu: "${key}"`);
    } else if (customPresets[key]) {
      setPdfConfig(JSON.parse(JSON.stringify(customPresets[key])));
      toast.info(`Đã tải mẫu tùy chỉnh: "${key}"`);
    }
  }

  function resetToDefault() {
    setPdfConfig(JSON.parse(JSON.stringify(DEFAULT_PDF_CONFIG)));
    setActivePreset("standard");
    toast.success("Đã đặt lại cấu hình PDF về mặc định.");
  }

  function saveCustomPreset() {
    const name = newPresetName.trim();
    if (!name) {
      toast.error("Vui lòng nhập tên mẫu cấu hình.");
      return;
    }
    const updated = {
      ...customPresets,
      [name]: JSON.parse(JSON.stringify(pdfConfig)),
    };
    setCustomPresets(updated);
    try {
      localStorage.setItem("vinmed_pdf_custom_presets_v3", JSON.stringify(updated));
      setActivePreset(name);
      setSavePresetModalOpen(false);
      setNewPresetName("");
      toast.success(`Đã lưu mẫu "${name}" thành công!`);
    } catch {
      toast.error("Không thể lưu cấu hình vào bộ nhớ trình duyệt.");
    }
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      setPdfConfig((prev) => ({
        ...prev,
        branding: { ...prev.branding, logoUrl: url },
      }));
      toast.success("Đã tải logo lên thành công.");
    };
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    setPdfConfig((prev) => ({
      ...prev,
      branding: { ...prev.branding, logoUrl: null },
    }));
    toast.info("Đã đặt lại logo VMEC mặc định.");
  }

  function adjustZoom(delta: number) {
    setZoomScale((prev) => {
      const next = Math.min(Math.max(prev + delta / 100, 0.5), 1.6);
      return Math.round(next * 100) / 100;
    });
  }

  function resetZoom() {
    setZoomScale(1.0);
  }

  // Export PDF execution with font stability
  async function executeDownload() {
    setDownloadModalOpen(false);
    setIsExporting(true);
    toast.info("Đang khởi tạo bản tải PDF...");

    const element = paperRef.current;
    if (!element) {
      setIsExporting(false);
      return;
    }

    // Wait for all webfonts to be loaded so html2canvas doesn't fallback to serif
    if (typeof document !== "undefined" && document.fonts) {
      try {
        await document.fonts.ready;
      } catch {
        // ignore
      }
    }

    const patientName = activeEncounter?.patient.name?.trim() || "Benh_Nhan";
    const cleanFileName = `Ghi_Chu_Lam_Sang_${patientName.replace(/\s+/g, "_")}_${pdfConfig.layout.pageSize}.pdf`;

    const opt = {
      margin: 0,
      filename: cleanFileName,
      image: { type: "jpeg" as const, quality: 1.0 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        logging: false,
        letterRendering: true,
        allowTaint: true,
        onclone: (clonedDoc: Document) => {
          const sheet = clonedDoc.getElementById("pdfPaperSheet");
          if (sheet) {
            sheet.style.transform = "none";
            sheet.style.margin = "0";
            sheet.style.boxShadow = "none";
            sheet.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
          }
        },
      },
      jsPDF: {
        unit: "in",
        format: pdfConfig.layout.pageSize.toLowerCase(),
        orientation: pdfConfig.layout.orientation,
        compress: true,
      },
    };

    try {
      const win = window as unknown as { html2pdf?: () => { set: (o: unknown) => { from: (el: HTMLElement) => { save: () => Promise<void> } } } };
      if (win.html2pdf) {
        await win.html2pdf().set(opt).from(element).save();
        toast.success("Đã xuất tài liệu PDF thành công!");
      } else {
        try {
          const html2pdfModule = (await import("html2pdf.js")).default;
          await html2pdfModule().set(opt).from(element).save();
          toast.success("Đã xuất tài liệu PDF thành công!");
        } catch {
          window.print();
        }
      }
    } catch (err) {
      console.error(err);
      window.print();
    } finally {
      setIsExporting(false);
    }
  }

  // Resolved clinical data
  const patient = activeEncounter?.patient ?? {
    name: "Nguyễn Văn Minh",
    dob: "12/08/1985",
    age: 41,
    gender: "Nam" as const,
    reason: "Khó thở",
    code: "BN-2026-0041",
  };

  const encounterDate = formatEncounterDateTime(activeEncounter?.approvedAt || activeEncounter?.createdAt);

  const icdInfo = useMemo(() => {
    if (!activeEncounter) {
      return { code: "R06.02", diagnosis: "Khó thở" };
    }
    const matched = activeEncounter.icdSuggestions.find((item) => item.code === activeEncounter.selectedIcd) ?? activeEncounter.icdSuggestions[0];
    return {
      code: matched?.code || activeEncounter.selectedIcd || "R06.02",
      diagnosis: matched?.title || "Khó thở",
    };
  }, [activeEncounter]);

  const soapSubjective = activeEncounter?.soap.subjective || "Bệnh nhân cho biết tình trạng khó thở tăng dần trong khoảng một tuần qua.\nTriệu chứng trở nên nghiêm trọng hơn khi thực hiện các hoạt động sinh hoạt hằng ngày.\nBệnh nhân thỉnh thoảng xuất hiện ho khan và mệt mỏi.";
  const soapObjective = activeEncounter?.soap.objective || "Huyết áp: 135/85 mmHg. Nhịp tim: 96 lần/phút. Nhịp thở: 22 lần/phút. SpO2: 94%. Nhiệt độ: 37,2°C.\nKhám thực thể ghi nhận ran rít nhẹ hai bên phổi.\nĐộ giãn nở lồng ngực đối xứng.\nKhông ghi nhận phù ngoại biên.";
  const soapAssessment = activeEncounter?.soap.assessment || "Khó thở tăng dần.\nNghi ngờ co thắt phế quản.\nTheo dõi nhiễm trùng đường hô hấp.";
  const soapPlan = activeEncounter?.soap.plan || "Tiếp tục theo dõi tình trạng hô hấp.\nTheo dõi SpO2.\nCân nhắc chụp X-quang ngực.\nTái khám trong vòng 48–72 giờ.\nCân nhắc thực hiện thêm các xét nghiệm cần thiết.";

  const subjectiveItems = parseListItems(soapSubjective);
  const objectiveItems = parseListItems(soapObjective);
  const assessmentItems = parseListItems(soapAssessment);
  const planItems = parseListItems(soapPlan);

  const hasAnyPatientInfo = Object.values(pdfConfig.patientInfo).some(Boolean);
  const icdVisible = pdfConfig.sections.icd10 && pdfConfig.icd.showSection;

  return (
    <ClinicShell section="encounter" defaultCollapsed>
      {/* Preload Inter Font for strict font preservation */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <Script src="/vendor/html2pdf.bundle.min.js" strategy="lazyOnload" />

      <div className="pdf-studio-container">
        {/* TOP ACTION BAR - Unified with ClinNote UI */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-white px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href={`/encounters/${id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 sm:px-3 text-xs font-semibold text-ink shadow-xs hover:bg-subtle transition-colors"
            >
              ← Ghi chú SOAP
            </Link>
            <span className="text-line">|</span>
            <div className="flex items-center gap-1.5">
              <Sliders size={14} className="text-ink" />
              <span className="text-xs font-bold text-ink">Cấu hình & Xem trước PDF</span>
            </div>
            <span className="hidden sm:inline-block text-xs text-muted">
              · {patient.name} {patient.code ? `(${patient.code})` : ""}
            </span>
            {hasUnsavedChanges && (
              <span className="rounded-full bg-subtle border border-[#d4d4d8] px-2 py-0.5 text-[10px] font-semibold text-[#52525b]">
                Đã thay đổi
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-xs font-semibold text-ink shadow-xs hover:bg-subtle transition-colors"
            >
              <Printer size={13} /> In bản xem trước
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmVerified(false);
                setDownloadModalOpen(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink bg-ink px-3 text-xs font-semibold text-white shadow-xs hover:bg-ink/90 transition-colors"
            >
              <Download size={13} /> Tải PDF
            </button>
          </div>
        </header>

        {/* MAIN STUDIO AREA */}
        <div className="pdf-studio-layout">
          {/* LEFT SIDEBAR: CONFIG CONTROLS */}
          <aside className="pdf-sidebar-config">
            {/* Tier 1: Fixed Header */}
            <div className="pdf-sidebar-header">
              <div className="pdf-preset-selector-bar">
                <label htmlFor="presetSelect">Mẫu cấu hình:</label>
                <select
                  id="presetSelect"
                  className="pdf-form-select"
                  value={activePreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="standard">Tài liệu lâm sàng chuẩn</option>
                  <option value="minimal">Tài liệu tối giản</option>
                  <option value="full">Báo cáo lâm sàng đầy đủ</option>
                  {Object.keys(customPresets).map((k) => (
                    <option key={k} value={k}>★ {k}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-white text-muted hover:text-ink hover:bg-subtle transition-colors"
                  title="Lưu cấu hình hiện tại"
                  onClick={() => setSavePresetModalOpen(true)}
                >
                  <BookmarkPlus size={14} />
                </button>
              </div>
            </div>

            {/* Tier 2: Scrollable Sections */}
            <div className="pdf-config-scroll-area">
              
              {/* 1. Patient & Encounter Info */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <UserCheck size={15} />
                  <span>1. Thông tin bệnh nhân & Lần khám</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <div className="pdf-checkbox-grid">
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.patientName}
                        onChange={(e) => updatePatientInfo("patientName", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Họ và tên</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.dob}
                        onChange={(e) => updatePatientInfo("dob", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Ngày sinh</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.age}
                        onChange={(e) => updatePatientInfo("age", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Tuổi</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.gender}
                        onChange={(e) => updatePatientInfo("gender", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Giới tính</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.dateTime}
                        onChange={(e) => updatePatientInfo("dateTime", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Thời gian khám</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.patientInfo.doctor}
                        onChange={(e) => updatePatientInfo("doctor", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Bác sĩ</span>
                    </label>
                  </div>
                </div>
              </details>

              {/* 2. SOAP Sections */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <ClipboardList size={15} />
                  <span>2. Các phần nội dung SOAP</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <div className="pdf-checkbox-stack">
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.sections.subjective}
                        onChange={(e) => updateSection("subjective", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>1. Chủ quan (Subjective)</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.sections.objective}
                        onChange={(e) => updateSection("objective", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>2. Khách quan (Objective)</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.sections.assessment}
                        onChange={(e) => updateSection("assessment", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>3. Đánh giá (Assessment)</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.sections.plan}
                        onChange={(e) => updateSection("plan", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>4. Kế hoạch (Plan)</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.sections.icd10}
                        onChange={(e) => updateSection("icd10", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>ICD-10 đã xác nhận</span>
                    </label>
                  </div>
                </div>
              </details>

              {/* 3. ICD-10 Display Options */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <FileBadge2 size={15} />
                  <span>3. Trình bày ICD-10</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <label className="pdf-custom-checkbox pdf-primary-toggle">
                    <input
                      type="checkbox"
                      checked={pdfConfig.icd.showSection}
                      onChange={(e) => updateIcd("showSection", e.target.checked)}
                    />
                    <span className="pdf-checkmark"></span>
                    <strong>Hiển thị mục ICD-10 đã xác nhận</strong>
                  </label>

                  {pdfConfig.icd.showSection && (
                    <div className="pdf-sub-options-group">
                      <div className="pdf-checkbox-stack">
                        <label className="pdf-custom-checkbox">
                          <input
                            type="checkbox"
                            checked={pdfConfig.icd.showCode}
                            onChange={(e) => updateIcd("showCode", e.target.checked)}
                          />
                          <span className="pdf-checkmark"></span>
                          <span>Hiển thị mã ICD-10 ({icdInfo.code})</span>
                        </label>
                        <label className="pdf-custom-checkbox">
                          <input
                            type="checkbox"
                            checked={pdfConfig.icd.showDiagnosis}
                            onChange={(e) => updateIcd("showDiagnosis", e.target.checked)}
                          />
                          <span className="pdf-checkmark"></span>
                          <span>Hiển thị tên chẩn đoán ({icdInfo.diagnosis})</span>
                        </label>
                        <label className="pdf-custom-checkbox">
                          <input
                            type="checkbox"
                            checked={pdfConfig.icd.showStatusTag}
                            onChange={(e) => updateIcd("showStatusTag", e.target.checked)}
                          />
                          <span className="pdf-checkmark"></span>
                          <span>Hiển thị nhãn &quot;✓ Đã xác nhận&quot;</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </details>

              {/* 4. Document Layout */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <Layout size={15} />
                  <span>4. Bố cục tài liệu</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Khổ giấy:</label>
                    <div className="pdf-segmented-control">
                      <label>
                        <input
                          type="radio"
                          name="pageSize"
                          value="A4"
                          checked={pdfConfig.layout.pageSize === "A4"}
                          onChange={() => updateLayout("pageSize", "A4")}
                        />
                        <span>A4</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="pageSize"
                          value="Letter"
                          checked={pdfConfig.layout.pageSize === "Letter"}
                          onChange={() => updateLayout("pageSize", "Letter")}
                        />
                        <span>Letter</span>
                      </label>
                    </div>
                  </div>

                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Hướng giấy:</label>
                    <div className="pdf-segmented-control">
                      <label>
                        <input
                          type="radio"
                          name="orientation"
                          value="portrait"
                          checked={pdfConfig.layout.orientation === "portrait"}
                          onChange={() => updateLayout("orientation", "portrait")}
                        />
                        <span>Dọc</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="orientation"
                          value="landscape"
                          checked={pdfConfig.layout.orientation === "landscape"}
                          onChange={() => updateLayout("orientation", "landscape")}
                        />
                        <span>Ngang</span>
                      </label>
                    </div>
                  </div>

                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Lề trang:</label>
                    <div className="pdf-segmented-control">
                      <label>
                        <input
                          type="radio"
                          name="margins"
                          value="compact"
                          checked={pdfConfig.layout.margins === "compact"}
                          onChange={() => updateLayout("margins", "compact")}
                        />
                        <span>Gọn</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="margins"
                          value="normal"
                          checked={pdfConfig.layout.margins === "normal"}
                          onChange={() => updateLayout("margins", "normal")}
                        />
                        <span>Bình thường</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="margins"
                          value="wide"
                          checked={pdfConfig.layout.margins === "wide"}
                          onChange={() => updateLayout("margins", "wide")}
                        />
                        <span>Rộng</span>
                      </label>
                    </div>
                  </div>

                  <div className="pdf-form-group" style={{ marginBottom: 0 }}>
                    <label className="pdf-form-label">Mật độ nội dung:</label>
                    <div className="pdf-segmented-control">
                      <label>
                        <input
                          type="radio"
                          name="density"
                          value="comfortable"
                          checked={pdfConfig.layout.density === "comfortable"}
                          onChange={() => updateLayout("density", "comfortable")}
                        />
                        <span>Thoải mái</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="density"
                          value="compact"
                          checked={pdfConfig.layout.density === "compact"}
                          onChange={() => updateLayout("density", "compact")}
                        />
                        <span>Gọn</span>
                      </label>
                    </div>
                  </div>
                </div>
              </details>

              {/* 5. Theme / Colors */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <Palette size={15} />
                  <span>5. Màu sắc tài liệu</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <div className="pdf-theme-presets-grid">
                    <button
                      type="button"
                      className={`pdf-theme-card ${pdfConfig.theme === "clinical-blue" ? "active" : ""}`}
                      onClick={() => setPdfConfig((prev) => ({ ...prev, theme: "clinical-blue" }))}
                    >
                      <div className="pdf-theme-swatch" style={{ background: "#0284c7" }} />
                      <span>Xanh y tế</span>
                    </button>
                    <button
                      type="button"
                      className={`pdf-theme-card ${pdfConfig.theme === "medical-teal" ? "active" : ""}`}
                      onClick={() => setPdfConfig((prev) => ({ ...prev, theme: "medical-teal" }))}
                    >
                      <div className="pdf-theme-swatch" style={{ background: "#0f766e" }} />
                      <span>Xanh ngọc</span>
                    </button>
                    <button
                      type="button"
                      className={`pdf-theme-card ${pdfConfig.theme === "professional-navy" ? "active" : ""}`}
                      onClick={() => setPdfConfig((prev) => ({ ...prev, theme: "professional-navy" }))}
                    >
                      <div className="pdf-theme-swatch" style={{ background: "#1e293b" }} />
                      <span>Xanh navy</span>
                    </button>
                    <button
                      type="button"
                      className={`pdf-theme-card ${pdfConfig.theme === "minimal-gray" ? "active" : ""}`}
                      onClick={() => setPdfConfig((prev) => ({ ...prev, theme: "minimal-gray" }))}
                    >
                      <div className="pdf-theme-swatch" style={{ background: "#475569" }} />
                      <span>Xám tối giản</span>
                    </button>
                    <button
                      type="button"
                      className={`pdf-theme-card ${pdfConfig.theme === "custom" ? "active" : ""}`}
                      onClick={() => setPdfConfig((prev) => ({ ...prev, theme: "custom" }))}
                    >
                      <div className="pdf-theme-swatch pdf-custom-swatch">🎨</div>
                      <span>Tùy chỉnh</span>
                    </button>
                  </div>

                  {pdfConfig.theme === "custom" && (
                    <div className="pdf-custom-colors-container">
                      <div className="pdf-divider" />
                      <div className="pdf-color-picker-row">
                        <label>Màu chính (Primary):</label>
                        <input
                          type="color"
                          value={pdfConfig.customColors.primary}
                          onChange={(e) =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              customColors: { ...prev.customColors, primary: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="pdf-color-picker-row">
                        <label>Màu phụ (Secondary):</label>
                        <input
                          type="color"
                          value={pdfConfig.customColors.secondary}
                          onChange={(e) =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              customColors: { ...prev.customColors, secondary: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div className="pdf-color-picker-row">
                        <label>Màu nhấn (Accent):</label>
                        <input
                          type="color"
                          value={pdfConfig.customColors.accent}
                          onChange={(e) =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              customColors: { ...prev.customColors, accent: e.target.value },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </details>

              {/* 6. Header & Footer */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <Heading size={15} />
                  <span>6. Đầu trang & Chân trang</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Tên cơ sở y tế:</label>
                    <input
                      type="text"
                      className="pdf-form-input"
                      value={pdfConfig.headerFooter.hospitalName}
                      onChange={(e) => updateHeaderFooter("hospitalName", e.target.value)}
                    />
                  </div>
                  <div className="pdf-form-group">
                    <label className="pdf-form-label">Tiêu đề tài liệu:</label>
                    <input
                      type="text"
                      className="pdf-form-input"
                      value={pdfConfig.headerFooter.docTitle}
                      onChange={(e) => updateHeaderFooter("docTitle", e.target.value)}
                    />
                  </div>
                  <div className="pdf-divider" />
                  <div className="pdf-checkbox-stack">
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showLogo}
                        onChange={(e) => updateHeaderFooter("showLogo", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị Logo</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showHospitalName}
                        onChange={(e) => updateHeaderFooter("showHospitalName", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị tên cơ sở y tế</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showDocTitle}
                        onChange={(e) => updateHeaderFooter("showDocTitle", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị tiêu đề tài liệu</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showDoctorName}
                        onChange={(e) => updateHeaderFooter("showDoctorName", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị bác sĩ phụ trách</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showEncounterDate}
                        onChange={(e) => updateHeaderFooter("showEncounterDate", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị thời gian khám</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showPageNumber}
                        onChange={(e) => updateHeaderFooter("showPageNumber", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị số trang</span>
                    </label>
                    <label className="pdf-custom-checkbox">
                      <input
                        type="checkbox"
                        checked={pdfConfig.headerFooter.showGeneratedByAi}
                        onChange={(e) => updateHeaderFooter("showGeneratedByAi", e.target.checked)}
                      />
                      <span className="pdf-checkmark"></span>
                      <span>Hiển thị ghi chú hỗ trợ từ AI</span>
                    </label>
                  </div>
                </div>
              </details>

              {/* 7. Logo & Branding */}
              <details className="pdf-config-panel" open>
                <summary className="pdf-panel-header">
                  <ImageIcon size={15} />
                  <span>7. Logo & Thương hiệu</span>
                  <ChevronDown size={15} className="chevron" />
                </summary>
                <div className="pdf-panel-content">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="pdf-hidden"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                  <div className="pdf-logo-upload-box">
                    <div className="pdf-logo-preview-badge">
                      {pdfConfig.branding.logoUrl ? (
                        <img
                          src={pdfConfig.branding.logoUrl}
                          alt="Logo preview"
                          style={{ maxHeight: 36, maxWidth: 70, objectFit: "contain" }}
                        />
                      ) : (
                        <div className="pdf-logo-placeholder-box">
                          <strong>VMEC</strong>
                          <small>VinMed</small>
                        </div>
                      )}
                    </div>
                    <div className="pdf-upload-controls">
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-white px-2 text-xs font-semibold text-ink hover:bg-subtle transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={13} /> Tải logo lên
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                        onClick={resetLogo}
                      >
                        Đặt lại
                      </button>
                    </div>
                  </div>

                  <div className="pdf-form-group pdf-mt-3" style={{ marginBottom: 0 }}>
                    <label className="pdf-form-label">Vị trí Logo:</label>
                    <div className="pdf-segmented-control">
                      <label>
                        <input
                          type="radio"
                          name="logoPos"
                          value="left"
                          checked={pdfConfig.branding.logoPosition === "left"}
                          onChange={() =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              branding: { ...prev.branding, logoPosition: "left" },
                            }))
                          }
                        />
                        <span>Trái</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="logoPos"
                          value="center"
                          checked={pdfConfig.branding.logoPosition === "center"}
                          onChange={() =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              branding: { ...prev.branding, logoPosition: "center" },
                            }))
                          }
                        />
                        <span>Giữa</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="logoPos"
                          value="right"
                          checked={pdfConfig.branding.logoPosition === "right"}
                          onChange={() =>
                            setPdfConfig((prev) => ({
                              ...prev,
                              branding: { ...prev.branding, logoPosition: "right" },
                            }))
                          }
                        />
                        <span>Phải</span>
                      </label>
                    </div>
                  </div>
                </div>
              </details>

            </div>

            {/* Tier 3: Fixed Footer */}
            <div className="pdf-sidebar-footer">
              <button
                type="button"
                className="flex w-full h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink shadow-xs hover:bg-subtle transition-colors"
                onClick={resetToDefault}
              >
                <RotateCcw size={14} /> Đặt lại mặc định
              </button>
            </div>
          </aside>

          {/* RIGHT PREVIEW CANVAS AREA */}
          <main className="pdf-preview-area">
            {/* Sticky Toolbar */}
            <div className="pdf-preview-toolbar">
              <div className="pdf-toolbar-left">
                <span className="pdf-preview-title">
                  <Eye size={15} /> Bản xem trước PDF
                </span>
                <span className="pdf-page-counter-badge">Trang 1 / {pageCount}</span>
              </div>

              <div className="pdf-toolbar-center">
                <div className="pdf-zoom-controls">
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink hover:bg-white transition-colors"
                    title="Thu nhỏ"
                    onClick={() => adjustZoom(-10)}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="pdf-zoom-text">{Math.round(zoomScale * 100)}%</span>
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded text-muted hover:text-ink hover:bg-white transition-colors"
                    title="Phóng to"
                    onClick={() => adjustZoom(10)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    type="button"
                    className="h-6 px-1.5 text-xs text-muted hover:text-ink hover:bg-white rounded transition-colors"
                    onClick={resetZoom}
                  >
                    Vừa chiều rộng
                  </button>
                </div>
              </div>
            </div>

            {/* Paper Stage */}
            <div className="pdf-paper-stage">
              <div
                id="pdfPaperSheet"
                ref={paperRef}
                className={`pdf-paper-sheet theme-${pdfConfig.theme} ${pdfConfig.layout.orientation} size-${pdfConfig.layout.pageSize.toLowerCase()} margin-${pdfConfig.layout.margins} density-${pdfConfig.layout.density}`}
                style={{
                  transform: `scale(${zoomScale})`,
                  ...(pdfConfig.theme === "custom"
                    ? ({
                        "--pdf-primary": pdfConfig.customColors.primary,
                        "--pdf-secondary": pdfConfig.customColors.secondary,
                        "--pdf-accent": pdfConfig.customColors.accent,
                        "--pdf-accent-light": `${pdfConfig.customColors.primary}15`,
                      } as React.CSSProperties)
                    : {}),
                }}
              >
                {/* Sheet Header */}
                <header className={`pdf-sheet-header logo-pos-${pdfConfig.branding.logoPosition}`}>
                  <div className="pdf-branding-block">
                    {pdfConfig.headerFooter.showLogo && (
                      <div className="pdf-logo-box">
                        {pdfConfig.branding.logoUrl ? (
                          <img
                            src={pdfConfig.branding.logoUrl}
                            alt="Logo"
                            style={{ maxHeight: 44, maxWidth: 140, objectFit: "contain" }}
                          />
                        ) : (
                          <div className="pdf-logo-default">
                            <span className="logo-symbol">VMEC</span>
                            <span className="logo-subtext">VinMed Center</span>
                          </div>
                        )}
                      </div>
                    )}
                    {pdfConfig.headerFooter.showHospitalName && (
                      <div className="pdf-hospital-info">
                        <h2>{pdfConfig.headerFooter.hospitalName}</h2>
                      </div>
                    )}
                  </div>

                  <div className="pdf-doc-meta">
                    {pdfConfig.headerFooter.showDocTitle && <h1>{pdfConfig.headerFooter.docTitle}</h1>}
                    <div className="meta-line">
                      {pdfConfig.headerFooter.showEncounterDate && (
                        <span>Thời gian: {encounterDate}</span>
                      )}
                      {pdfConfig.headerFooter.showDoctorName && (
                        <span>Bác sĩ: {doctorName}</span>
                      )}
                    </div>
                  </div>
                </header>

                <div className="pdf-divider-line" />

                {/* Patient & Encounter Info Section */}
                {hasAnyPatientInfo && (
                  <section className="pdf-patient-encounter-section">
                    <div className="pdf-section-title">
                      <User size={15} /> THÔNG TIN BỆNH NHÂN & LẦN KHÁM
                    </div>
                    <div className="pdf-info-grid">
                      {pdfConfig.patientInfo.patientName && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Họ và tên:</span>
                          <span className="val highlight">{patient.name}</span>
                        </div>
                      )}
                      {pdfConfig.patientInfo.dob && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Ngày sinh:</span>
                          <span className="val">{patient.dob || "—"}</span>
                        </div>
                      )}
                      {pdfConfig.patientInfo.age && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Tuổi:</span>
                          <span className="val">{patient.age > 0 ? `${patient.age} tuổi` : "—"}</span>
                        </div>
                      )}
                      {pdfConfig.patientInfo.gender && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Giới tính:</span>
                          <span className="val">{patient.gender || "—"}</span>
                        </div>
                      )}
                      {pdfConfig.patientInfo.dateTime && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Thời gian khám:</span>
                          <span className="val">{encounterDate}</span>
                        </div>
                      )}
                      {pdfConfig.patientInfo.doctor && (
                        <div className="pdf-info-cell">
                          <span className="lbl">Bác sĩ:</span>
                          <span className="val">{doctorName}</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* SOAP Content Body */}
                <div className="pdf-soap-body">
                  {/* 1. Subjective */}
                  {pdfConfig.sections.subjective && (
                    <section className="pdf-section">
                      <div className="pdf-section-title">1. CHỦ QUAN (SUBJECTIVE)</div>
                      {subjectiveItems.length > 0 ? (
                        <ul className="pdf-list" style={{ listStyleType: "disc" }}>
                          {subjectiveItems.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pdf-paragraph">{soapSubjective || "—"}</p>
                      )}
                    </section>
                  )}

                  {/* 2. Objective */}
                  {pdfConfig.sections.objective && (
                    <section className="pdf-section">
                      <div className="pdf-section-title">2. KHÁCH QUAN (OBJECTIVE)</div>
                      {objectiveItems.length > 0 ? (
                        <ul className="pdf-list" style={{ listStyleType: "disc" }}>
                          {objectiveItems.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pdf-paragraph">{soapObjective || "—"}</p>
                      )}
                    </section>
                  )}

                  {/* 3. Assessment */}
                  {pdfConfig.sections.assessment && (
                    <section className="pdf-section">
                      <div className="pdf-section-title">3. ĐÁNH GIÁ (ASSESSMENT)</div>
                      {assessmentItems.length > 0 ? (
                        <ul className="pdf-list" style={{ listStyleType: "disc" }}>
                          {assessmentItems.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pdf-paragraph">{soapAssessment || "—"}</p>
                      )}
                    </section>
                  )}

                  {/* 4. Plan */}
                  {pdfConfig.sections.plan && (
                    <section className="pdf-section">
                      <div className="pdf-section-title">4. KẾ HOẠCH (PLAN)</div>
                      {planItems.length > 0 ? (
                        <ul className="pdf-list" style={{ listStyleType: "disc" }}>
                          {planItems.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="pdf-paragraph">{soapPlan || "—"}</p>
                      )}
                    </section>
                  )}

                  {/* Confirmed ICD-10 */}
                  {icdVisible && (
                    <section className="pdf-section">
                      <div className="pdf-section-title">ICD-10 ĐÃ XÁC NHẬN</div>
                      <div className="pdf-icd-container">
                        <div className="pdf-icd-single-card">
                          <div className="pdf-icd-info-group">
                            {pdfConfig.icd.showCode && (
                              <span className="pdf-icd-code-val">{icdInfo.code}</span>
                            )}
                            {pdfConfig.icd.showDiagnosis && (
                              <span className="pdf-icd-diag-val">{icdInfo.diagnosis}</span>
                            )}
                          </div>
                          {pdfConfig.icd.showStatusTag && (
                            <span className="pdf-icd-status-tag">
                              <Check size={13} /> Đã xác nhận
                            </span>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                </div>

                {/* AI Disclaimer */}
                {pdfConfig.headerFooter.showGeneratedByAi && (
                  <div className="pdf-ai-disclaimer">
                    <Info size={14} />
                    <span>Tài liệu được hỗ trợ tạo bởi AI và đã được bác sĩ rà soát, xác nhận.</span>
                  </div>
                )}

                {/* Signature Area */}
                <div className="pdf-signature-area">
                  <div className="pdf-sig-column">
                    <span className="pdf-sig-label">Bác sĩ khám bệnh</span>
                    <div className="pdf-sig-line" />
                    <span className="pdf-sig-name">{doctorName}</span>
                    <span className="pdf-sig-title">{pdfConfig.headerFooter.hospitalName}</span>
                  </div>
                </div>

                {/* Sheet Footer */}
                <footer className="pdf-sheet-footer">
                  <div className="footer-left">
                    <span>{pdfConfig.headerFooter.hospitalName}</span>
                    <span className="pdf-dot">•</span>
                    <span>Hồ sơ y tế bảo mật</span>
                  </div>
                  <div className="footer-right">
                    <span>Thời gian tạo PDF: {encounterDate}</span>
                    {pdfConfig.headerFooter.showPageNumber && (
                      <>
                        <span className="pdf-dot">•</span>
                        <span>Trang 1 / {pageCount}</span>
                      </>
                    )}
                  </div>
                </footer>

              </div>
            </div>
          </main>
        </div>
      </div>

      {/* EXPORT CONFIRMATION MODAL - Styled with ClinNote buttons */}
      {downloadModalOpen && (
        <div className="pdf-modal-backdrop" onClick={() => setDownloadModalOpen(false)}>
          <div className="pdf-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-header">
              <div className="pdf-modal-icon success">
                <FileDown size={20} />
              </div>
              <div>
                <h3>Xác nhận xuất PDF</h3>
                <p className="pdf-modal-sub">Rà soát lâm sàng hoàn tất</p>
              </div>
            </div>
            <div className="pdf-modal-body">
              <div className="pdf-modal-notice">
                <p>
                  Tài liệu hồ sơ bệnh án cho bệnh nhân <strong>{patient.name}</strong> sẽ được xuất theo mẫu cấu hình đã chọn.
                </p>
              </div>
              <label className="pdf-custom-checkbox pdf-mt-3">
                <input
                  type="checkbox"
                  checked={confirmVerified}
                  onChange={(e) => setConfirmVerified(e.target.checked)}
                />
                <span className="pdf-checkmark"></span>
                <span><strong>Tôi xác nhận xuất tài liệu này.</strong></span>
              </label>
            </div>
            <div className="pdf-modal-footer">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-subtle transition-colors"
                onClick={() => setDownloadModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/90 disabled:opacity-50 transition-colors"
                disabled={!confirmVerified || isExporting}
                onClick={executeDownload}
              >
                <Download size={14} /> {isExporting ? "Đang tạo PDF..." : "Xác nhận & Tải PDF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE PRESET MODAL - Styled with ClinNote buttons */}
      {savePresetModalOpen && (
        <div className="pdf-modal-backdrop" onClick={() => setSavePresetModalOpen(false)}>
          <div className="pdf-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-header">
              <div className="pdf-modal-icon info">
                <Bookmark size={20} />
              </div>
              <div>
                <h3>Lưu mẫu cấu hình PDF</h3>
                <p className="pdf-modal-sub">Lưu tùy chọn trình bày vào hệ thống</p>
              </div>
            </div>
            <div className="pdf-modal-body">
              <div className="pdf-form-group">
                <label className="pdf-form-label">Tên mẫu cấu hình:</label>
                <input
                  type="text"
                  className="pdf-form-input"
                  placeholder="Ví dụ: Mẫu báo cáo Tiêu chuẩn"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="pdf-modal-footer">
              <button
                type="button"
                className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-subtle transition-colors"
                onClick={() => setSavePresetModalOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-ink bg-ink px-3 text-xs font-semibold text-white hover:bg-ink/90 transition-colors"
                onClick={saveCustomPreset}
              >
                <Save size={14} /> Lưu mẫu cấu hình
              </button>
            </div>
          </div>
        </div>
      )}
    </ClinicShell>
  );
}

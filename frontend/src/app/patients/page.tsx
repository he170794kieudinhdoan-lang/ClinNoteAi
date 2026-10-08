"use client";

import {
  Activity,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileAudio,
  FileText,
  History,
  Info,
  MicOff,
  Radio,
  Search,
  Sparkles,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ClinicShell from "@/components/ClinicShell";
import { useEncounterList } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { Encounter, EncounterStatus, Patient } from "@/types";

interface PatientRecord {
  patientKey: string;
  patient: Patient;
  latestEncounter: Encounter;
  encounters: Encounter[];
  totalVisits: number;
}

const STATUS_CONFIG: Record<
  EncounterStatus,
  {
    label: string;
    badgeCls: string;
    icon: typeof Clock;
  }
> = {
  empty: {
    label: "Chờ thu âm",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200",
    icon: MicOff,
  },
  recording: {
    label: "Đang ghi âm",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200",
    icon: Radio,
  },
  uploaded: {
    label: "Đã có âm thanh",
    badgeCls: "bg-sky-50 text-sky-700 border-sky-200",
    icon: FileAudio,
  },
  soap: {
    label: "Bản nháp SOAP",
    badgeCls: "bg-purple-50 text-purple-700 border-purple-200",
    icon: Sparkles,
  },
  final: {
    label: "Đã duyệt bệnh án",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
  },
};

const FILTER_TABS: { id: "all" | EncounterStatus; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "empty", label: "Chờ thu âm" },
  { id: "uploaded", label: "Đã có âm thanh" },
  { id: "soap", label: "Bản nháp SOAP" },
  { id: "final", label: "Đã duyệt" },
];

function groupPatients(encounters: Encounter[]): PatientRecord[] {
  const map = new Map<string, Encounter[]>();

  for (const item of encounters) {
    const key = item.patient.code?.trim() || item.patient.id || item.id;
    const existing = map.get(key) || [];
    existing.push(item);
    map.set(key, existing);
  }

  const result: PatientRecord[] = [];
  for (const [key, list] of map.entries()) {
    // Sắp xếp các lượt khám từ mới nhất đến cũ nhất
    const sorted = [...list].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    const latest = sorted[0];
    result.push({
      patientKey: key,
      patient: latest.patient,
      latestEncounter: latest,
      encounters: sorted,
      totalVisits: sorted.length,
    });
  }

  // Sắp xếp danh sách bệnh nhân theo lượt khám gần nhất
  return result.sort((a, b) => {
    const timeA = new Date(a.latestEncounter.createdAt).getTime() || 0;
    const timeB = new Date(b.latestEncounter.createdAt).getTime() || 0;
    return timeB - timeA;
  });
}

function formatVisitDateTime(isoString: string): { date: string; time: string; isToday: boolean } {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) {
    return { date: isoString.slice(0, 10) || "—", time: "", isToday: false };
  }

  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const date = isToday ? "Hôm nay" : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

  return { date, time, isToday };
}

function formatDob(dob?: string): string {
  if (!dob) return "";
  const parts = dob.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dob;
}

function getInitials(name: string): string {
  if (!name) return "BN";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getGenderStyle(gender?: string) {
  if (gender === "Nam") {
    return {
      avatarBg: "bg-blue-100 text-blue-700 border-blue-200",
      badgeBg: "bg-blue-50 text-blue-700 border-blue-200",
      label: "Nam",
    };
  }
  if (gender === "Nữ") {
    return {
      avatarBg: "bg-rose-100 text-rose-700 border-rose-200",
      badgeBg: "bg-rose-50 text-rose-700 border-rose-200",
      label: "Nữ",
    };
  }
  return {
    avatarBg: "bg-slate-100 text-slate-700 border-slate-200",
    badgeBg: "bg-slate-50 text-slate-600 border-slate-200",
    label: gender || "Chưa rõ",
  };
}

export default function PatientsPage() {
  const authed = useRequireAuth();
  const { encounters } = useEncounterList();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EncounterStatus>("all");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const allPatients = useMemo(() => groupPatients(encounters), [encounters]);

  // Thống kê nhanh trên đầu trang
  const stats = useMemo(() => {
    const now = new Date();
    let todayVisits = 0;
    let pending = 0;
    let soapReady = 0;
    let approved = 0;

    for (const item of encounters) {
      const d = new Date(item.createdAt);
      if (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      ) {
        todayVisits += 1;
      }
      if (item.status === "empty" || item.status === "recording" || item.status === "uploaded") {
        pending += 1;
      } else if (item.status === "soap") {
        soapReady += 1;
      } else if (item.status === "final") {
        approved += 1;
      }
    }

    return {
      totalPatients: allPatients.length,
      todayVisits,
      pending,
      soapReady,
      approved,
    };
  }, [allPatients, encounters]);

  // Lọc theo từ khóa và trạng thái
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allPatients.filter((record) => {
      const matchStatus =
        statusFilter === "all" ? true : record.latestEncounter.status === statusFilter;
      if (!matchStatus) return false;

      if (!needle) return true;

      const p = record.patient;
      const latest = record.latestEncounter;
      const inName = p.name.toLowerCase().includes(needle);
      const inCode = (p.code ?? "").toLowerCase().includes(needle);
      const inReason = (p.reason ?? "").toLowerCase().includes(needle);
      const inAssessment = (latest.soap?.assessment ?? "").toLowerCase().includes(needle);
      const inIcd =
        (latest.selectedIcd ?? "").toLowerCase().includes(needle) ||
        (latest.icdSuggestions?.[0]?.code ?? "").toLowerCase().includes(needle) ||
        (latest.icdSuggestions?.[0]?.title ?? "").toLowerCase().includes(needle);

      return inName || inCode || inReason || inAssessment || inIcd;
    });
  }, [allPatients, query, statusFilter]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopyCode = (code: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedKey(code);
      toast.success(`Đã chép mã bệnh nhân: ${code}`);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  };

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  return (
    <ClinicShell section="patients">
      <section className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto bg-canvas px-3.5 py-4 pb-12 sm:px-6 sm:py-5">
        {/* Header Title + Nút thêm bệnh nhân */}
        <div className="flex shrink-0 flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 items-center rounded-md bg-ink/5 px-2 font-mono text-[11px] font-bold tracking-[0.14em] text-ink">
                HỒ SƠ BỆNH ÁN
              </span>
              <span className="text-xs text-faint">· Cập nhật liên tục từ CSDL</span>
            </div>
            <h1 className="mt-1 text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">Danh sách bệnh nhân</h1>
            <p className="mt-1 text-xs text-muted sm:text-sm">
              Theo dõi toàn diện hồ sơ bệnh nhân, lịch sử các lần khám và tiến độ tạo bệnh án SOAP tự động.
            </p>
          </div>
          <Link
            href="/patients/new"
            className="inline-flex h-9 sm:h-10 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-ink px-4 text-xs sm:text-sm font-semibold text-white shadow-sm transition-colors hover:bg-ink/90 active:scale-[0.99]"
          >
            <UserPlus size={15} />
            <span>Tiếp nhận bệnh nhân mới</span>
          </Link>
        </div>

        {/* Thống kê nhanh (KPI Summary Cards) */}
        <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-panel">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-medium">Tổng bệnh nhân</span>
              <Users size={16} className="text-faint" />
            </div>
            <p className="mt-2 text-2xl font-black text-ink">{stats.totalPatients}</p>
            <span className="text-[11px] text-faint">Đã lưu trong CSDL</span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-panel">
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-medium">Khám hôm nay</span>
              <Calendar size={16} className="text-faint" />
            </div>
            <p className="mt-2 text-2xl font-black text-ink">{stats.todayVisits}</p>
            <span className="text-[11px] text-accent font-medium">Lượt tiếp nhận</span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-panel">
            <div className="flex items-center justify-between text-amber-700">
              <span className="text-xs font-medium">Chờ thu âm / ghi</span>
              <MicOff size={16} className="text-amber-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-amber-900">{stats.pending}</p>
            <span className="text-[11px] text-amber-600">Cần thực hiện</span>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-panel">
            <div className="flex items-center justify-between text-purple-700">
              <span className="text-xs font-medium">Bản nháp SOAP</span>
              <Sparkles size={16} className="text-purple-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-purple-900">{stats.soapReady}</p>
            <span className="text-[11px] text-purple-600">Chờ bác sĩ duyệt</span>
          </div>

          <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex flex-col justify-between rounded-xl border border-line bg-white p-3.5 shadow-panel">
            <div className="flex items-center justify-between text-emerald-700">
              <span className="text-xs font-medium">Đã duyệt hoàn tất</span>
              <CheckCircle2 size={16} className="text-emerald-500" />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-900">{stats.approved}</p>
            <span className="text-[11px] text-emerald-600">Đầy đủ hồ sơ</span>
          </div>
        </div>

        {/* Thanh tìm kiếm & Bộ lọc trạng thái */}
        <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-line bg-white p-3 shadow-panel sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên bệnh nhân, mã số (10 số), lý do khám, chẩn đoán ICD-10..."
              className="h-10 w-full rounded-lg border border-line bg-subtle/50 pl-9 pr-9 text-xs sm:text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-ink focus:bg-white"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {FILTER_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`h-8 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-ink text-white shadow-sm"
                      : "border border-line bg-white text-muted hover:bg-subtle hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hiển thị số lượng kết quả */}
        <div className="flex shrink-0 items-center justify-between px-1 text-xs text-muted">
          <p>
            Hiển thị <span className="font-bold text-ink">{visible.length}</span> / {allPatients.length} bệnh nhân
            {query.trim() && (
              <span>
                {" "}
                (khớp từ khóa <span className="font-semibold text-ink">"{query.trim()}"</span>)
              </span>
            )}
          </p>
          <span className="hidden sm:inline text-faint">
            Nhấn vào hàng hoặc nút "Vào khám" để mở biên bản lâm sàng
          </span>
          <span className="sm:hidden text-[11px] text-faint">
            ↔ Vuốt ngang xem bảng
          </span>
        </div>

        {/* Bảng hồ sơ bệnh nhân chính */}
        <article className="w-full shrink-0 overflow-hidden rounded-xl border border-line bg-white shadow-panel">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left border-collapse">
              {/* Header các cột rõ ràng, đầy đủ ý nghĩa lâm sàng */}
              <thead>
                <tr className="border-b border-line bg-subtle/60 text-[11px] font-bold uppercase tracking-wider text-muted">
                  <th scope="col" className="w-[30%] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-faint" />
                      <span>Bệnh nhân & Mã hồ sơ</span>
                    </div>
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-faint" />
                      <span>Thông tin nhân khẩu</span>
                    </div>
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className="text-faint" />
                      <span>Lần khám gần nhất</span>
                    </div>
                  </th>
                  <th scope="col" className="w-[20%] px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Activity size={13} className="text-faint" />
                      <span>Lý do khám / Chẩn đoán</span>
                    </div>
                  </th>
                  <th scope="col" className="w-[14%] px-4 py-3 text-right">
                    <span>Thao tác</span>
                  </th>
                </tr>
              </thead>

              {/* Danh sách các dòng bệnh nhân */}
              <tbody className="divide-y divide-line-soft text-sm">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-faint">
                          <Users size={24} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-ink">
                          {query || statusFilter !== "all"
                            ? "Không tìm thấy bệnh nhân phù hợp"
                            : "Chưa có bệnh nhân nào trong danh sách"}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {query || statusFilter !== "all"
                            ? "Vui lòng thử tìm kiếm bằng từ khóa khác hoặc điều chỉnh lại bộ lọc trạng thái."
                            : "Bắt đầu bằng cách thêm bệnh nhân mới để ghi âm và tạo bệnh án SOAP tự động."}
                        </p>
                        {query && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuery("");
                              setStatusFilter("all");
                            }}
                            className="mt-4 inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink hover:bg-subtle"
                          >
                            Xóa bộ lọc tìm kiếm
                          </button>
                        )}
                        {!query && statusFilter === "all" && (
                          <Link
                            href="/patients/new"
                            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-semibold text-white hover:bg-ink/90"
                          >
                            <UserPlus size={14} /> Thêm bệnh nhân mới
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {visible.map((record) => {
                  const { patient, latestEncounter, encounters: history, totalVisits, patientKey } = record;
                  const isExpanded = Boolean(expandedKeys[patientKey]);
                  const genderStyle = getGenderStyle(patient.gender);
                  const visitDate = formatVisitDateTime(latestEncounter.createdAt);
                  const statusInfo = STATUS_CONFIG[latestEncounter.status];
                  const StatusIcon = statusInfo.icon;

                  // Trích xuất lý do hoặc chẩn đoán nếu có
                  const chiefReason = patient.reason?.trim();
                  const clinicalAssessment = latestEncounter.soap?.assessment?.trim();
                  const selectedIcd = latestEncounter.selectedIcd;
                  const suggestedIcd = latestEncounter.icdSuggestions?.[0];

                  return (
                    <tr
                      key={patientKey}
                      className="group transition-colors hover:bg-subtle/50"
                    >
                      <td colSpan={5} className="p-0">
                        <div className="flex flex-col">
                          {/* Hàng chính */}
                          <div className="grid grid-cols-[30%_18%_18%_20%_14%] items-center px-4 py-3.5">
                            {/* Cột 1: Tên, Avatar & Mã BN */}
                            <div className="flex items-center gap-3 pr-2">
                              <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${genderStyle.avatarBg}`}
                              >
                                {getInitials(patient.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <Link
                                  href={`/encounters/${latestEncounter.id}`}
                                  className="block truncate font-bold text-ink transition-colors hover:text-accent hover:underline"
                                >
                                  {patient.name}
                                </Link>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  {patient.code ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted"
                                      title="Click để sao chép mã"
                                    >
                                      {patient.code}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopyCode(patient.code || "");
                                        }}
                                        className="text-faint hover:text-ink"
                                        aria-label="Sao chép mã"
                                      >
                                        {copiedKey === patient.code ? (
                                          <Check size={11} className="text-ok" />
                                        ) : (
                                          <Copy size={11} />
                                        )}
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-faint italic">Chưa cấp mã</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Cột 2: Thông tin nhân khẩu */}
                            <div className="flex flex-col pr-2 text-xs">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${genderStyle.badgeBg}`}
                                >
                                  {genderStyle.label}
                                </span>
                                {patient.age > 0 && (
                                  <span className="font-semibold text-ink">
                                    {patient.age} tuổi
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-[11px] text-muted">
                                {patient.dob ? (
                                  <span>NS: {formatDob(patient.dob)}</span>
                                ) : (
                                  <span className="text-faint">Chưa lưu ngày sinh</span>
                                )}
                              </div>
                            </div>

                            {/* Cột 3: Lần khám gần nhất */}
                            <div className="flex flex-col pr-2 text-xs">
                              <div className="flex items-center gap-1 font-semibold text-ink">
                                <Clock size={12} className="text-faint" />
                                <span>{visitDate.date}</span>
                                {visitDate.time && (
                                  <span className="text-muted">· {visitDate.time}</span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">
                                  <History size={11} />
                                  <span>{totalVisits} lượt khám</span>
                                </span>
                                {totalVisits > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(patientKey)}
                                    className="text-[11px] text-accent underline hover:text-accent/80"
                                  >
                                    {isExpanded ? "Thu gọn" : "Lịch sử"}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Cột 4: Lý do khám / Chẩn đoán */}
                            <div className="flex flex-col pr-2 text-xs">
                              {chiefReason ? (
                                <p className="line-clamp-1 font-medium text-ink" title={chiefReason}>
                                  {chiefReason}
                                </p>
                              ) : clinicalAssessment ? (
                                <p className="line-clamp-1 text-muted" title={clinicalAssessment}>
                                  <span className="font-semibold text-ink">CĐ:</span> {clinicalAssessment}
                                </p>
                              ) : (
                                <span className="flex items-center gap-1 text-faint italic">
                                  <Info size={12} />
                                  Chưa ghi nhận lý do
                                </span>
                              )}

                              {/* Mã ICD nếu có */}
                              {(selectedIcd || suggestedIcd) && (
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-emerald-800 border border-emerald-200">
                                    ICD-10: {selectedIcd || suggestedIcd?.code}
                                  </span>
                                  {suggestedIcd?.title && (
                                    <span className="truncate text-[10.5px] text-muted max-w-[120px]" title={suggestedIcd.title}>
                                      {suggestedIcd.title}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Cột 5: Trạng thái & Thao tác */}
                            <div className="flex flex-col items-end gap-1.5 pl-2">
                              {/* Trạng thái ca khám */}
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusInfo.badgeCls}`}
                              >
                                <StatusIcon size={12} />
                                <span>{statusInfo.label}</span>
                              </span>

                              {/* Nút vào khám */}
                              <Link
                                href={`/encounters/${latestEncounter.id}`}
                                className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-ink/90"
                              >
                                <span>{latestEncounter.status === "final" ? "Xem bệnh án" : "Vào khám"}</span>
                                <ArrowRight size={12} />
                              </Link>
                            </div>
                          </div>

                          {/* Accordion hiển thị lịch sử khám nếu mở rộng */}
                          {isExpanded && history.length > 1 && (
                            <div className="border-t border-line-soft bg-subtle/30 px-6 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <History size={14} className="text-muted" />
                                <span className="text-xs font-bold text-ink uppercase tracking-wider">
                                  Lịch sử các lần khám trước ({history.length} lượt)
                                </span>
                              </div>
                              <div className="divide-y divide-line-soft rounded-lg border border-line bg-white">
                                {history.map((enc, idx) => {
                                  const encDate = formatVisitDateTime(enc.createdAt);
                                  const encStatus = STATUS_CONFIG[enc.status];
                                  const EncIcon = encStatus.icon;
                                  const encReason = enc.patient.reason || enc.soap?.assessment || "Chưa ghi nhận lý do";

                                  return (
                                    <div
                                      key={enc.id}
                                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono font-bold text-faint">#{history.length - idx}</span>
                                        <span className="font-semibold text-ink">
                                          {encDate.date} {encDate.time && `· ${encDate.time}`}
                                        </span>
                                        <span className="text-muted truncate max-w-xs">— {encReason}</span>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${encStatus.badgeCls}`}
                                        >
                                          <EncIcon size={10} />
                                          <span>{encStatus.label}</span>
                                        </span>
                                        <Link
                                          href={`/encounters/${enc.id}`}
                                          className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
                                        >
                                          Mở ca này <ArrowRight size={10} />
                                        </Link>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </ClinicShell>
  );
}

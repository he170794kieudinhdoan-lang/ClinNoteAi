"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { useEncounterList } from "@/hooks/useEncounter";
import type { EncounterStatus } from "@/types";

export type DeskFilter = "all" | EncounterStatus;

export default function DashboardBody({
  encounters,
}: {
  encounters: ReturnType<typeof useEncounterList>["encounters"];
  filter?: DeskFilter;
  setFilter?: (id: DeskFilter) => void;
}) {
  const counts = useMemo(() => {
    const tally = { empty: 0, recording: 0, uploaded: 0, soap: 0, final: 0 };
    for (const item of encounters) tally[item.status] += 1;
    return tally;
  }, [encounters]);

  const bars = useMemo(
    () => [
      { name: "Chờ ghi âm", value: counts.empty },
      { name: "Đang xử lý", value: counts.recording + counts.uploaded },
      { name: "Ghi chú SOAP", value: counts.soap },
      { name: "Đã duyệt", value: counts.final },
    ],
    [counts],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-canvas px-3.5 py-4 sm:px-6 sm:py-5 pb-12">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-faint">HÔM NAY</p>
          <h1 className="mt-0.5 text-xl sm:text-2xl font-extrabold tracking-tight">Lượt khám</h1>
        </div>
        <Link
          href="/patients"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink shadow-xs transition-colors hover:bg-subtle"
        >
          Mở danh sách bệnh nhân →
        </Link>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat label="Tổng lượt khám" value={encounters.length} />
        <Stat label="Chờ ghi âm" value={counts.empty} />
        <Stat label="Ghi chú SOAP" value={counts.soap} />
        <Stat label="Đã duyệt hoàn tất" value={counts.final} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3.5 lg:grid-cols-[1.6fr_1fr]">
        <article className="flex min-h-0 flex-col justify-between rounded-xl sm:rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-panel">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-ink">Phân bổ ca khám theo trạng thái</h2>
                <p className="text-[11px] sm:text-xs text-muted mt-0.5">Tiến độ xử lý bệnh án và ghi âm trong ca trực</p>
              </div>
              <span className="rounded-full bg-subtle border border-line px-2.5 py-1 text-[11px] font-semibold text-ink">
                Tổng {encounters.length} lượt
              </span>
            </div>

            {/* Vùng biểu đồ có trục hoành (baseline) nối đất rõ ràng và lưới ngang tham chiếu */}
            <div className="mt-4 h-60 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 20, right: 12, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#475569", fontWeight: 500 }}
                    axisLine={{ stroke: "#cbd5e1", strokeWidth: 1.5 }}
                    tickLine={{ stroke: "#cbd5e1" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0, 0, 0, 0.04)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs text-white shadow-md">
                            <span className="font-semibold">{payload[0].payload.name}: </span>
                            <span>{payload[0].value} ca</span>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="value"
                    name="Lượt"
                    fill="#1e293b"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={52}
                    isAnimationActive={true}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Dải tổng hợp số liệu ở đáy thẻ để giao diện vững chãi, không bị khoảng trắng lơ lửng */}
          <div className="mt-4 pt-3.5 border-t border-line-soft grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-subtle/60 p-2 text-center">
              <span className="block text-[11px] text-faint">Chờ ghi âm</span>
              <span className="text-sm font-bold text-ink">{counts.empty}</span>
            </div>
            <div className="rounded-lg bg-subtle/60 p-2 text-center">
              <span className="block text-[11px] text-faint">Đang xử lý</span>
              <span className="text-sm font-bold text-ink">{counts.recording + counts.uploaded}</span>
            </div>
            <div className="rounded-lg bg-subtle/60 p-2 text-center">
              <span className="block text-[11px] text-faint">Ghi chú SOAP</span>
              <span className="text-sm font-bold text-ink">{counts.soap}</span>
            </div>
            <div className="rounded-lg bg-subtle/60 p-2 text-center">
              <span className="block text-[11px] text-faint">Đã duyệt</span>
              <span className="text-sm font-bold text-ink">{counts.final}</span>
            </div>
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-xl sm:rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-panel gap-4">
          <div>
            <p className="text-[10.5px] sm:text-[11px] font-bold tracking-[0.14em] text-faint">BẮT ĐẦU</p>
            <h2 className="mt-1 text-sm sm:text-base font-bold text-ink">Tiếp nhận bệnh nhân</h2>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted">
              Nhập mã định danh y tế hoặc hồ sơ bệnh nhân mới để bắt đầu buổi khám, ghi âm và tạo bệnh án SOAP tự động.
            </p>

            <div className="mt-4 rounded-xl border border-line-soft bg-subtle/40 p-3 space-y-2 text-xs text-muted">
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">1</span>
                <span>Tiếp nhận hoặc tìm kiếm hồ sơ bệnh nhân</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">2</span>
                <span>Ghi âm trực tiếp hoặc tải tệp hội thoại</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-white">3</span>
                <span>ClinNote AI tự động trích xuất bệnh án SOAP</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/patients/new"
              className="inline-flex h-10 sm:h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-xs sm:text-sm font-semibold text-white shadow-xs transition-colors hover:bg-ink/90 active:scale-[0.99]"
            >
              Thêm bệnh nhân mới
            </Link>
            <Link
              href="/patients"
              className="inline-flex h-9 sm:h-10 w-full items-center justify-center rounded-xl border border-line bg-white px-4 text-xs sm:text-sm font-medium text-ink transition-colors hover:bg-subtle"
            >
              Quản lý danh sách bệnh nhân
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl sm:rounded-2xl border border-line bg-white p-3 sm:px-4 sm:py-3.5 shadow-panel">
      <p className="text-[11px] sm:text-xs font-medium text-faint">{label}</p>
      <p className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl lg:text-4xl leading-none font-black tracking-tight text-ink">{value}</p>
    </article>
  );
}

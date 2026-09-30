"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { useEncounterList } from "@/hooks/useEncounter";
import type { EncounterStatus } from "@/types";

const STATUS_LABEL: Record<EncounterStatus, string> = {
  empty: "Chờ ghi âm",
  recording: "Đang ghi",
  uploaded: "Đã tải",
  soap: "Ghi chú",
  final: "Đã duyệt",
};

const FILTERS: { id: "all" | EncounterStatus; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "empty", label: "Chờ ghi âm" },
  { id: "soap", label: "Ghi chú" },
  { id: "final", label: "Đã duyệt" },
];

export type DeskFilter = (typeof FILTERS)[number]["id"];

export default function DashboardBody({
  encounters,
  filter,
  setFilter,
}: {
  encounters: ReturnType<typeof useEncounterList>["encounters"];
  filter: DeskFilter;
  setFilter: (id: DeskFilter) => void;
}) {
  const counts = useMemo(() => {
    const tally = { empty: 0, recording: 0, uploaded: 0, soap: 0, final: 0 };
    for (const item of encounters) tally[item.status] += 1;
    return tally;
  }, [encounters]);

  const visible = filter === "all" ? encounters : encounters.filter((item) => item.status === filter);
  const bars = useMemo(
    () => [
      { name: "Chờ", value: counts.empty },
      { name: "Đang ghi", value: counts.recording + counts.uploaded },
      { name: "Ghi chú", value: counts.soap },
      { name: "Duyệt", value: counts.final },
    ],
    [counts],
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-auto bg-canvas px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-faint">HÔM NAY</p>
          <h1 className="text-2xl font-extrabold tracking-tight">Lượt khám</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`h-8 rounded-lg px-3 text-xs transition-colors ${
                filter === item.id ? "bg-ink font-semibold text-white" : "border border-line bg-white text-muted hover:bg-subtle"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tổng" value={encounters.length} />
        <Stat label="Chờ ghi âm" value={counts.empty} />
        <Stat label="Ghi chú" value={counts.soap} />
        <Stat label="Đã duyệt" value={counts.final} />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.6fr_1fr]">
        <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-panel">
          <h2 className="text-sm font-bold">Theo trạng thái</h2>
          <div className="mt-2 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9aa1a8" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9aa1a8" }} axisLine={false} tickLine={false} />
                <Bar dataKey="value" name="Lượt" fill="#1c1f23" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <ul className="mt-3 min-h-0 flex-1 divide-y divide-line-soft overflow-auto border-t border-line-soft">
            {visible.length === 0 && <li className="py-4 text-sm text-muted">Chưa có lượt khám.</li>}
            {visible.map((item) => (
              <li key={item.id}>
                <Link href={`/encounters/${item.id}`} className="flex items-center justify-between gap-3 rounded-lg py-3 text-sm transition-colors hover:bg-subtle">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.patient.name}</span>
                    <span className="block truncate text-xs text-faint">
                      {item.patient.code || item.patient.reason || item.createdAt.slice(0, 10)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-line bg-white px-2.5 py-0.5 text-[11px] text-muted">
                    {STATUS_LABEL[item.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </article>

        <article className="flex h-full min-h-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-panel">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-faint">BẮT ĐẦU</p>
          <h2 className="mt-1 text-sm font-bold">Thêm bệnh nhân</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Nhập mã định danh y tế, rồi mở lượt khám để ghi âm và xuất ghi chú.
          </p>
          <Link
            href="/patients/new"
            className="mt-auto inline-flex h-11 items-center justify-center rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            Thêm bệnh nhân
          </Link>
        </article>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-line bg-white px-4 py-3 shadow-panel">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="mt-2 text-4xl leading-none font-extrabold tracking-tight">{value}</p>
    </article>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import ClinicShell from "@/components/ClinicShell";
import { useEncounterList } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
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

export default function DashboardPage() {
  const authed = useRequireAuth();
  const { encounters } = useEncounterList();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const counts = useMemo(() => {
    const tally = { empty: 0, recording: 0, uploaded: 0, soap: 0, final: 0 };
    for (const item of encounters) tally[item.status] += 1;
    return tally;
  }, [encounters]);

  const visible = filter === "all" ? encounters : encounters.filter((item) => item.status === filter);
  const bars = [
    ["Chờ", counts.empty],
    ["Đang ghi", counts.recording + counts.uploaded],
    ["Ghi chú", counts.soap],
    ["Duyệt", counts.final],
  ] as const;
  const peak = Math.max(1, ...bars.map(([, n]) => n));

  if (!authed) return <main className="nb-classic min-h-dvh bg-[#efe6d8]" />;

  return (
    <ClinicShell section="home" title="Trang chủ" plain>
      <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden px-5 pt-1 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9a8674]">HÔM NAY</p>
              <h1 className="font-serif text-2xl font-bold tracking-tight">Lượt khám</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`h-8 rounded-lg px-3 text-xs transition-colors ${
                    filter === item.id
                      ? "bg-[#e7d8c0] font-semibold text-[#3e342c]"
                      : "border border-[#eadfce] bg-white text-[#5c4e42] hover:bg-[#f6f0e6]"
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
            <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#efe4d4] bg-[#fffdf9] p-4 shadow-sm">
              <h2 className="text-sm font-bold">Theo trạng thái</h2>
              <div className="mt-4 flex h-28 items-end gap-6 px-2">
                {bars.map(([label, n]) => (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex h-24 w-full items-end justify-center">
                      <div
                        className={`w-full max-w-16 rounded-t-md ${n === peak && n > 0 ? "bg-[#dcc7a6]" : "bg-[#eadcc4]"}`}
                        style={{ height: `${Math.max(n === 0 ? 6 : 12, (n / peak) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-[#9a8674]">{label}</span>
                  </div>
                ))}
              </div>

              <ul className="mt-3 min-h-0 flex-1 divide-y divide-[#f3eadf] overflow-auto border-t border-[#f3eadf]">
                {visible.length === 0 && <li className="py-4 text-sm text-[#866e5a]">Chưa có lượt khám.</li>}
                {visible.map((item) => (
                  <li key={item.id}>
                    <Link href={`/encounters/${item.id}`} className="flex items-center justify-between gap-3 rounded-lg py-3 text-sm transition-colors hover:bg-[#faf6f0]">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{item.patient.name}</span>
                        <span className="block truncate text-xs text-[#9a8674]">
                          {item.patient.code || item.patient.reason || item.createdAt.slice(0, 10)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full border border-[#eadfce] bg-white px-2.5 py-0.5 text-[11px] text-[#5c4e42]">
                        {STATUS_LABEL[item.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>

            <article className="flex h-full min-h-0 flex-col rounded-2xl border border-[#efe4d4] bg-[#fffdf9] p-5 shadow-sm">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9a8674]">BẮT ĐẦU</p>
              <h2 className="mt-1 text-sm font-bold">Thêm bệnh nhân</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#6d5c4e]">
                Nhập mã định danh y tế, rồi mở lượt khám để ghi âm và xuất ghi chú.
              </p>
              <Link
                href="/patients/new"
                className="mt-auto inline-flex h-12 items-center justify-center rounded-lg bg-[#ead9c2] px-4 text-sm font-semibold transition-colors hover:bg-[#e3d0b4]"
              >
                Thêm bệnh nhân
              </Link>
            </article>
          </div>
      </section>
    </ClinicShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-2xl border border-[#efe4d4] bg-[#fffdf9] px-4 py-3 shadow-sm">
      <p className="text-[11px] text-[#9a8674]">{label}</p>
      <p className="mt-2 font-serif text-4xl leading-none font-bold">{value}</p>
    </article>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useEncounterList } from "@/hooks/useEncounter";
import { getSupabase } from "@/lib/supabase";
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
  const router = useRouter();
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

  async function logout() {
    await getSupabase()?.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="plain-canvas nb-classic flex min-h-screen flex-col text-[#3e342c]">
      <header className="flex items-center justify-between border-b border-[#c9bba8] bg-[#efe6d8] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center border border-[#c9bba8] bg-[#e4d5bc] shadow-[2px_2px_0_#e4d8c8]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 3v5a4 4 0 0 0 8 0V3" />
              <path d="M8.5 12v3a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-3" />
              <circle cx="17.5" cy="11.5" r="1.5" />
              <path d="M12.5 19v2" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">ClinNote</p>
            <p className="text-[11px] text-[#866e5a]">Trang chủ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 items-center border border-[#c9bba8] bg-[#e4d5bc] px-2.5 text-[11px] font-medium shadow-[2px_2px_0_#e4d8c8]">
            VI
          </span>
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-8 items-center border border-[#c9bba8] bg-[#fffdf8] px-3 text-xs font-medium shadow-[2px_2px_0_#e4d8c8] transition-colors hover:bg-[#e4d5bc]"
          >
            Đăng xuất
          </button>
          <Link href="/login" aria-label="Tài khoản" className="block h-8 w-8 overflow-hidden rounded-full border border-[#c9bba8] bg-[#fffdf8]">
            <img src="/default-avatar.jpg" alt="" className="h-full w-full object-cover" />
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[200px_1fr]">
        <aside className="flex flex-col gap-1 border-[#c9bba8] bg-[#f3ece1] p-3 md:border-r">
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#866e5a]">LÀM VIỆC</p>
          <Link href="/" className="border border-[#c9bba8] bg-[#fffdf8] px-3 py-2 text-sm font-semibold transition-colors hover:bg-[#e4d5bc]">
            Trang chủ
          </Link>
          <Link href="/patients/new" className="px-3 py-2 text-sm text-[#5c4e42] transition-colors hover:bg-[#fffdf8]">
            Thêm bệnh nhân
          </Link>
        </aside>

        <section className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#866e5a]">HÔM NAY</p>
              <h1 className="font-serif text-xl font-bold">Lượt khám</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`h-8 border px-3 text-xs transition-colors ${
                    filter === item.id
                      ? "border-[#c9bba8] bg-[#e4d5bc] font-semibold shadow-[2px_2px_0_#e4d8c8]"
                      : "border-[#c9bba8] bg-[#fffdf8] hover:bg-[#efe6d8]"
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

          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <article className="flex min-h-72 flex-col border border-[#c9bba8] bg-[#fffdf8] p-4">
              <h2 className="text-sm font-bold">Theo trạng thái</h2>
              <div className="mt-4 flex h-28 items-end gap-3">
                {bars.map(([label, n]) => (
                  <div key={label} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-24 w-full items-end">
                      <div
                        className="w-full border border-[#c9bba8] border-b-0 bg-[#e4d5bc]"
                        style={{ height: `${Math.max(8, (n / peak) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-[#866e5a]">{label}</span>
                  </div>
                ))}
              </div>

              <ul className="mt-4 divide-y divide-[#efe6d8] border-t border-[#efe6d8]">
                {visible.length === 0 && <li className="py-4 text-sm text-[#866e5a]">Chưa có lượt khám.</li>}
                {visible.map((item) => (
                  <li key={item.id}>
                    <Link href={`/encounters/${item.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:bg-[#f3ece1]">
                      <span className="min-w-0">
                        <span className="block break-words font-semibold">{item.patient.name}</span>
                        <span className="font-mono text-xs text-[#866e5a]">{item.patient.code || item.createdAt.slice(0, 10)}</span>
                      </span>
                      <span className="shrink-0 border border-[#c9bba8] bg-[#efe6d8] px-1.5 text-[10px] font-semibold">
                        {STATUS_LABEL[item.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </article>

            <article className="flex flex-col border border-[#c9bba8] bg-[#fffdf8] p-4">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#866e5a]">BẮT ĐẦU</p>
              <h2 className="mt-1 text-sm font-bold">Thêm bệnh nhân</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5c4e42]">
                Nhập mã định danh y tế, rồi mở lượt khám để ghi âm và xuất ghi chú.
              </p>
              <Link
                href="/patients/new"
                className="mt-auto inline-flex h-10 items-center justify-center border border-[#c9bba8] bg-[#e4d5bc] px-4 text-sm font-semibold shadow-[2px_2px_0_#c9bba8] transition-colors hover:bg-[#efe6d8]"
              >
                Thêm bệnh nhân
              </Link>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="border border-[#c9bba8] bg-[#fffdf8] px-3 py-3">
      <p className="text-[11px] text-[#866e5a]">{label}</p>
      <p className="mt-1 font-serif text-3xl leading-none font-bold">{value}</p>
    </article>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import AccountMenu from "@/components/AccountMenu";
import { useEncounterList } from "@/hooks/useEncounter";
import { getSupabase } from "@/lib/supabase";
import type { EncounterStatus } from "@/types";

const NAV = [
  { href: "/", label: "Trang chủ", id: "home" },
  { href: "/patients", label: "Quản lý bệnh nhân", id: "patients" },
  { href: "/patients/new", label: "Thêm bệnh nhân", id: "new" },
] as const;

const STATUS_LABEL: Record<EncounterStatus, string> = {
  empty: "Chờ ghi âm",
  recording: "Đang ghi",
  uploaded: "Đã tải",
  soap: "Ghi chú",
  final: "Đã duyệt",
};

export default function ClinicShell({
  section,
  title,
  plain,
  children,
}: {
  section: (typeof NAV)[number]["id"];
  title: string;
  plain?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const { encounters } = useEncounterList();
  const recent = encounters.slice(0, 5);

  async function logout() {
    await getSupabase()?.auth.signOut();
    router.push("/login");
  }

  const chip = plain
    ? "inline-flex h-8 items-center rounded-lg border border-[#eadfce] bg-white px-3 text-xs text-[#5c4e42] shadow-sm"
    : "inline-flex h-8 items-center border border-[#c9bba8] bg-[#fffdf8] px-3 text-xs font-medium shadow-[2px_2px_0_#e4d8c8]";

  return (
    <main
      className={`${
        plain
          ? "plain-canvas fixed inset-x-[5vw] inset-y-[5vh] rounded-[22px] bg-[#f6f0e6] shadow-[0_16px_40px_rgba(62,52,44,0.08)] "
          : "h-dvh w-full "
      }nb-classic flex flex-col overflow-hidden text-[#3e342c]`}
    >
      <header className={`flex items-center justify-between px-4 py-3 sm:px-5 ${plain ? "" : "border-b border-[#c9bba8] bg-[#efe6d8]"}`}>
        <div className="flex items-center gap-3">
          <div className={`grid h-9 w-9 place-items-center bg-[#efe3d0] ${plain ? "rounded-xl" : "border border-[#c9bba8] shadow-[2px_2px_0_#e4d8c8]"}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4.5 3v5a4 4 0 0 0 8 0V3" />
              <path d="M8.5 12v3a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-3" />
              <circle cx="17.5" cy="11.5" r="1.5" />
              <path d="M12.5 19v2" />
            </svg>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold">ClinNote</p>
            <p className="text-[11px] text-[#866e5a]">{title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={logout} className={`${chip} transition-colors hover:bg-[#f6f0e6]`}>
            Đăng xuất
          </button>
          <AccountMenu />
        </div>
      </header>

      <div className="grid min-h-0 w-full flex-1 overflow-hidden md:grid-cols-[220px_1fr]">
        <aside className={`flex min-h-0 flex-col p-3 ${plain ? "md:border-r md:border-[#eadfce]" : "border-[#c9bba8] bg-[#f3ece1] md:border-r"}`}>
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#866e5a]">LÀM VIỆC</p>
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`px-3 py-2 text-sm transition-colors ${
                  section === item.id
                    ? plain
                      ? "rounded-lg bg-white font-semibold shadow-sm"
                      : "border border-[#c9bba8] bg-[#fffdf8] font-semibold"
                    : "text-[#5c4e42] hover:bg-white/70"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-5 flex min-h-0 flex-1 flex-col">
            <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-[#866e5a]">GẦN ĐÂY</p>
            <ul className="min-h-0 flex-1 overflow-auto">
              {recent.length === 0 && <li className="px-3 py-2 text-sm text-[#866e5a]">Chưa có lượt khám.</li>}
              {recent.map((item) => (
                <li key={item.id}>
                  <Link href={`/encounters/${item.id}`} className={`block px-3 py-2 transition-colors ${plain ? "rounded-lg hover:bg-white/70" : "hover:bg-[#fffdf8]"}`}>
                    <span className="block truncate text-sm font-semibold">{item.patient.name}</span>
                    <span className="block truncate text-xs text-[#866e5a]">{STATUS_LABEL[item.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
        {children}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, FileText, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { useEncounterList } from "@/hooks/useEncounter";
import { getSupabase } from "@/lib/supabase";
import type { EncounterStatus } from "@/types";

const NAV = [
  { href: "/", label: "Ghi chú lâm sàng", id: "home" },
  { href: "/patients", label: "Bệnh nhân", id: "patients" },
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
  children,
}: {
  section: (typeof NAV)[number]["id"] | "encounter";
  children: ReactNode;
}) {
  const router = useRouter();
  const { encounters } = useEncounterList();
  const recent = encounters.slice(0, 6);
  const [collapsed, setCollapsed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? "");
      const fullName = user?.user_metadata?.full_name;
      setName(typeof fullName === "string" && fullName.trim() ? fullName : "Bác sĩ");
    });
  }, []);

  async function logout() {
    await getSupabase()?.auth.signOut();
    router.push("/login");
  }

  const initials = (name || "BS")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toLocaleUpperCase("vi-VN");

  return (
    <main className="flex h-dvh w-full overflow-hidden bg-canvas text-ink">
      <aside
        className={`flex min-h-0 shrink-0 flex-col justify-between border-r border-line bg-white transition-[width] duration-200 ${
          collapsed ? "w-[72px] px-2 py-4" : "w-[230px] px-3 py-4"
        }`}
      >
        <div className="min-h-0">
          <div className={`mb-5 flex items-center gap-2.5 overflow-hidden ${collapsed ? "justify-center" : "px-1.5"}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink text-sm font-extrabold text-white">
              C
            </div>
            {!collapsed && (
              <div className="min-w-0 leading-tight">
                <p className="text-[15px] font-extrabold tracking-tight">ClinNote</p>
                <p className="truncate text-[11px] font-medium text-muted">AI Clinical Note</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <p className="px-2 pb-1 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Làm việc</p>
          )}
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg text-[13px] font-semibold transition-colors",
                  collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2",
                  section === item.id ? "bg-subtle text-ink" : "text-muted hover:bg-subtle hover:text-ink",
                )}
              >
                <NavIcon id={item.id} />
                <span className={collapsed ? "sr-only" : ""}>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-5">
            {!collapsed && (
              <p className="px-2 pb-1 text-[10px] font-bold tracking-[0.14em] text-faint uppercase">Gần đây</p>
            )}
            <ul>
              {recent.length === 0 && !collapsed && (
                <li className="px-2.5 py-2 text-[13px] text-muted">Chưa có phiên.</li>
              )}
              {recent.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/encounters/${item.id}`}
                    title={item.patient.name}
                    className={`block rounded-lg transition-colors hover:bg-subtle ${
                      collapsed ? "px-0 py-2 text-center text-[11px] font-bold text-muted" : "px-2.5 py-2"
                    }`}
                  >
                    {collapsed ? (
                      <span>{item.patient.name.trim().charAt(0) || "?"}</span>
                    ) : (
                      <>
                        <span className="block truncate text-[13px] font-semibold">{item.patient.name}</span>
                        <span className="block truncate text-[11px] text-muted">{STATUS_LABEL[item.status]}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-muted hover:bg-subtle hover:text-ink"
          >
            {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Thu gọn</>}
          </button>
          <div className={`flex items-center gap-2.5 rounded-xl ${collapsed ? "justify-center p-1" : "bg-subtle p-2"}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-ink ring-1 ring-line">
              {initials || "BS"}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold">{name}</span>
                <button type="button" onClick={logout} className="truncate text-[11px] text-muted hover:text-ink">
                  {email ? "Đăng xuất" : "Đăng nhập"}
                </button>
              </span>
            )}
          </div>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </main>
  );
}

function NavIcon({ id }: { id: (typeof NAV)[number]["id"] }) {
  const icon = { size: 16, strokeWidth: 1.8, "aria-hidden": true } as const;
  if (id === "patients") return <Users {...icon} />;
  if (id === "new") return <UserPlus {...icon} />;
  return <FileText {...icon} />;
}

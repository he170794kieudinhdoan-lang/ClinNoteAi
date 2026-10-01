"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { BookOpen, ChevronsLeft, ChevronsRight, Clock, FileText, Library, Settings, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSupabase } from "@/lib/supabase";

const NAV = [
  { href: "/", label: "Ghi chú", id: "home" },
  { label: "Phiên khám", id: "sessions", count: "12" },
  { href: "/patients", label: "Bệnh nhân", id: "patients", count: "128" },
  { label: "Mẫu", id: "templates" },
  { label: "Tài liệu", id: "knowledge" },
  { href: "/settings", label: "Cài đặt", id: "settings" },
] as const;

export default function ClinicShell({
  section,
  children,
}: {
  section: "home" | "patients" | "new" | "encounter" | "settings";
  children: ReactNode;
}) {
  const router = useRouter();
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
        className={`flex min-h-0 shrink-0 flex-col justify-between border-r border-line bg-white ${
          collapsed ? "w-[72px] px-2 py-4" : "w-[256px] px-3 py-4"
        }`}
      >
        <div className="min-h-0">
          <div className={`mb-5 overflow-hidden ${collapsed ? "flex justify-center" : "px-1.5"}`}>
            <Link href="/" aria-label="Về trang chủ" className={collapsed ? "" : "block w-full"}>
              <img
                src={collapsed ? "/logo-mark.png" : "/logo.png"}
                alt="ClinNote"
                className={collapsed ? "h-9 w-9 object-contain" : "h-10 w-full object-contain object-left"}
              />
            </Link>
          </div>

          {!collapsed && (
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.16em] text-[#8aa394] uppercase">Làm việc</p>
          )}
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = item.id === "home"
                ? section === "home" || section === "new" || section === "encounter"
                : item.id === section;
              const className = cn(
                "flex w-full items-center gap-2.5 rounded-xl text-[13.5px] font-semibold",
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
                active ? "bg-[#e7f6ee] text-[#1f7a4d]" : "text-[#7c8b86] hover:bg-[#f3f7f5]",
              );
              const body = (
                <>
                  <NavIcon id={item.id} />
                  <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>{item.label}</span>
                  {!collapsed && "count" in item && item.count && (
                    <span className="rounded-full bg-[#dff6ea] px-2 py-0.5 text-[11px] font-semibold text-[#3c9a68]">{item.count}</span>
                  )}
                </>
              );
              if ("href" in item && item.href) {
                return (
                  <Link key={item.id} href={item.href} title={item.label} aria-current={active ? "page" : undefined} className={className}>
                    {body}
                  </Link>
                );
              }
              return (
                <button key={item.id} type="button" title={item.label} className={className}>
                  {body}
                </button>
              );
            })}
          </nav>
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
  const icon = { size: 18, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (id === "sessions") return <Clock {...icon} />;
  if (id === "patients") return <Users {...icon} />;
  if (id === "templates") return <BookOpen {...icon} />;
  if (id === "knowledge") return <Library {...icon} />;
  if (id === "settings") return <Settings {...icon} />;
  return <FileText {...icon} />;
}

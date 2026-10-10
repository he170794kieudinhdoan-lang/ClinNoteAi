"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { BookOpen, ChevronsLeft, ChevronsRight, Clock, FileText, Library, Menu, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { getSupabase } from "@/lib/supabase";

const NAV = [
  { href: "/desk", label: "Ghi chú", id: "home" },
  { label: "Phiên khám", id: "sessions" },
  { href: "/patients", label: "Bệnh nhân", id: "patients" },
  { label: "Mẫu", id: "templates" },
  { href: "/soap-note-guides-and-example", label: "Tài liệu & Mẫu", id: "knowledge" },
  { href: "/settings", label: "Cài đặt", id: "settings" },
] as const;

export default function ClinicShell({
  section,
  defaultCollapsed = false,
  children,
}: {
  section: "home" | "patients" | "new" | "encounter" | "settings";
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (defaultCollapsed) {
      setCollapsed(true);
    }
  }, [defaultCollapsed]);

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

  const renderSidebarContent = (isMobile = false) => (
    <>
      <div className="min-h-0">
        <div className={`mb-5 overflow-hidden flex items-center justify-between ${collapsed && !isMobile ? "justify-center" : "px-1.5"}`}>
          <Link href="/" aria-label="Về trang chủ" className={collapsed && !isMobile ? "" : "block"}>
            <img
              src={collapsed && !isMobile ? "/logo-mark.png" : "/logo.png"}
              alt="ClinNote"
              className={collapsed && !isMobile ? "h-9 w-9 object-contain" : "h-9 max-w-[180px] object-contain object-left"}
            />
          </Link>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Đóng menu"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-subtle"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {(!collapsed || isMobile) && (
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.16em] text-[#8aa394] uppercase">Làm việc</p>
        )}
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.id === "home"
              ? section === "home" || section === "new" || section === "encounter"
              : item.id === section;
            const className = cn(
              "flex w-full items-center gap-2.5 rounded-xl text-[13.5px] font-semibold transition-colors",
              collapsed && !isMobile ? "justify-center px-0 py-2.5" : "px-3 py-2.5",
              active ? "bg-[#e7f6ee] text-[#1f7a4d]" : "text-[#7c8b86] hover:bg-[#f3f7f5]",
            );
            const body = (
              <>
                <NavIcon id={item.id} />
                <span className={collapsed && !isMobile ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>{item.label}</span>
              </>
            );
            if ("href" in item && item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={className}
                  onClick={() => { if (isMobile) setMobileOpen(false); }}
                >
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
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-muted hover:bg-subtle hover:text-ink"
          >
            {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Thu gọn</>}
          </button>
        )}
        <div className={`flex items-center gap-2.5 rounded-xl ${collapsed && !isMobile ? "justify-center p-1" : "bg-subtle p-2"}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[11px] font-bold text-ink ring-1 ring-line">
            {initials || "BS"}
          </span>
          {(!collapsed || isMobile) && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{name}</span>
              <button type="button" onClick={logout} className="truncate text-[11px] text-muted hover:text-ink">
                {email ? "Đăng xuất" : "Đăng nhập"}
              </button>
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <main className="flex h-dvh w-full overflow-hidden bg-canvas text-ink">
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col justify-between border-r border-line bg-white p-4 transition-transform duration-200 ease-out lg:hidden",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full pointer-events-none"
        )}
      >
        {renderSidebarContent(true)}
      </aside>

      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex min-h-0 shrink-0 flex-col justify-between border-r border-line bg-white transition-all duration-200",
          collapsed ? "w-[72px] px-2 py-4" : "w-[256px] px-3 py-4"
        )}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Top Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-white px-3.5 lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
              className="grid h-8 w-8 place-items-center rounded-lg border border-line text-neutral-700 hover:bg-subtle active:scale-95"
            >
              <Menu size={16} />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo-mark.png" alt="ClinNote" className="h-6 w-6 object-contain" />
              <span className="font-serif text-[14px] font-bold text-neutral-900 leading-none">ClinNote AI</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e7f6ee] text-[11px] font-bold text-[#1f7a4d] ring-1 ring-emerald-200">
              {initials || "BS"}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
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

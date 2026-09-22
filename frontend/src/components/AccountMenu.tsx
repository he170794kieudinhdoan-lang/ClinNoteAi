"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function AccountMenu() {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, right: 0 });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setEmail(user?.email ?? "");
      const fullName = user?.user_metadata?.full_name;
      setName(typeof fullName === "string" ? fullName : "");
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function toggle() {
    const rect = root.current?.getBoundingClientRect();
    if (rect) setPlace({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
    setOpen((value) => !value);
  }

  async function logout() {
    await getSupabase()?.auth.signOut();
    router.push("/login");
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Tài khoản"
        aria-expanded={open}
        onClick={toggle}
        className="block h-8 w-8 overflow-hidden rounded-full border border-[#eadfce] bg-white"
      >
        <img src="/default-avatar.jpg" alt="" className="h-full w-full object-cover" />
      </button>
      {open && (
        <div
          className="fixed z-50 w-64 rounded-2xl border border-[#efe4d4] bg-[#fffdf9] p-4 text-[#3e342c] shadow-[0_16px_40px_rgba(62,52,44,0.12)]"
          style={{ top: place.top, right: place.right }}
        >
          <div className="flex items-center gap-3">
            <img src="/default-avatar.jpg" alt="" className="h-12 w-12 rounded-full border border-[#eadfce] object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name || "Bác sĩ"}</p>
              <p className="truncate text-xs text-[#866e5a]">{email || "Chưa đăng nhập"}</p>
            </div>
          </div>
          {email ? (
            <button
              type="button"
              onClick={logout}
              className="mt-4 h-9 w-full rounded-lg border border-[#eadfce] bg-white text-sm font-semibold hover:bg-[#f6f0e6]"
            >
              Đăng xuất
            </button>
          ) : (
            <Link
              href="/login"
              className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#ead9c2] text-sm font-semibold hover:bg-[#e3d0b4]"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

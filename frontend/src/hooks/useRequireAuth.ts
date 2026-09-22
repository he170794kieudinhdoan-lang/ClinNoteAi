"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

/** Chưa có phiên thì về /login. Session nằm trên trình duyệt, không đọc được từ middleware. */
let signedIn = false;

export function useRequireAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(signedIn);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      router.replace("/login");
      return;
    }
    let alive = true;
    let settled = false;
    let redirectTimer = 0;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (session) {
        settled = true;
        signedIn = true;
        window.clearTimeout(redirectTimer);
        setReady(true);
        return;
      }
      // Bỏ qua nhịp session=null lúc client chưa đọc xong phiên — nhịp đó đang đẩy về login rồi mới vào trang chủ.
      if (event !== "INITIAL_SESSION" && event !== "SIGNED_OUT") return;
      if (event === "INITIAL_SESSION" || settled) {
        settled = true;
        signedIn = false;
        setReady(false);
        window.clearTimeout(redirectTimer);
        redirectTimer = window.setTimeout(() => {
          if (alive) router.replace("/login");
        }, 0);
      }
    });
    return () => {
      alive = false;
      window.clearTimeout(redirectTimer);
      data.subscription.unsubscribe();
    };
  }, [router]);

  return ready;
}

import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

/** Ghi auth user vào public.users, id trùng auth.users.id để làm doctor_id. */
export async function syncAuthUser(user: User): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return "Chưa cấu hình Supabase.";

  const meta = user.user_metadata ?? {};
  const fromMeta = [meta.full_name, meta.name].find((value) => typeof value === "string" && value.trim());
  const fullName =
    (typeof fromMeta === "string" ? fromMeta.trim() : "") || user.email?.split("@")[0] || "Bác sĩ";
  const email = user.email?.trim();
  if (!email) return "Tài khoản không có email.";

  const { error } = await supabase.from("users").upsert(
    { id: user.id, full_name: fullName.slice(0, 255), email, role: "DOCTOR" },
    { onConflict: "id" },
  );
  return error ? error.message : null;
}

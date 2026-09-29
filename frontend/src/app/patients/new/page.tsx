"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import ClinicShell from "@/components/ClinicShell";
import { saveEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { createPatient } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import type { Encounter, Gender } from "@/types";

type PatientForm = {
  code: string;
  name: string;
  day: string;
  month: string;
  year: string;
  gender: Gender | "";
  dob: string;
};

const GENDERS: Gender[] = ["Nam", "Nữ", "Khác"];

function ageFromParts(day: string, month: string, year: string) {
  if (!day && !month && !year) return null;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || year.length !== 4) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  const now = new Date();
  let age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() < m - 1 || (now.getMonth() === m - 1 && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

export default function AddPatientPage() {
  const authed = useRequireAuth();
  const router = useRouter();
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const [apiError, setApiError] = useState("");
  const {
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    register,
    formState: { errors, isSubmitting },
  } = useForm<PatientForm>({
    defaultValues: { code: "", name: "", day: "", month: "", year: "", gender: "", dob: "" },
  });
  const code = watch("code");
  const name = watch("name");
  const day = watch("day");
  const month = watch("month");
  const year = watch("year");
  const gender = watch("gender");

  const age = ageFromParts(day, month, year);

  function writePart(
    field: "day" | "month" | "year",
    raw: string,
    max: number,
    current: string,
    next?: HTMLInputElement | null,
  ) {
    const value = raw.replace(/\D/g, "").slice(0, max);
    setValue(field, value);
    if (errors.dob) clearErrors("dob");
    if (current.length < max && value.length === max) next?.focus();
  }

  async function onSubmit(values: PatientForm) {
    setApiError("");
    const nextAge = ageFromParts(values.day, values.month, values.year);
    let invalid = false;
    if (!/^\d{10}$/.test(values.code.trim())) {
      setError("code", { type: "validate", message: "Nhập đúng 10 chữ số." });
      invalid = true;
    }
    if (values.name.trim().length < 2) {
      setError("name", { type: "validate", message: "Nhập họ tên." });
      invalid = true;
    } else if (values.name.trim().length > 30) {
      setError("name", { type: "validate", message: "Họ tên tối đa 30 ký tự." });
      invalid = true;
    }
    if ((values.day || values.month || values.year) && nextAge === null) {
      setError("dob", { type: "validate", message: "Ngày sinh chưa hợp lệ." });
      invalid = true;
    }
    if (invalid) return;

    try {
      // 1. Get logged in doctor_id from Supabase auth session
      const supabase = getSupabase();
      if (!supabase) {
        throw new Error("Supabase client chưa được khởi tạo.");
      }
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const doctorId = sessionData.session?.user?.id;
      if (sessionErr || !doctorId) {
        throw new Error("Chưa đăng nhập bác sĩ hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.");
      }

      // 2. Map gender to sex
      const sexMap: Record<string, string> = {
        Nam: "MALE",
        Nữ: "FEMALE",
        Khác: "OTHER",
      };
      const dob = nextAge === null ? undefined : `${values.year}-${values.month.padStart(2, "0")}-${values.day.padStart(2, "0")}`;

      // 3. POST /api/v1/patients -> get REAL patient_id from DB
      const patientRes = await createPatient({
        patient_code: values.code.trim(),
        full_name: values.name.trim(),
        date_of_birth: dob ?? null,
        sex: values.gender ? sexMap[values.gender] || values.gender : null,
      });

      const realPatientId = patientRes.id;

      // 4. Save encounter with real patientId and doctorId
      const encounter: Encounter = {
        id: crypto.randomUUID(), // FE route ID
        patientId: realPatientId, // REAL patients.id from DB
        doctorId: doctorId,       // Supabase auth user.id
        patient: {
          id: realPatientId,
          name: values.name.trim(),
          age: nextAge ?? 0,
          gender: values.gender || undefined,
          reason: "",
          code: values.code.trim(),
          dob,
        },
        status: "empty",
        createdAt: new Date().toISOString(),
        transcript: [],
        soap: { subjective: "", objective: "", assessment: "", plan: "" },
        icdSuggestions: [],
        missingFields: ["Audio / transcript"],
      };

      saveEncounter(encounter);
      toast.success("Đã tạo bệnh nhân");
      router.push(`/encounters/${encounter.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tạo bệnh nhân thất bại.";
      setApiError(message);
      toast.error(message);
    }
  }

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  return (
    <ClinicShell section="new">
      <section className="flex h-full items-center justify-center overflow-auto bg-canvas p-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="flex max-h-full w-[min(780px,100%)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-panel"
      >
        <input type="hidden" {...register("dob")} />
        <header className="flex items-center justify-between px-5 py-4">
          <h1 className="font-serif text-xl font-bold">Thêm bệnh nhân</h1>
          <Link
            href="/"
            aria-label="Đóng"
            className="grid h-8 w-8 place-items-center rounded-sm border border-line bg-white text-sm shadow-sm transition-colors hover:bg-subtle"
          >
            ✕
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[1fr_260px] md:items-stretch">
          <div className="grid grid-cols-1 content-start gap-x-4 gap-y-4 p-5 sm:grid-cols-2 md:border-r md:border-line">
            <Field label="Mã định danh y tế" required error={errors.code?.message} count={`${code.length}/10`}>
              <div className="flex h-10 items-center rounded-sm border border-line bg-white px-2.5">
                <input
                  value={code}
                  maxLength={10}
                  inputMode="numeric"
                  placeholder="10 chữ số BHXH"
                  onChange={(event) => {
                    setValue("code", event.target.value.replace(/\D/g, "").slice(0, 10));
                    if (errors.code) clearErrors("code");
                  }}
                  aria-label="Mã định danh y tế"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm tracking-wide outline-none placeholder:text-faint placeholder:font-sans placeholder:tracking-normal"
                />
              </div>
            </Field>
            <Field label="Họ và tên" required error={errors.name?.message} count={`${name.length}/30`}>
              <input
                value={name}
                onChange={(event) => {
                  setValue("name", event.target.value.slice(0, 30));
                  if (errors.name) clearErrors("name");
                }}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                maxLength={30}
                className={inputClass}
              />
            </Field>

            <Field label="Ngày sinh" error={errors.dob?.message}>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  ref={dayRef}
                  value={day}
                  onChange={(event) => writePart("day", event.target.value, 2, day, monthRef.current)}
                  placeholder="dd"
                  inputMode="numeric"
                  aria-label="Ngày"
                  className={`${inputClass} text-center`}
                />
                <input
                  ref={monthRef}
                  value={month}
                  onChange={(event) => writePart("month", event.target.value, 2, month, yearRef.current)}
                  placeholder="mm"
                  inputMode="numeric"
                  aria-label="Tháng"
                  className={`${inputClass} text-center`}
                />
                <input
                  ref={yearRef}
                  value={year}
                  onChange={(event) => writePart("year", event.target.value, 4, year)}
                  placeholder="yyyy"
                  inputMode="numeric"
                  aria-label="Năm"
                  className={`${inputClass} text-center`}
                />
              </div>
            </Field>
            <Field label="Tuổi">
              <div className="flex h-10 items-center gap-1.5 rounded-sm border border-line bg-white px-2.5 text-xs text-muted">
                <b className="text-sm text-ink">{age === null ? "--" : age}</b>
                tuổi
              </div>
            </Field>

            <Field label="Giới tính" className="sm:col-span-2">
              <div className="flex h-10 overflow-hidden rounded-sm border border-line bg-white">
                {GENDERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setValue("gender", item)}
                    className={`flex-1 border-r border-line text-xs transition-colors last:border-r-0 ${
                      gender === item ? "bg-subtle font-semibold text-ink" : "text-muted hover:bg-subtle"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <aside className="flex flex-col p-5">
            <div className="flex flex-1 flex-col rounded-sm border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <img
                  src="/default-avatar.jpg"
                  alt=""
                  className="h-14 w-12 shrink-0 rounded-sm border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{name.trim() || "—"}</p>
                    <span className="shrink-0 rounded-sm border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">MỚI</span>
                  </div>
                  <p className="mt-1 font-mono text-xs tracking-wide text-muted">{code || "··········"}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-muted">
                <dt>Tuổi</dt>
                <dd className="text-ink">{age === null ? "—" : age}</dd>
                <dt>Giới tính</dt>
                <dd className="text-ink">{gender || "—"}</dd>
              </dl>
            </div>
          </aside>
        </div>

        {apiError && (
          <div className="px-5 py-2 text-sm font-medium text-rose-700 bg-rose-50 border-t border-rose-200">
            ❌ {apiError}
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Step n="1" active>
              Đăng ký
            </Step>
            <span className="text-xs text-muted">→</span>
            <Step n="2">Khám</Step>
            <span className="text-xs text-muted">→</span>
            <Step n="3">Xuất ghi chú</Step>
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => router.push("/")} className="h-9 rounded-sm border border-line bg-white px-4 text-sm shadow-sm transition-colors hover:bg-subtle">
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {isSubmitting ? "Đang tạo..." : "Đăng ký và tiếp tục →"}
            </button>
          </div>
        </footer>
      </form>
      </section>
    </ClinicShell>
  );
}

const inputClass =
  "h-10 w-full rounded-sm border border-line bg-white px-2.5 text-sm text-ink outline-none placeholder:text-faint";

function Field({
  label,
  required,
  error,
  count,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  count?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span>
          {label}
          {required && <span className="text-[#8a5a32]"> *</span>}
        </span>
        {count && <span className="text-muted">{count}</span>}
      </span>
      {children}
      {error && <span className="text-sm text-rose-700">{error}</span>}
    </div>
  );
}

function Step({ n, active, children }: { n: string; active?: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 rounded-sm px-2.5 py-1.5 text-xs ${
        active ? "border border-line bg-subtle font-semibold" : "border border-line text-muted"
      }`}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">{n}</span>
      {children}
    </div>
  );
}

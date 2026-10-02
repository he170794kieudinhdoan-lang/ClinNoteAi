"use client";

import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useState } from "react";
import { DayPicker } from "react-day-picker";
import { vi } from "react-day-picker/locale";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import "react-day-picker/style.css";
import { firstVisitGuideKey } from "@/components/FirstVisitGuide";
import { saveEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { createConsultation, createPatient } from "@/lib/api";
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

function dateFromParts(day: string, month: string, year: string) {
  if (!day || !month || year.length !== 4) return undefined;
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return undefined;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return undefined;
  return date;
}

function ageFromParts(day: string, month: string, year: string) {
  const date = dateFromParts(day, month, year);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday = now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}

export default function AddPatientPage() {
  const authed = useRequireAuth();
  const router = useRouter();
  const [apiError, setApiError] = useState("");
  const [dobOpen, setDobOpen] = useState(false);
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
  const picked = dateFromParts(day, month, year);
  const dobInvalid = Boolean(day || month || year) && age === null;
  const canSubmit = /^\d{10}$/.test(code.trim()) && name.trim().length >= 2 && name.trim().length <= 30 && !dobInvalid;

  function onPickDob(date: Date | undefined) {
    if (!date) {
      setValue("day", "");
      setValue("month", "");
      setValue("year", "");
      setValue("dob", "");
      clearErrors("dob");
      setDobOpen(false);
      return;
    }
    const d = String(date.getDate());
    const m = String(date.getMonth() + 1);
    const y = String(date.getFullYear());
    setValue("day", d);
    setValue("month", m);
    setValue("year", y);
    const next = ageFromParts(d, m, y);
    if (next === null) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const chosen = new Date(date);
      chosen.setHours(0, 0, 0, 0);
      setValue("dob", "");
      setError("dob", {
        type: "validate",
        message: chosen > today ? "Ngày sinh không được ở tương lai." : "Ngày sinh chưa hợp lệ.",
      });
      setDobOpen(false);
      return;
    }
    clearErrors("dob");
    setValue("dob", `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
    setDobOpen(false);
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

      // 4. Create consultation NOW so the encounter is stored in DB per-doctor
      const consultation = await createConsultation({
        patient_id: realPatientId,
        doctor_id: doctorId,
      });

      // 5. Encounter keyed by backend consultation id
      const encounter: Encounter = {
        id: consultation.id, // REAL consultations.id from DB
        patientId: realPatientId,
        doctorId: doctorId,
        consultationId: consultation.id,
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
      sessionStorage.setItem(firstVisitGuideKey(encounter.id), "1");
      toast.success("Đã tạo bệnh nhân");
      router.push(`/encounters/${encounter.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Tạo bệnh nhân thất bại.";
      setApiError(message);
      toast.error(message);
    }
  }

  if (!authed) return null;

  return (
    <>
      <div className="absolute inset-0 z-10 bg-black/45 backdrop-blur-[2px]" aria-hidden />
      <section className="absolute inset-0 z-10 flex items-center justify-center overflow-auto p-6">
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
            <Field
              label="Mã định danh y tế"
              required
              error={errors.code?.message}
              count={`${code.length}/10`}
              hint={<CodeHint />}
            >
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
              <Popover.Root open={dobOpen} onOpenChange={setDobOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Chọn ngày sinh"
                    className={`${inputClass} text-left ${picked ? "text-ink" : "text-faint"} ${errors.dob ? "border-danger" : ""}`}
                  >
                    {picked
                      ? `${String(picked.getDate()).padStart(2, "0")}/${String(picked.getMonth() + 1).padStart(2, "0")}/${picked.getFullYear()}`
                      : "Chọn ngày, tháng, năm"}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    sideOffset={6}
                    align="start"
                    className="z-50 rounded-md border border-line bg-white p-2"
                  >
                    <DayPicker
                      mode="single"
                      locale={vi}
                      captionLayout="dropdown"
                      navLayout="around"
                      startMonth={new Date(new Date().getFullYear() - 140, 0)}
                      endMonth={new Date(new Date().getFullYear(), 11)}
                      defaultMonth={picked ?? new Date(1990, 0)}
                      selected={picked}
                      onSelect={onPickDob}
                      className="dob-cal"
                    />
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </Field>
            <Field label="Tuổi">
              <div
                aria-disabled="true"
                className="flex h-10 cursor-not-allowed items-center gap-1.5 rounded-sm border border-line bg-subtle px-2.5 text-xs text-faint"
              >
                <b className="text-sm font-medium text-muted">{age === null ? "--" : age}</b>
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
                      gender === item ? "bg-ink font-semibold text-white" : "text-muted hover:bg-subtle"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <aside className="flex flex-col bg-subtle p-5">
            <div className="flex flex-1 flex-col rounded-md border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <img src="/logo-mark.png" alt="" className="h-12 w-12 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{name.trim() || "—"}</p>
                    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">Mới</span>
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
          <div className="border-t border-line bg-subtle px-5 py-2 text-sm text-danger">
            {apiError}
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
              disabled={isSubmitting || !canSubmit}
              className="h-9 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? "Đang tạo..." : "Đăng ký và tiếp tục →"}
            </button>
          </div>
        </footer>
      </form>
      </section>
    </>
  );
}

const inputClass =
  "h-10 w-full rounded-sm border border-line bg-white px-2.5 text-sm text-ink outline-none placeholder:text-faint";

function CodeHint() {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button type="button" aria-label="Gợi ý mã định danh" className="text-faint hover:text-ink">
            <CircleHelp size={13} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-[220px] rounded-sm bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-white"
          >
            10 chữ số trên thẻ BHYT hoặc mã số BHXH. Không gồm chữ cái.
            <Tooltip.Arrow className="fill-ink" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function Field({
  label,
  required,
  error,
  count,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  count?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          {label}
          {required && <span className="text-danger"> *</span>}
          {hint}
        </span>
        {count && <span className="text-muted">{count}</span>}
      </span>
      {children}
      {error && <span className="text-sm text-danger">{error}</span>}
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

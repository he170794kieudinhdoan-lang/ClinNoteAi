"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useRef, useState } from "react";
import { saveEncounter } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { Encounter, Gender } from "@/types";

const GENDERS: Gender[] = ["Nam", "Nữ", "Khác"];

function setDobPart(
  raw: string,
  max: number,
  current: string,
  set: (value: string) => void,
  next?: HTMLInputElement | null,
) {
  const value = raw.replace(/\D/g, "").slice(0, max);
  set(value);
  if (current.length < max && value.length === max) next?.focus();
}

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
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const [gender, setGender] = useState<Gender | "">("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const age = ageFromParts(day, month, year);

  function validate() {
    const next: Record<string, string> = {};
    const patientCode = code.trim();
    if (!/^\d{10}$/.test(patientCode)) next.code = "Nhập đúng 10 chữ số.";
    if (name.trim().length < 2) next.name = "Nhập họ tên.";
    else if (name.trim().length > 30) next.name = "Họ tên tối đa 30 ký tự.";
    const startedDob = Boolean(day || month || year);
    if (startedDob && age === null) next.dob = "Ngày sinh chưa hợp lệ.";
    return next;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length || !code) return;

    setBusy(true);
    const dob = age === null ? undefined : `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const encounter: Encounter = {
      id: crypto.randomUUID(),
      patient: {
        name: name.trim(),
        age: age ?? 0,
        gender: gender || undefined,
        reason: "",
        code: code.trim(),
        dob,
      },
      status: "empty",
      createdAt: new Date().toISOString(),
      transcript: [],
      soap: { subjective: "", objective: "", assessment: "", plan: "" },
      icdSuggestions: [],
      missingFields: ["Audio / transcript"],
    };
    // MOCK: chưa có POST /api/v1/encounters — saveEncounter giữ trên tab này tới khi có API.
    saveEncounter(encounter);
    router.push(`/encounters/${encounter.id}`);
  }

  if (!authed) return <main className="nb-classic min-h-dvh bg-[#efe6d8]" />;

  return (
    <main className="nb-classic relative min-h-screen text-[#3e342c]">
      <button
        type="button"
        aria-label="Đóng"
        onClick={() => router.push("/")}
        className="fixed inset-0 z-0 bg-[#3e342c]/15"
      />

      <form
        onSubmit={onSubmit}
        noValidate
        className="pointer-events-auto fixed left-1/2 top-1/2 z-20 flex max-h-[calc(100vh-2rem)] w-[min(780px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-md border border-[#d9cbb8] bg-[#f6f0e6] shadow-[0_16px_40px_rgba(62,52,44,0.12)]"
      >
        <header className="flex items-center justify-between px-5 py-4">
          <h1 className="font-serif text-xl font-bold">Thêm bệnh nhân</h1>
          <Link
            href="/"
            aria-label="Đóng"
            className="grid h-8 w-8 place-items-center rounded-sm border border-[#d9cbb8] bg-white text-sm shadow-sm transition-colors hover:bg-[#f6f0e6]"
          >
            ✕
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 overflow-auto md:grid-cols-[1fr_260px] md:items-stretch">
          <div className="grid grid-cols-1 content-start gap-x-4 gap-y-4 p-5 sm:grid-cols-2 md:border-r md:border-[#d9cbb8]">
            <Field label="Mã định danh y tế" required error={errors.code} count={`${code.length}/10`}>
              <div className="flex h-10 items-center rounded-sm border border-[#d9cbb8] bg-white px-2.5">
                <input
                  value={code}
                  maxLength={10}
                  inputMode="numeric"
                  placeholder="10 chữ số BHXH"
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  aria-label="Mã định danh y tế"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm tracking-wide outline-none placeholder:text-[#b3a394] placeholder:font-sans placeholder:tracking-normal"
                />
              </div>
            </Field>
            <Field label="Họ và tên" required error={errors.name} count={`${name.length}/30`}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, 30))}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                maxLength={30}
                className={inputClass}
              />
            </Field>

            <Field label="Ngày sinh" error={errors.dob}>
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  ref={dayRef}
                  value={day}
                  onChange={(event) => setDobPart(event.target.value, 2, day, setDay, monthRef.current)}
                  placeholder="dd"
                  inputMode="numeric"
                  aria-label="Ngày"
                  className={`${inputClass} text-center`}
                />
                <input
                  ref={monthRef}
                  value={month}
                  onChange={(event) => setDobPart(event.target.value, 2, month, setMonth, yearRef.current)}
                  placeholder="mm"
                  inputMode="numeric"
                  aria-label="Tháng"
                  className={`${inputClass} text-center`}
                />
                <input
                  ref={yearRef}
                  value={year}
                  onChange={(event) => setDobPart(event.target.value, 4, year, setYear)}
                  placeholder="yyyy"
                  inputMode="numeric"
                  aria-label="Năm"
                  className={`${inputClass} text-center`}
                />
              </div>
            </Field>
            <Field label="Tuổi">
              <div className="flex h-10 items-center gap-1.5 rounded-sm border border-[#d9cbb8] bg-[#fffdf9] px-2.5 text-xs text-[#866e5a]">
                <b className="text-sm text-[#3e342c]">{age === null ? "--" : age}</b>
                tuổi
              </div>
            </Field>

            <Field label="Giới tính" className="sm:col-span-2">
              <div className="flex h-10 overflow-hidden rounded-sm border border-[#d9cbb8] bg-white">
                {GENDERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGender(item)}
                    className={`flex-1 border-r border-[#d9cbb8] text-xs transition-colors last:border-r-0 ${
                      gender === item ? "bg-[#e7d8c0] font-semibold text-[#3e342c]" : "text-[#866e5a] hover:bg-[#f6f0e6]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <aside className="flex flex-col p-5">
            <div className="flex flex-1 flex-col rounded-sm border border-[#d9cbb8] bg-[#fffdf9] p-4">
              <div className="flex items-start gap-3">
                <img
                  src="/default-avatar.jpg"
                  alt=""
                  className="h-14 w-12 shrink-0 rounded-sm border border-[#d9cbb8] object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{name.trim() || "—"}</p>
                    <span className="shrink-0 rounded-sm border border-[#d9cbb8] bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">MỚI</span>
                  </div>
                  <p className="mt-1 font-mono text-xs tracking-wide text-[#866e5a]">{code || "··········"}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-[#d9cbb8] pt-3 text-xs text-[#866e5a]">
                <dt>Tuổi</dt>
                <dd className="text-[#3e342c]">{age === null ? "—" : age}</dd>
                <dt>Giới tính</dt>
                <dd className="text-[#3e342c]">{gender || "—"}</dd>
              </dl>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#d9cbb8] px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Step n="1" active>
              Đăng ký
            </Step>
            <span className="text-xs text-[#866e5a]">→</span>
            <Step n="2">Khám</Step>
            <span className="text-xs text-[#866e5a]">→</span>
            <Step n="3">Xuất ghi chú</Step>
          </div>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => router.push("/")} className="h-9 rounded-sm border border-[#d9cbb8] bg-white px-4 text-sm shadow-sm transition-colors hover:bg-[#f6f0e6]">
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-9 rounded-sm bg-[#ead9c2] px-4 text-sm font-semibold transition-colors hover:bg-[#e3d0b4] disabled:opacity-60"
            >
              {busy ? "Đang tạo..." : "Đăng ký và tiếp tục →"}
            </button>
          </div>
        </footer>
      </form>
    </main>
  );
}

const inputClass =
  "h-10 w-full rounded-sm border border-[#d9cbb8] bg-white px-2.5 text-sm text-[#3e342c] outline-none placeholder:text-[#b3a394]";

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
        {count && <span className="text-[#866e5a]">{count}</span>}
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
        active ? "border border-[#d9cbb8] bg-[#e7d8c0] font-semibold" : "border border-[#d9cbb8] text-[#866e5a]"
      }`}
    >
      <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">{n}</span>
      {children}
    </div>
  );
}

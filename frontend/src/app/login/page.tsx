"use client";

import { Button, Card, Input, Label } from "neobrutalism-ui-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";

type Mode = "login" | "register" | "forgot";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(pwd: string): { score: number; label: string; color: string } {
  if (!pwd) return { score: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd) || pwd.length >= 12) score++;
  
  if (score <= 1) return { score: 1, label: "Mức độ: Cơ bản", color: "bg-[#e4d5bc]" };
  if (score === 2) return { score: 2, label: "Mức độ: Khá tốt", color: "bg-[#c4a15a]" };
  return { score: 3, label: "Mức độ: Rất an toàn", color: "bg-[#5c4e42]" };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [sentTo, setSentTo] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setSentTo("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  }

  function validate() {
    const next: Record<string, string> = {};
    if (mode === "register" && name.trim().length < 2) {
      next.name = "Vui lòng nhập họ và tên (ít nhất 2 ký tự).";
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      next.email = "Email chưa đúng định dạng (ví dụ: bacsi@benhvien.vn).";
    }
    if (mode !== "forgot" && password.length < 8) {
      next.password = "Mật khẩu bảo mật cần tối thiểu 8 ký tự.";
    }
    if (mode === "register" && confirm !== password) {
      next.confirm = "Mật khẩu xác nhận không khớp.";
    }
    return next;
  }

  async function finish(kind: "form" | "google") {
    setBusy(kind);
    await new Promise((resolve) => setTimeout(resolve, 750));
    sessionStorage.setItem(
      "clinnote-session",
      JSON.stringify({
        email: email.trim() || (kind === "google" ? "bacsi.google@clinnote.ai" : "bacsi@clinnote.ai"),
        name: name.trim() || (kind === "google" ? "Bác sĩ Google" : "Bác sĩ ClinNote"),
        remember,
        via: kind,
        timestamp: new Date().toISOString(),
      }),
    );
    router.push("/");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      setShake((n) => n + 1);
      return;
    }
    if (mode === "forgot") {
      setBusy("form");
      await new Promise((resolve) => setTimeout(resolve, 700));
      setBusy(null);
      setSentTo(email.trim());
      return;
    }
    await finish("form");
  }

  const strength = mode === "register" ? getPasswordStrength(password) : null;

  return (
    <main className="nb-classic relative flex min-h-screen items-center justify-center p-3 sm:p-6">
      <Card
        tone="cream"
        radius="sm"
        shadow="sm"
        border="thin"
        className="wf-rise relative z-10 flex w-full max-w-[940px] flex-col overflow-hidden"
      >
        <header className="flex items-center justify-between border-b border-[#c9bba8] bg-[#efe6d8] px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center border border-[#c9bba8] bg-[#e4d5bc] text-[#5c4e42] shadow-[2px_2px_0_#e4d8c8]">
              {/* Medical Pulse / Stethoscope Logo */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 3v5a4 4 0 0 0 8 0V3" />
                <path d="M8.5 12v3a4 4 0 0 0 4 4h1a4 4 0 0 0 4-4v-3" />
                <circle cx="17.5" cy="11.5" r="1.5" />
                <path d="M12.5 19v2" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-[#5c4e42]">ClinNote AI</span>
                <span className="border border-[#c9bba8] bg-[#f3ece1] px-2 py-0.5 text-[10px] font-semibold text-[#5c4e42]">
                  HITL Edition
                </span>
              </div>
              <p className="hidden text-[11px] text-[#866e5a] sm:block">Trợ lý y khoa thông minh</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 border border-[#c9bba8] bg-[#e4d5bc] px-2.5 text-[11px] font-medium text-[#5c4e42] shadow-[2px_2px_0_#e4d8c8]">
              VI
            </span>
            <Link
              href="/"
              className="inline-flex h-8 items-center gap-1.5 border border-[#c9bba8] bg-[#efe6d8] px-3 text-xs font-medium text-[#5c4e42] shadow-[2px_2px_0_#e4d8c8] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
              <span>Dashboard</span>
            </Link>
            <Link
              href="/"
              aria-label="Đóng và về Dashboard"
              className="grid h-8 w-8 place-items-center border border-[#c9bba8] bg-[#efe6d8] text-sm font-semibold text-[#5c4e42] shadow-[2px_2px_0_#e4d8c8] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
              ✕
            </Link>
          </div>
        </header>

        {/* 2-Column Body */}
        <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
          <aside className="hidden bg-[#F8F0E5] md:block" aria-hidden="true" />

          <section className="flex flex-col justify-center bg-[#F8F0E5] p-5 sm:p-8">
            {/* Top switcher & Title */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#c9bba8] pb-4">
              <div>
                <h1 className="font-serif text-xl font-bold tracking-tight text-[#5c4e42]">
                  {mode === "login"
                    ? "Đăng nhập tài khoản"
                    : mode === "register"
                      ? "Tạo tài khoản bác sĩ"
                      : "Khôi phục mật khẩu"}
                </h1>
                <p className="mt-1 text-xs text-[#826e5e]">
                  {mode === "login"
                    ? "Chào mừng trở lại! Vui lòng nhập thông tin phiên làm việc."
                    : mode === "register"
                      ? "Bắt đầu trải nghiệm trợ lý lâm sàng AI cho phòng khám của bạn."
                      : "Nhập email đã đăng ký để nhận liên kết khôi phục."}
                </p>
              </div>

              {/* Segmented Mode Control */}
              <div className="inline-flex border border-[#c9bba8] bg-[#efe6d8] p-1 shadow-[2px_2px_0_#e4d8c8]">
                {(
                  [
                    ["login", "Đăng nhập"],
                    ["register", "Đăng ký"],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    radius="none"
                    shadow="none"
                    border="none"
                    tone={mode === id ? "yellow" : "cream"}
                    press="none"
                    onClick={() => switchMode(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Form & Dynamic States */}
            <form
              key={`${mode}-${shake}-${sentTo}`}
              onSubmit={onSubmit}
              className={`space-y-4 ${shake ? "wf-shake" : ""}`}
              noValidate
            >
              {sentTo ? (
                /* Success View for Forgot Password */
                <div className="wf-rise rounded-2xl border border-dashed border-[#d9ba96] bg-[#fdf9f4] p-7 text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[#f4e6d4] text-[#482307]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-[#341804]">Đã gửi thư khôi phục!</h3>
                  <p className="mt-1 text-xs text-[#725e4f]">
                    Chúng tôi đã gửi hướng dẫn đặt lại mật khẩu đến:
                  </p>
                  <p className="mt-1 font-semibold text-sm text-[#482307]">{sentTo}</p>
                  <p className="mt-2 text-[11px] text-[#938072]">
                    Vui lòng kiểm tra hộp thư đến hoặc mục thư rác (Spam).
                  </p>
                  <div className="mt-5 flex justify-center gap-3">
                    <Button type="button" tone="yellow" radius="sm" shadow="sm" border="thin" press="push" onClick={() => switchMode("login")}>
                      ← Quay lại Đăng nhập
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {mode === "register" && (
                    <EnhancedField
                      id="field-name"
                      label="Họ và tên"
                      value={name}
                      autoComplete="name"
                      placeholder="Bác sĩ Nguyễn Văn A"
                      error={errors.name}
                      onChange={setName}
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                          <circle cx="12" cy="7" r="4"/>
                        </svg>
                      }
                    />
                  )}

                  <EnhancedField
                    id="field-email"
                    label="Email công tác"
                    type="email"
                    value={email}
                    autoComplete="email"
                    placeholder="bacsi@benhvien.vn"
                    error={errors.email}
                    onChange={setEmail}
                    icon={
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2"/>
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                      </svg>
                    }
                  />

                  {mode !== "forgot" && (
                    <div className="space-y-1.5">
                      <EnhancedField
                        id="field-password"
                        label="Mật khẩu"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        placeholder="Tối thiểu 8 ký tự"
                        error={errors.password}
                        onChange={setPassword}
                        icon={
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        }
                        aside={
                          mode === "login" ? (
                            <button
                              type="button"
                              onClick={() => switchMode("forgot")}
                              className="text-xs font-medium text-[#7c4314] hover:text-[#482307] hover:underline"
                            >
                              Quên mật khẩu?
                            </button>
                          ) : null
                        }
                        trailing={
                          <button
                            type="button"
                            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                            onClick={() => setShowPassword((v) => !v)}
                            className="text-[#8c7462] hover:text-[#381a05] focus:outline-none"
                          >
                            {showPassword ? (
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                                <line x1="2" x2="22" y1="2" y2="22"/>
                              </svg>
                            ) : (
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                                <circle cx="12" cy="12" r="3"/>
                              </svg>
                            )}
                          </button>
                        }
                      />

                      {/* Password strength indicator for Registration */}
                      {strength && password.length > 0 && (
                        <div className="border border-[#c9bba8] bg-[#efe6d8] px-3 py-2 text-[11px]">
                          <div className="flex items-center justify-between text-[#7c624e]">
                            <span>{strength.label}</span>
                            <span className="font-semibold">{strength.score}/3</span>
                          </div>
                          <div className="mt-1.5 flex h-1.5 w-full gap-1.5">
                            <span className={`h-full flex-1 ${strength.score >= 1 ? strength.color : "bg-[#e7d7b4]"}`} />
                            <span className={`h-full flex-1 ${strength.score >= 2 ? strength.color : "bg-[#e7d7b4]"}`} />
                            <span className={`h-full flex-1 ${strength.score >= 3 ? strength.color : "bg-[#e7d7b4]"}`} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {mode === "register" && (
                    <EnhancedField
                      id="field-confirm"
                      label="Xác nhận mật khẩu"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirm}
                      autoComplete="new-password"
                      placeholder="Nhập lại chính xác mật khẩu"
                      error={errors.confirm}
                      onChange={setConfirm}
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                      }
                      trailing={
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? "Ẩn xác nhận mật khẩu" : "Hiện xác nhận mật khẩu"}
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="text-[#8c7462] hover:text-[#381a05] focus:outline-none"
                        >
                          {showConfirmPassword ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                              <line x1="2" x2="22" y1="2" y2="22"/>
                            </svg>
                          ) : (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                              <circle cx="12" cy="12" r="3"/>
                            </svg>
                          )}
                        </button>
                      }
                    />
                  )}

                  {mode === "login" && (
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs text-[#5c3e27]">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="h-4 w-4 rounded border-[#d6c4b2] accent-[#482307] focus:ring-[#482307]/20"
                        />
                        <span>Ghi nhớ phiên đăng nhập trên thiết bị này</span>
                      </label>
                    </div>
                  )}

                  {/* Primary Submit Button */}
                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={busy !== null}
                      tone="yellow"
                      size="lg"
                      radius="none"
                      className="!h-11"
                      shadow="sm"
                      border="thin"
                      press="push"
                      fullWidth
                    >
                      {busy === "form" ? (
                        <>
                          <Spinner />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <>
                          <span>
                            {mode === "login"
                              ? "Đăng nhập hệ thống"
                              : mode === "register"
                                ? "Tạo tài khoản bác sĩ"
                                : "Gửi liên kết khôi phục"}
                          </span>
                          <svg className="transition-transform group-hover:translate-x-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14"/>
                            <path d="m12 5 7 7-7 7"/>
                          </svg>
                        </>
                      )}
                    </Button>

                    {mode === "forgot" && (
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="mt-2.5 w-full text-center text-xs font-medium text-[#7c4314] hover:underline"
                      >
                        ← Quay lại đăng nhập
                      </button>
                    )}
                  </div>

                  {/* Social Login Separator & Button */}
                  {mode !== "forgot" && (
                    <>
                      <div className="relative my-3 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-[#c9bba8]" />
                        </div>
                        <span className="relative bg-[#F8F0E5] px-3 text-[11px] font-medium tracking-wide text-[#948171] uppercase">
                          hoặc tiếp tục với
                        </span>
                      </div>

                      <Button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => finish("google")}
                        tone="cream"
                        size="lg"
                        radius="none"
                        className="!h-11"
                        shadow="sm"
                        border="thin"
                        press="push"
                        fullWidth
                      >
                        {busy === "google" ? (
                          <Spinner dark />
                        ) : (
                          /* Official Google Color Logo SVG */
                          <svg width="17" height="17" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
                            />
                          </svg>
                        )}
                        <span>Tài khoản Google</span>
                      </Button>
                    </>
                  )}
                </>
              )}
            </form>
          </section>
        </div>

      </Card>
    </main>
  );
}

function EnhancedField({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoComplete,
  icon,
  aside,
  trailing,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  icon?: ReactNode;
  aside?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>

      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0 text-[#5c4e42]">{icon}</span>}
        <Input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          tone="cream"
          border="thin"
          className="min-w-0 flex-1"
        />
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>

      {error && (
        <p id={`${id}-error`} className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`wf-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent ${
        dark ? "text-[#482307]" : "text-white"
      }`}
      aria-hidden="true"
    />
  );
}

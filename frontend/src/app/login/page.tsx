"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { syncAuthUser } from "@/lib/syncUser";

type Mode = "login" | "register" | "forgot";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState<"form" | "leave">("form");
  const [scene, setScene] = useState(false);
  const [cover, setCover] = useState<"on" | "out" | "off">("on");
  const sceneRef = useRef(false);
  const mainVideo = useRef<HTMLVideoElement>(null);
  const hoverVideo = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const prevRoot = root.style.overflow;
    const prevBody = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = prevRoot;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    if (!desktop.matches) {
      setCover("off");
      return;
    }
    const clip = mainVideo.current;
    if (clip && clip.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      setCover("out");
      return;
    }
    const cap = window.setTimeout(() => {
      setCover((current) => (current === "on" ? "out" : current));
    }, 8000);
    return () => window.clearTimeout(cap);
  }, []);

  useEffect(() => {
    if (cover !== "out") return;
    const id = window.setTimeout(() => setCover("off"), 520);
    return () => window.clearTimeout(id);
  }, [cover]);

  function releaseCover() {
    setCover((current) => (current === "on" ? "out" : current));
  }

  useEffect(() => {
    const main = mainVideo.current;
    const clip = hoverVideo.current;
    if (!main || !clip) return;
    if (scene) {
      main.pause();
      clip.currentTime = 0;
      void clip.play();
      return;
    }
    clip.pause();
    void main.play();
  }, [scene]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || sceneRef.current) return;
      setPhase("leave");
      window.setTimeout(() => router.replace("/desk"), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  function playOutro() {
    sceneRef.current = true;
    setScene(true);
    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        const clip = hoverVideo.current;
        if (!clip) {
          resolve();
          return;
        }
        const cap = window.setTimeout(finish, 4500);
        function finish() {
          window.clearTimeout(cap);
          clip?.removeEventListener("ended", finish);
          resolve();
        }
        clip.addEventListener("ended", finish);
      }, 0);
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setErrors({});
    setSentTo("");
    setNotice("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setShake(0);
    setAgreeTerms(false);
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
    if (mode === "register" && !agreeTerms) {
      next.terms = "Vui lòng đồng ý với Điều khoản dịch vụ & Miễn trừ trách nhiệm trước khi đăng ký.";
    }
    return next;
  }

  async function finish(kind: "form" | "google") {
    const supabase = getSupabase();
    if (!supabase) {
      setErrors({ form: "Chưa cấu hình Supabase (URL và anon key)." });
      setShake((n) => n + 1);
      return;
    }

    setBusy(kind);
    setNotice("");
    const redirectTo = `${window.location.origin}/`;
    let left = false;

    try {
      if (kind === "google") {
        await playOutro();
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo },
        });
        if (error) throw error;
        left = true;
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        setSentTo(email.trim());
        return;
      }

      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.user) {
          const syncError = await syncAuthUser(data.user);
          if (syncError && data.session) throw new Error(syncError);
        }
        if (!data.session) {
          setNotice("Đã tạo tài khoản. Mở email xác nhận rồi đăng nhập.");
          return;
        }
      } else {
        const outro = playOutro();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.user) {
          const syncError = await syncAuthUser(data.user);
          if (syncError) throw new Error(syncError);
        }
        await outro;
      }

      left = true;
      router.replace("/desk");
    } catch (err) {
      sceneRef.current = false;
      setScene(false);
      setErrors({ form: err instanceof Error ? err.message : "Không đăng nhập được." });
      setShake((n) => n + 1);
    } finally {
      if (!left) setBusy(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      setShake((n) => n + 1);
      return;
    }
    await finish("form");
  }

  if (phase === "leave") return <main className="h-dvh overflow-hidden bg-gradient-to-br from-emerald-50/60 via-slate-50 to-teal-50/50" />;

  return (
    <main className="relative flex h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50/70 via-neutral-50 to-teal-50/50 p-3 sm:p-6 selection:bg-emerald-100 selection:text-emerald-900">
      {/* Soft Clinical Ambient Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[480px] w-[480px] rounded-full bg-emerald-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[480px] w-[480px] rounded-full bg-teal-200/30 blur-3xl" />

      {cover !== "off" && (
        <div
          className={`fixed inset-0 z-50 hidden place-items-center bg-white/95 backdrop-blur-md transition-opacity duration-500 md:grid ${
            cover === "out" ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          role="status"
          aria-live="polite"
          aria-label="Đang tải video đăng nhập"
        >
          <LoginCover />
        </div>
      )}
      <section className="wf-rise relative z-10 flex max-h-full min-h-0 w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl shadow-emerald-950/10">
        <header className="flex items-center justify-between border-b border-emerald-100/80 bg-emerald-50/30 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Về trang chủ" className="flex items-center gap-2.5 transition hover:opacity-85">
            <img src="/logo-mark.png" alt="ClinNote AI" className="h-7 w-7 object-contain" />
            <div className="flex flex-col">
              <span className="font-serif text-base font-bold text-neutral-900 leading-none">ClinNote AI</span>
              <span className="text-[10px] text-emerald-700 font-medium mt-0.5">Clinical Note Assistant</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <ShieldCheck className="h-3 w-3 text-emerald-700" />
              Bảo mật y tế
            </span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 hover:text-emerald-700 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Trang chủ</span>
            </Link>
          </div>
        </header>

        {/* 2-Column Body */}
        <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
          <aside className="relative hidden h-[32rem] border-r border-emerald-100 md:block bg-neutral-900">
            <video
              ref={mainVideo}
              src="/login.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onCanPlayThrough={releaseCover}
              onError={releaseCover}
              className={`h-full w-full bg-subtle object-cover transition-opacity duration-300 ${scene ? "opacity-0" : "opacity-100"}`}
              aria-hidden="true"
              suppressHydrationWarning
            />
            <video
              ref={hoverVideo}
              src="/login-success.mp4"
              muted
              playsInline
              preload="metadata"
              className={`pointer-events-none absolute inset-0 z-20 h-full w-full object-cover transition-opacity duration-300 ${scene ? "opacity-100" : "opacity-0"}`}
              aria-hidden="true"
              suppressHydrationWarning
            />
            <div className="pointer-events-none absolute bottom-3 inset-x-3 rounded-lg bg-neutral-950/70 backdrop-blur-xs p-2 text-center text-white text-[11px] border border-white/10">
              <span className="font-medium text-emerald-300">ClinNote AI</span> · Soạn thảo SOAP từ hội thoại
            </div>
          </aside>

          <section className="no-y-scroll flex min-h-0 flex-col justify-start overflow-y-auto bg-transparent px-5 pt-2 pb-5 sm:px-8 sm:pt-3 sm:pb-6">
            {/* Top switcher & Title */}
            <div className="mb-4 flex flex-nowrap items-start justify-between gap-3 border-b border-neutral-100 pb-3">
              <div className="relative min-h-[4.75rem] min-w-0 flex-1">
                {(
                  [
                    ["login", "Đăng nhập tài khoản", "Chào mừng trở lại. Nhập thông tin để mở phiên làm việc."],
                    ["register", "Tạo tài khoản bác sĩ", "Bắt đầu sử dụng trợ lý ghi chép lâm sàng cho phòng khám."],
                    ["forgot", "Khôi phục mật khẩu", "Nhập email đã đăng ký để nhận liên kết khôi phục mật khẩu."],
                  ] as const
                ).map(([id, title, body]) => (
                  <div
                    key={id}
                    aria-hidden={mode !== id}
                    className={`transition-opacity duration-500 ease-out ${
                      mode === id ? "opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0"
                    }`}
                  >
                    <h1 className="text-xl font-serif font-bold tracking-tight text-neutral-900">{title}</h1>
                    <p className="mt-1 text-xs text-neutral-600">{body}</p>
                  </div>
                ))}
              </div>

              <div className="inline-flex h-8 shrink-0 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/50 p-0.5 text-xs">
                {(
                  [
                    ["login", "Đăng nhập"],
                    ["register", "Đăng ký"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchMode(id)}
                    className={`rounded-md px-3 font-semibold transition whitespace-nowrap cursor-pointer ${
                      mode === id
                        ? "bg-emerald-700 text-white shadow-2xs"
                        : "text-neutral-600 hover:text-emerald-800 hover:bg-emerald-100/50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form & Dynamic States */}
            <form
              key={`${shake}-${sentTo}`}
              onSubmit={onSubmit}
              className={shake ? "wf-shake" : undefined}
              noValidate
            >
              {sentTo ? (
                /* Success View for Forgot Password */
                <div className="wf-rise rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 p-7 text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-2xs">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-neutral-900">Đã gửi thư khôi phục</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Hướng dẫn đặt lại mật khẩu đã được gửi đến:
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-800">{sentTo}</p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Kiểm tra hộp thư đến hoặc mục thư rác.
                  </p>
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      onClick={() => switchMode("login")}
                      className="h-10 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 shadow-xs transition cursor-pointer"
                    >
                      Quay lại đăng nhập
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Reveal show={mode === "register"}>
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
                  </Reveal>

                  <div className="mb-4">
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
                  </div>

                  <Reveal show={mode !== "forgot"}>
                    <div>
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
                              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
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
                            className="text-neutral-400 hover:text-neutral-700 focus:outline-none cursor-pointer"
                          >
                            {showPassword ? (
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                                <line x1="2" y1="2" x2="22" y2="22"/>
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
                    </div>
                  </Reveal>

                  <Reveal show={mode === "register"}>
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
                          className="text-neutral-400 hover:text-neutral-700 focus:outline-none cursor-pointer"
                        >
                          {showConfirmPassword ? (
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
                              <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
                              <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
                              <line x1="2" y1="2" x2="22" y2="22"/>
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
                  </Reveal>

                  <Reveal show={mode === "login"}>
                    <div className="flex items-center justify-between pt-1">
                      <label className="flex cursor-pointer select-none items-center gap-2.5 text-xs text-neutral-600 hover:text-neutral-900">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="h-4 w-4 rounded-sm border-neutral-300 text-emerald-700 accent-emerald-700 focus:ring-emerald-600 cursor-pointer"
                        />
                        <span>Ghi nhớ phiên đăng nhập trên thiết bị này</span>
                      </label>
                    </div>
                  </Reveal>

                  <Reveal show={mode === "register"}>
                    <div className="pt-1">
                      <label className="flex cursor-pointer select-none items-start gap-2.5 text-xs text-neutral-600 hover:text-neutral-900">
                        <input
                          type="checkbox"
                          checked={agreeTerms}
                          onChange={(e) => {
                            setAgreeTerms(e.target.checked);
                            if (e.target.checked) {
                              setErrors((prev) => {
                                const next = { ...prev };
                                delete next.terms;
                                return next;
                              });
                            }
                          }}
                          className="mt-0.5 h-4 w-4 rounded-sm border-neutral-300 text-emerald-700 accent-emerald-700 focus:ring-emerald-600 cursor-pointer"
                        />
                        <span className="leading-relaxed">
                          Tôi đã đọc và đồng ý với{" "}
                          <Link
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-emerald-700 underline hover:text-emerald-800"
                          >
                            Điều khoản dịch vụ & Miễn trừ trách nhiệm y tế
                          </Link>
                        </span>
                      </label>
                      {errors.terms && (
                        <p className="mt-1.5 text-xs text-red-600 font-medium">{errors.terms}</p>
                      )}
                    </div>
                  </Reveal>

                  {notice && <p className="mb-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">{notice}</p>}
                  {errors.form && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{errors.form}</p>}

                  <div>
                    <button
                      type="submit"
                      disabled={busy !== null}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-800 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
                    >
                      {busy === "form" ? (
                        <>
                          <Spinner />
                          <span>Đang xử lý...</span>
                        </>
                      ) : (
                        <span>
                          {mode === "login"
                            ? "Đăng nhập"
                            : mode === "register"
                              ? "Tạo tài khoản"
                              : "Gửi liên kết khôi phục"}
                        </span>
                      )}
                    </button>

                    {mode === "forgot" && (
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="mt-2.5 w-full text-center text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                      >
                        Quay lại đăng nhập
                      </button>
                    )}
                  </div>

                  {mode !== "forgot" && (
                    <>
                      <div className="relative my-3 flex items-center justify-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-neutral-200" />
                        </div>
                        <span className="relative bg-white px-3 text-[11px] text-neutral-400">
                          hoặc tiếp tục với
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => finish("google")}
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 hover:border-emerald-300 hover:bg-emerald-50/40 transition disabled:opacity-60 cursor-pointer shadow-2xs"
                      >
                        {busy === "google" ? (
                          <Spinner />
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
                        <span>{mode === "register" ? "Đăng ký bằng Google" : "Tài khoản Google"}</span>
                      </button>
                    </>
                  )}
                </>
              )}
            </form>
          </section>
        </div>

      </section>
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
        <label htmlFor={id} className="text-xs font-semibold text-neutral-800">{label}</label>
        {aside}
      </div>

      <div className="flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20 shadow-2xs">
        {icon && <span className="shrink-0 text-neutral-400">{icon}</span>}
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        {trailing && <span className="shrink-0">{trailing}</span>}
      </div>

      {error && (
        <p id={`${id}-error`} className="text-[11px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function Reveal({
  show,
  pad = true,
  children,
}: {
  show: boolean;
  pad?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        show ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
      }`}
      inert={show ? undefined : true}
    >
      <div className="overflow-hidden">
        <div
          className={
            pad
              ? `transition-[padding] duration-500 motion-reduce:transition-none ${show ? "pb-4" : "pb-0"}`
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function LoginCover() {
  return (
    <div className="flex flex-col items-center gap-5">
      <img src="/logo-mark.png" alt="" className="h-14 w-14 object-contain" />
      <div className="text-center">
        <p className="text-sm font-serif font-bold text-emerald-950">ClinNote AI</p>
        <p className="mt-1 text-xs text-emerald-700">Đang chuẩn bị phiên làm việc lâm sàng...</p>
      </div>
      <div className="h-1.5 w-36 overflow-hidden rounded-full bg-emerald-100">
        <span className="wf-cover-sweep block h-full w-1/3 rounded-full bg-emerald-700" />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="wf-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

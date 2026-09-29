import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6 text-ink">
      <div className="w-full max-w-3xl text-center">
        <img
          src="/not-found.jpg"
          alt="404 Not Found"
          className="w-full rounded-[22px] border border-line shadow-panel"
        />
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-ink/90"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}

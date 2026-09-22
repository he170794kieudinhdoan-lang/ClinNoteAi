import Link from "next/link";

export default function NotFound() {
  return (
    <main className="nb-classic flex min-h-dvh items-center justify-center bg-[#efe6d8] p-6 text-[#3e342c]">
      <div className="w-full max-w-3xl text-center">
        <img
          src="/not-found.jpg"
          alt="404 Not Found"
          className="w-full rounded-[22px] border border-[#efe4d4] shadow-[0_16px_40px_rgba(62,52,44,0.08)]"
        />
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-[#ead9c2] px-4 text-sm font-semibold hover:bg-[#e3d0b4]"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}

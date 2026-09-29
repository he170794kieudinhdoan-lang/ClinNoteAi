"use client";

import { Command } from "cmdk";
import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import ClinicShell from "@/components/ClinicShell";
import { useEncounterList } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { Encounter, EncounterStatus } from "@/types";

const STATUS_LABEL: Record<EncounterStatus, string> = {
  empty: "Chờ ghi âm",
  recording: "Đang ghi",
  uploaded: "Đã tải",
  soap: "Ghi chú",
  final: "Đã duyệt",
};

function latestByPatient(encounters: Encounter[]) {
  const byCode = new Map<string, Encounter>();
  for (const item of encounters) {
    const key = item.patient.code || item.id;
    const prev = byCode.get(key);
    if (!prev || item.createdAt > prev.createdAt) byCode.set(key, item);
  }
  return [...byCode.values()];
}

export default function PatientsPage() {
  const authed = useRequireAuth();
  const { encounters } = useEncounterList();
  const [query, setQuery] = useState("");
  const patients = useMemo(() => latestByPatient(encounters), [encounters]);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? patients.filter((item) => item.patient.name.toLowerCase().includes(needle) || (item.patient.code ?? "").toLowerCase().includes(needle))
    : patients;

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  return (
    <ClinicShell section="patients">
      <section className="flex h-full min-h-0 w-full flex-col gap-4 overflow-auto bg-canvas px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-faint">HỒ SƠ</p>
            <h1 className="text-2xl font-extrabold tracking-tight">Bệnh nhân</h1>
          </div>
          <Link
            href="/patients/new"
            className="inline-flex h-10 items-center rounded-lg bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            Thêm bệnh nhân
          </Link>
        </div>

        <Command shouldFilter={false} className="rounded-2xl border border-line bg-white shadow-panel">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={16} className="shrink-0 text-faint" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm theo tên hoặc mã bệnh nhân"
              aria-label="Tìm bệnh nhân"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-faint"
            />
          </div>
        </Command>

        <article className="min-h-0 w-full flex-1 overflow-auto rounded-2xl border border-line bg-white shadow-panel">
          <ul className="divide-y divide-line-soft">
            {visible.length === 0 && (
              <li className="px-4 py-6 text-sm text-muted">{needle ? "Không thấy bệnh nhân khớp." : "Chưa có bệnh nhân."}</li>
            )}
            {visible.map((item) => (
              <li key={item.patient.code || item.id}>
                <Link href={`/encounters/${item.id}`} className="grid gap-2 px-4 py-3 transition-colors hover:bg-subtle sm:grid-cols-[1.4fr_0.8fr_0.6fr_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.patient.name}</span>
                    <span className="font-mono text-xs text-faint">{item.patient.code}</span>
                  </span>
                  <span className="text-sm text-muted">{item.patient.reason || "—"}</span>
                  <span className="text-sm text-muted">
                    {item.patient.gender || "—"}
                    {item.patient.age > 0 ? ` · ${item.patient.age} tuổi` : ""}
                  </span>
                  <span className="w-fit rounded-full border border-line bg-white px-2.5 py-0.5 text-[11px] text-muted">
                    {STATUS_LABEL[item.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </ClinicShell>
  );
}

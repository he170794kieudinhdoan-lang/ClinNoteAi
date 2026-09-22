"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  const patients = useMemo(() => latestByPatient(encounters), [encounters]);

  if (!authed) return <main className="nb-classic min-h-dvh bg-[#efe6d8]" />;

  return (
    <ClinicShell section="patients" title="Bệnh nhân" plain>
      <section className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden px-5 pt-1 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9a8674]">HỒ SƠ</p>
            <h1 className="font-serif text-2xl font-bold tracking-tight">Quản lý bệnh nhân</h1>
          </div>
          <Link
            href="/patients/new"
            className="inline-flex h-10 items-center rounded-lg bg-[#ead9c2] px-4 text-sm font-semibold transition-colors hover:bg-[#e3d0b4]"
          >
            Thêm bệnh nhân
          </Link>
        </div>

        <article className="min-h-0 w-full flex-1 overflow-auto rounded-2xl border border-[#efe4d4] bg-[#fffdf9] shadow-sm">
          <ul className="divide-y divide-[#f3eadf]">
            {patients.length === 0 && <li className="px-4 py-6 text-sm text-[#866e5a]">Chưa có bệnh nhân.</li>}
            {patients.map((item) => (
              <li key={item.patient.code || item.id}>
                <Link href={`/encounters/${item.id}`} className="grid gap-2 px-4 py-3 transition-colors hover:bg-[#faf6f0] sm:grid-cols-[1.4fr_0.8fr_0.6fr_auto] sm:items-center">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{item.patient.name}</span>
                    <span className="font-mono text-xs text-[#9a8674]">{item.patient.code}</span>
                  </span>
                  <span className="text-sm text-[#5c4e42]">{item.patient.reason || "—"}</span>
                  <span className="text-sm text-[#5c4e42]">
                    {item.patient.gender || "—"}
                    {item.patient.age > 0 ? ` · ${item.patient.age} tuổi` : ""}
                  </span>
                  <span className="w-fit rounded-full border border-[#eadfce] bg-white px-2.5 py-0.5 text-[11px] text-[#5c4e42]">
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

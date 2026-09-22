"use client";

/**
 * Dashboard (/) — danh sách lượt khám + mở modal thêm bệnh nhân.
 *
 * Click 1 dòng → /encounters/[id]
 * TODO: search, filter status, gọi API list thay vì mock.
 */

import { useState } from "react";
import Link from "next/link";
import AddPatientModal from "@/components/AddPatientModal";
import { useEncounterList } from "@/hooks/useEncounter";

export default function DashboardPage() {
  const { encounters } = useEncounterList();
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button type="button" className="underline" onClick={() => setOpen(true)}>
          Thêm bệnh nhân
        </button>
      </div>

      <ul className="mt-6 space-y-2">
        {encounters.map((item) => (
          <li key={item.id}>
            <Link href={`/encounters/${item.id}`} className="underline">
              {item.patient.name} — {item.status}
            </Link>
          </li>
        ))}
      </ul>

      <AddPatientModal open={open} onClose={() => setOpen(false)} />
    </main>
  );
}

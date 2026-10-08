"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import ClinicShell from "@/components/ClinicShell";
import DashboardBody from "@/components/DashboardBody";
import { useEncounterList } from "@/hooks/useEncounter";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function DeskLayout({ children }: { children: ReactNode }) {
  const authed = useRequireAuth();
  const pathname = usePathname();
  const { encounters } = useEncounterList();

  if (!authed) return <main className="min-h-dvh bg-canvas" />;

  return (
    <ClinicShell section={pathname.startsWith("/patients/new") ? "new" : "home"}>
      <div className="relative h-full min-h-0 overflow-hidden">
        <div className="h-full min-h-0" inert={pathname.startsWith("/patients/new") ? true : undefined}>
          <DashboardBody encounters={encounters} />
        </div>
        {children}
      </div>
    </ClinicShell>
  );
}

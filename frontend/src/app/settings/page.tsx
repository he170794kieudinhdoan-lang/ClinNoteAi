"use client";

import ClinicShell from "@/components/ClinicShell";
import ModelSettings from "@/components/settings/ModelSettings";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function SettingsPage() {
  const authed = useRequireAuth();
  if (!authed) return <main className="min-h-dvh bg-canvas" />;
  return (
    <ClinicShell section="settings">
      <ModelSettings />
    </ClinicShell>
  );
}

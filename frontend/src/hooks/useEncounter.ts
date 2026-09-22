"use client";

/**
 * useEncounter — nguồn data cho Dashboard + Clinical Editor.
 *
 * Hiện: đọc MOCK_ENCOUNTERS (lib/mock.ts).
 * TODO: thay bằng getEncounters() / getEncounter(id) trong lib/api.ts.
 */

import { MOCK_ENCOUNTERS } from "@/lib/mock";
import type { Encounter } from "@/types";

export function useEncounterList() {
  const encounters: Encounter[] = MOCK_ENCOUNTERS;
  return { encounters };
}

export function useEncounter(id: string) {
  const encounter = MOCK_ENCOUNTERS.find((item) => item.id === id) ?? null;
  return { encounter };
}

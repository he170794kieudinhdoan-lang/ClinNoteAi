"use client";

/**
 * useEncounter — nguồn data cho Dashboard + Clinical Editor.
 *
 * Hiện: đọc MOCK_ENCOUNTERS (lib/mock.ts).
 * TODO: thay bằng getEncounters() / getEncounter(id) trong lib/api.ts.
 */

import { useEffect, useState } from "react";
import { MOCK_ENCOUNTERS } from "@/lib/mock";
import type { Encounter } from "@/types";

const STORAGE_KEY = "clinnote-encounters";
const REMOVED_KEY = "clinnote-removed-ids";

function readStored(): Encounter[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") as Encounter[];
  } catch {
    return [];
  }
}

function readRemoved(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(REMOVED_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function merge(extra: Encounter[], removedIds: string[]) {
  const removed = new Set(removedIds);
  const kept = extra.filter((item) => !removed.has(item.id));
  const ids = new Set(kept.map((item) => item.id));
  return [...kept, ...MOCK_ENCOUNTERS.filter((item) => !ids.has(item.id) && !removed.has(item.id))];
}

export function saveEncounter(encounter: Encounter) {
  const rest = readStored().filter((item) => item.id !== encounter.id);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([encounter, ...rest]));
}

export function removeEncounter(id: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(readStored().filter((item) => item.id !== id)));
  const removed = readRemoved().filter((item) => item !== id);
  sessionStorage.setItem(REMOVED_KEY, JSON.stringify([...removed, id]));
}

export function useEncounterList() {
  const [extra, setExtra] = useState<Encounter[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => {
    setExtra(readStored());
    setRemoved(readRemoved());
  }, []);
  return { encounters: merge(extra, removed) };
}

export function useEncounter(id: string) {
  const [extra, setExtra] = useState<Encounter[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => {
    setExtra(readStored());
    setRemoved(readRemoved());
  }, []);
  if (!extra) return { encounter: null, ready: false };
  const encounter = merge(extra, removed).find((item) => item.id === id) ?? null;
  return { encounter, ready: true };
}

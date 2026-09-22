"use client";

/**
 * Danh sách lượt khám cho trang chủ, bệnh nhân, và màn khám.
 * MOCK: queryFn đọc sessionStorage + MOCK_ENCOUNTERS.
 * Khi có API thì chỉ đổi loadEncounters / saveEncounter / removeEncounter sang lib/api.ts:
 *   GET    /api/v1/encounters
 *   POST   /api/v1/encounters
 *   GET    /api/v1/encounters/:id
 *   POST   /api/v1/encounters/:id/approve
 */

import { useQuery } from "@tanstack/react-query";
import { MOCK_ENCOUNTERS } from "@/lib/mock";
import { getQueryClient } from "@/lib/queryClient";
import type { Encounter } from "@/types";

const ENCOUNTERS_KEY = ["encounters"] as const;
const STORAGE_KEY = "clinnote-encounters";
const REMOVED_KEY = "clinnote-removed-ids";

function readStored(): Encounter[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]") as Encounter[];
  } catch {
    return [];
  }
}

function readRemoved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(REMOVED_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

// MOCK: ghép lượt tạo trên tab này với danh sách mẫu. Bỏ nhánh MOCK_ENCOUNTERS khi API trả đủ list.
function merge(extra: Encounter[], removedIds: string[]) {
  const removed = new Set(removedIds);
  const kept = extra.filter((item) => !removed.has(item.id));
  const ids = new Set(kept.map((item) => item.id));
  return [...kept, ...MOCK_ENCOUNTERS.filter((item) => !ids.has(item.id) && !removed.has(item.id))];
}

// MOCK: nguồn tạm. Thay thân hàm bằng getEncounters() khi có GET /api/v1/encounters.
async function loadEncounters() {
  return merge(readStored(), readRemoved());
}

function writeCache(list: Encounter[]) {
  getQueryClient().setQueryData<Encounter[]>(ENCOUNTERS_KEY, list);
}

export function saveEncounter(encounter: Encounter) {
  // MOCK: chưa có POST /api/v1/encounters. Giữ trên tab này tới khi có API.
  const rest = readStored().filter((item) => item.id !== encounter.id);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([encounter, ...rest]));
  const current = getQueryClient().getQueryData<Encounter[]>(ENCOUNTERS_KEY) ?? merge(readStored(), readRemoved());
  writeCache([encounter, ...current.filter((item) => item.id !== encounter.id)]);
}

export function removeEncounter(id: string) {
  // MOCK: chưa có DELETE /api/v1/encounters/:id.
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(readStored().filter((item) => item.id !== id)));
  const removed = readRemoved().filter((item) => item !== id);
  sessionStorage.setItem(REMOVED_KEY, JSON.stringify([...removed, id]));
  const current = getQueryClient().getQueryData<Encounter[]>(ENCOUNTERS_KEY);
  if (current) writeCache(current.filter((item) => item.id !== id));
}

export function useEncounterList() {
  const query = useQuery({ queryKey: ENCOUNTERS_KEY, queryFn: loadEncounters });
  return { encounters: query.data ?? [] };
}

export function useEncounter(id: string) {
  const query = useQuery({ queryKey: ENCOUNTERS_KEY, queryFn: loadEncounters });
  if (!query.isSuccess) return { encounter: null, ready: false };
  return { encounter: query.data.find((item) => item.id === id) ?? null, ready: true };
}

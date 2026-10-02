"use client";

/**
 * Danh sách lượt khám cho trang chủ, bệnh nhân, và màn khám.
 * Nguồn dữ liệu: GET /api/v1/consultations?doctor_id= — lưu theo từng bác sĩ trên backend DB.
 */

import { useQuery } from "@tanstack/react-query";
import type { Encounter } from "@/types";
import { listConsultations, mapConsultationToEncounter } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";
import { getQueryClient } from "@/lib/queryClient";

const ENCOUNTERS_KEY = ["encounters"] as const;
const REMOVED_KEY_PREFIX = "clinnote-removed-ids";

async function getDoctorId(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return "";
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? "";
}

function removedKey(doctorId: string) {
  return `${REMOVED_KEY_PREFIX}:${doctorId}`;
}

function readRemoved(doctorId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem(removedKey(doctorId)) || "[]") as string[];
  } catch {
    return [];
  }
}

async function loadEncounters(): Promise<Encounter[]> {
  const doctorId = await getDoctorId();
  if (!doctorId) return [];
  const items = await listConsultations(doctorId);
  const removed = new Set(readRemoved(doctorId));
  return items.map(mapConsultationToEncounter).filter((enc) => !removed.has(enc.id));
}

function writeCache(list: Encounter[]) {
  getQueryClient().setQueryData<Encounter[]>(ENCOUNTERS_KEY, list);
}

/** Optimistic update: ghi vào React Query cache, chỉ phục vụ hiển thị tức thời. */
export function saveEncounter(encounter: Encounter) {
  const current = getQueryClient().getQueryData<Encounter[]>(ENCOUNTERS_KEY);
  if (!current) return;
  writeCache([encounter, ...current.filter((item) => item.id !== encounter.id)]);
}

/** Chưa có DELETE backend: ẩn locally, key theo doctorId để không ảnh hưởng bác sĩ khác. */
export function removeEncounter(id: string) {
  void getDoctorId().then((doctorId) => {
    if (!doctorId) return;
    const removed = readRemoved(doctorId);
    sessionStorage.setItem(removedKey(doctorId), JSON.stringify([...new Set([...removed, id])]));
    const current = getQueryClient().getQueryData<Encounter[]>(ENCOUNTERS_KEY);
    if (current) writeCache(current.filter((item) => item.id !== id));
  });
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

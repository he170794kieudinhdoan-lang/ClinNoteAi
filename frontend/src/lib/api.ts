/**
 * API client → FastAPI (mặc định http://localhost:8000).
 *
 * BE hiện có:
 *   GET  /health
 *   GET  /api/v1/status
 *   POST /api/v1/chat   { message }
 *
 * TODO khi BE sẵn: list/create encounter, upload audio, generate SOAP, approve.
 * Giữ signature bên dưới, chỉ đổi URL + body.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getApiBase() {
  return API_BASE;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export function getHealth() {
  return request<{ status: string; env?: string }>("/health");
}

export function getAgentStatus() {
  return request<{ status: string; agent?: string }>("/api/v1/status");
}

export function chat(message: string) {
  return request<{ response: string; analysis: string }>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// --- TODO: gắn khi BE có route ---
// GET    /api/v1/encounters
// POST   /api/v1/encounters
// GET    /api/v1/encounters/:id
// POST   /api/v1/encounters/:id/audio
// POST   /api/v1/encounters/:id/soap
// POST   /api/v1/encounters/:id/approve

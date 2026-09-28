import { getApiBase } from "@/lib/api";
import type {
  ApproveSoapRequest,
  ExtractCapsRequest,
  ExtractCapsResponse,
  SaveSoapRevisionRequest,
  SoapRevisionResponse,
  SoapRunResponse,
} from "@/types/soap";

export class SoapApiError extends Error {
  status: number;
  code?: string;
  stage?: string;
  runId?: string;

  constructor(message: string, details: { status: number; code?: string; stage?: string; runId?: string }) {
    super(message);
    this.name = "SoapApiError";
    this.status = details.status;
    this.code = details.code;
    this.stage = details.stage;
    this.runId = details.runId;
  }
}

async function readError(response: Response): Promise<SoapApiError> {
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Keep the plain response body for proxies and non-JSON errors.
  }

  const detail = parsed.detail;
  const detailObject = detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
  const message =
    (typeof detail === "string" && detail) ||
    (typeof detailObject.message === "string" && detailObject.message) ||
    (typeof parsed.message === "string" && parsed.message) ||
    text ||
    `SOAP API trả về lỗi ${response.status}.`;

  return new SoapApiError(message, {
    status: response.status,
    code: typeof detailObject.code === "string" ? detailObject.code : typeof parsed.code === "string" ? parsed.code : undefined,
    stage: typeof detailObject.stage === "string" ? detailObject.stage : typeof parsed.stage === "string" ? parsed.stage : undefined,
    runId:
      typeof detailObject.run_id === "string"
        ? detailObject.run_id
        : typeof parsed.run_id === "string"
          ? parsed.run_id
          : undefined,
  });
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new SoapApiError("Không kết nối được backend. Hãy kiểm tra server và cấu hình NEXT_PUBLIC_API_URL.", {
      status: 0,
    });
  }
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

function runPath(runId: string) {
  return `/api/v1/soap/runs/${encodeURIComponent(runId)}`;
}

export function extractCaps(input: ExtractCapsRequest) {
  return requestJson<ExtractCapsResponse>("/api/v1/soap/extract-caps", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSoapRun(runId: string) {
  return requestJson<SoapRunResponse>(runPath(runId));
}

export function generateSoap(runId: string, expectedRevision: number) {
  return requestJson<SoapRevisionResponse>(`${runPath(runId)}/generate`, {
    method: "POST",
    body: JSON.stringify({ expected_revision: expectedRevision }),
  });
}

export function saveSoapRevision(runId: string, input: SaveSoapRevisionRequest) {
  return requestJson<SoapRevisionResponse>(`${runPath(runId)}/revisions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function approveSoap(runId: string, input: ApproveSoapRequest) {
  return requestJson<SoapRevisionResponse>(`${runPath(runId)}/approve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function exportSoapRevision(runId: string, revision: number): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${runPath(runId)}/export?revision=${revision}`);
  } catch {
    throw new SoapApiError("Không kết nối được backend để tải bản SOAP.", { status: 0 });
  }
  if (!response.ok) throw await readError(response);
  return response.blob();
}

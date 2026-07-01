/**
 * Base fetch wrapper for calls from the panel to the CADChecker backend.
 *
 * `credentials: "include"` is required so the httpOnly session cookie rides
 * along on cross-origin requests from inside the Onshape Element Tab iframe
 * (the panel and backend are same-origin to each other but the panel itself
 * is embedded cross-origin inside cad.onshape.com).
 */

const DEFAULT_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
};

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: { ...DEFAULT_HEADERS, ...init.headers },
  });
}

/**
 * Structured check-run report shape (placeholder signature only).
 * Plan 03 implements the real request/response wiring against
 * POST /api/check; this phase (Task 3) exports only the contract so the
 * panel shell can reference it without runtime check logic existing yet.
 */
export interface CheckReportVerdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  measured: number;
  pass: boolean;
}

export interface CheckReport {
  verdicts: CheckReportVerdict[];
  generatedAt: string;
}

/**
 * Placeholder signature for the future "check now" call. No implementation
 * yet -- Plan 03 wires this to POST /api/check, which re-derives the live
 * document/workspace/element context at click time (RESEARCH Pattern 1).
 */
export function runCheck(): Promise<CheckReport> {
  return apiFetch("/api/check", { method: "POST" }).then((res) => res.json() as Promise<CheckReport>);
}

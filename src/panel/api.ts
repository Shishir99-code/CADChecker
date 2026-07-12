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
 * Structured check-run report shape returned by POST /api/check. Mirrors
 * src/server/checks/engine.ts's Verdict shape -- the panel renders whatever
 * JSON the backend returns and duplicates no business logic client-side
 * (RESEARCH Architectural Responsibility Map).
 */
export interface CheckReportVerdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  measured?: { lb: number; kg: number };
  measuredCount?: number;
  affectedPartCount?: number;
  affectedParts?: Array<{ name: string; path: string[] }>;
  caveats: string[];
  /**
   * Mirrors src/server/checks/engine.ts's Verdict.geometry field-for-field
   * (D-07) -- hull vertices for the perimeter check's SVG render. The panel
   * performs zero geometry recomputation; HullRender.tsx only maps these
   * server-supplied vertex arrays into an SVG polygon.
   */
  geometry?: {
    hullVertices: Array<[number, number]>;
    framePartFootprints?: Array<[number, number]>[];
  };
}

/**
 * Mirrors the server's measuredContext (check.routes.ts) field-for-field --
 * these four disclosure fields are never recomputed client-side, only
 * rendered as-is (DisclosureHeader.tsx). documentId/workspaceId/elementId
 * are kept for back-compat with other features.
 */
export interface CheckReportContext {
  documentId: string;
  workspaceId: string;
  elementId: string;
  /** Best-effort; undefined if the server-side document-name lookup failed. */
  documentName?: string;
  /** Free from the server's getElementsInDocument call; undefined only if
   * Onshape omits it. */
  tabName?: string;
  /** Always "Default" in v1 -- no named-configuration selection exists yet. */
  configurationName: string;
  /** Server-stamped ISO 8601 timestamp, from the same response as verdicts. */
  checkedAt: string;
}

export interface CheckReport {
  measuredContext: CheckReportContext;
  verdicts: CheckReportVerdict[];
}

/**
 * A distinct signal (D-05): the session's access token could not be
 * refreshed. The panel MUST render this as a dedicated Reconnect view, never
 * as a row inside the report table.
 */
export interface CheckReconnectSignal {
  needsReconnect: true;
}

export type CheckResult = CheckReport | CheckReconnectSignal;

export function isReconnectSignal(result: CheckResult): result is CheckReconnectSignal {
  return "needsReconnect" in result && result.needsReconnect === true;
}

/**
 * Thrown when the backend responds 401 -- the panel has no authenticated
 * session and should show the Connect action (Plan 01), not the Reconnect
 * view (which is specifically for a *failed refresh*, D-05) nor a report.
 */
export class AuthRequiredError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "AuthRequiredError";
  }
}

/**
 * Runs "check now": POSTs the panel's own document/workspace identity to the
 * backend, which re-derives the live target element at request time
 * (CONN-02) -- the panel never selects or caches which element is checked.
 * The OAuth token is never referenced here; apiFetch's credentials:"include"
 * carries the httpOnly session cookie instead (threat T-01-10).
 */
export async function runCheck(documentId: string, workspaceId: string): Promise<CheckResult> {
  const res = await apiFetch("/api/check", {
    method: "POST",
    body: JSON.stringify({ documentId, workspaceId }),
  });

  if (res.status === 401) {
    throw new AuthRequiredError();
  }

  return (await res.json()) as CheckResult;
}

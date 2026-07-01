/**
 * 401-reactive refresh-and-retry wrapper (D-04/D-05, RESEARCH Pattern 3).
 *
 * Every outbound Onshape API call the backend makes should be wrapped with
 * callWithRefresh: on a 401 from the wrapped call, attempt exactly ONE
 * refresh_token grant, update the session's tokens, and retry the original
 * call exactly once. If the refresh call itself throws/rejects for ANY
 * reason, treat it as "needs reconnect" -- do NOT branch on the refresh
 * failure's status code (RESEARCH Open Question 2 recommendation, matching
 * Onshape's own OAuth docs guidance to simply redirect to sign-in again on
 * any refresh failure).
 */

/** Minimal session shape this module needs -- structurally compatible with
 * express-session's SessionData augmentation (src/server/types/session.d.ts)
 * without importing express-session here, keeping this module easy to unit
 * test with a plain object. */
export interface RefreshableSession {
  accessToken?: string;
  refreshToken?: string;
  needsReconnect?: boolean;
}

export interface RefreshedTokens {
  access_token: string;
  refresh_token?: string;
}

/** Thrown when refresh itself fails; the caller (route handler) is expected
 * to catch this and surface the panel's dedicated Reconnect state (D-05),
 * never a generic 500 or a check-failure verdict. */
export class ReconnectRequiredError extends Error {
  constructor(message = "Onshape session refresh failed; reconnect required") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}

function isUnauthorized(err: unknown): boolean {
  if (err && typeof err === "object" && "status" in err) {
    return (err as { status?: unknown }).status === 401;
  }
  return false;
}

/**
 * A refresh function performs the actual `grant_type=refresh_token` POST
 * against Onshape's token endpoint. Injected so callWithRefresh has no
 * network dependency of its own and stays fully unit-testable offline.
 */
export type RefreshFn = (refreshToken: string | undefined) => Promise<RefreshedTokens>;

/**
 * Runs `fn(session.accessToken)`. On a 401, refreshes once via `refreshFn`
 * and retries `fn` exactly once with the new access token. Any refresh
 * failure sets `session.needsReconnect = true` and throws
 * ReconnectRequiredError instead of the original error.
 */
export async function callWithRefresh<T>(
  session: RefreshableSession,
  fn: (accessToken: string | undefined) => Promise<T>,
  refreshFn: RefreshFn,
): Promise<T> {
  try {
    return await fn(session.accessToken);
  } catch (err) {
    if (!isUnauthorized(err)) {
      throw err;
    }

    try {
      const refreshed = await refreshFn(session.refreshToken);
      session.accessToken = refreshed.access_token;
      session.refreshToken = refreshed.refresh_token ?? session.refreshToken;
      session.needsReconnect = false;
      return await fn(session.accessToken); // single retry
    } catch {
      session.needsReconnect = true;
      throw new ReconnectRequiredError();
    }
  }
}

import "express-session";

/**
 * Augments express-session's SessionData with the Onshape OAuth token bundle
 * and the Reconnect-state flag.
 *
 * Tokens live ONLY here (server-side session storage, D-03) -- they must
 * never be serialized into any response body sent to the panel.
 */
declare module "express-session" {
  interface SessionData {
    /** Onshape OAuth2 access token (60-minute lifetime). Server-side only. */
    accessToken?: string;
    /** Onshape OAuth2 refresh token (long-lived). Server-side only. */
    refreshToken?: string;
    /**
     * Set true when a 401-reactive refresh attempt (D-04) itself fails.
     * Drives the panel's dedicated "Reconnect" state (D-05) -- consumed by
     * Plan 03, declared now so the type contract is stable across plans.
     */
    needsReconnect?: boolean;
  }
}

/**
 * Augments Express's passport user type. CADChecker has no user datastore
 * (v1 constraint) -- the serialized "user" is just the Onshape profile id,
 * kept separate from the OAuth tokens (which live directly on the session,
 * not on this object).
 */
declare global {
  namespace Express {
    interface User {
      id: string;
      displayName?: string;
    }
  }
}

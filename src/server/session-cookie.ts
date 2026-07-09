/**
 * Derives express-session cookie flags from the configured OAuth redirect URI.
 *
 * - https:// redirect URIs (the ngrok-tunnel or deployed-prod case): keep
 *   `secure: true, sameSite: "none"`. This is REQUIRED so the session cookie
 *   is sent from inside the cross-origin Onshape Element Tab iframe
 *   (RESEARCH Pitfall 2 / ASVS V3) -- do not relax this branch.
 * - Any other scheme (http://localhost dev, or an unset/undefined redirect
 *   URI): relax to `secure: false, sameSite: "lax"`. Browsers refuse to set a
 *   `Secure` cookie over plain http, so without this the passport-onshape
 *   `state: true` CSRF value never round-trips and local OAuth over
 *   http://localhost fails outright. This relaxed branch is for local dev
 *   only -- production/tunnel deployments always configure an https redirect
 *   URI and hit the first branch above.
 */
export function deriveSessionCookieOptions(redirectUri: string | undefined): {
  httpOnly: true;
  secure: boolean;
  sameSite: "none" | "lax";
} {
  if (redirectUri?.startsWith("https://")) {
    return { httpOnly: true, secure: true, sameSite: "none" };
  }
  return { httpOnly: true, secure: false, sameSite: "lax" };
}

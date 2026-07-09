---
quick_id: 260709-k6r
slug: enable-oauth-over-http-localhost-via-env
subsystem: auth
tags: [express-session, oauth, cookies, local-dev]

key-files:
  created:
    - src/server/session-cookie.ts
    - src/server/session-cookie.test.ts
  modified:
    - src/server/index.ts

key-decisions:
  - "Cookie flags derived from ONSHAPE_REDIRECT_URI scheme (https:// keeps secure+SameSite=None; anything else, including undefined, relaxes to not-secure+Lax) rather than a separate NODE_ENV or explicit dev flag, so the safe production/iframe behavior stays the default and only an explicit https redirect URI opts into it."

duration: 12min
completed: 2026-07-09
---

# Quick Task 260709-k6r: Enable OAuth over http://localhost via env Summary

**Session cookie flags now derive from the OAuth redirect-URI scheme (via a new `deriveSessionCookieOptions` helper), unblocking local OAuth over plain `http://localhost` without touching prod/iframe behavior.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-09T14:22:00Z (approx)
- **Completed:** 2026-07-09T14:34:03-04:00
- **Tasks:** 1
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Added `src/server/session-cookie.ts` exporting `deriveSessionCookieOptions(redirectUri)`: returns `{ httpOnly: true, secure: true, sameSite: "none" }` for `https://` redirect URIs (unchanged prod/iframe behavior), and `{ httpOnly: true, secure: false, sameSite: "lax" }` otherwise (http://localhost dev or unset).
- Wired `src/server/index.ts` to call `deriveSessionCookieOptions(ONSHAPE_REDIRECT_URI)` instead of the previous hardcoded `{ secure: true, sameSite: "none" }` object, relocating the explanatory comment.
- Added `src/server/session-cookie.test.ts` covering the https case, the http://localhost case, and the undefined (safe-default) case.

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive session cookie secure/sameSite from redirect-URI scheme** - `e5026e4` (feat)

**Plan metadata:** not committed by this agent (orchestrator handles the docs commit).

## Files Created/Modified
- `src/server/session-cookie.ts` - New pure helper: `deriveSessionCookieOptions(redirectUri)`.
- `src/server/session-cookie.test.ts` - Unit tests for the three cases (https, http://localhost, undefined).
- `src/server/index.ts` - Cookie config now calls `deriveSessionCookieOptions(ONSHAPE_REDIRECT_URI)` instead of a hardcoded object.

## Decisions Made
- Used the redirect-URI scheme itself as the branching signal (rather than `NODE_ENV` or a new explicit env flag), since `ONSHAPE_REDIRECT_URI` is already the single source of truth distinguishing local dev (`http://localhost:...`) from tunnel/prod (`https://...`) in this codebase, and the undefined/non-https case safely defaults to the relaxed (but still `httpOnly`) variant.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. (Registering the `http://localhost:5173/auth/onshape/callback` redirect URI in the Onshape Developer Portal remains a manual, out-of-scope step per the plan, to be done by the user.)

## Verification

All required checks passed:
- `npx tsc -p tsconfig.server.json --noEmit` - clean
- `npx eslint src` - clean
- `npx vitest run` (full suite) - 9 test files, 43 tests passed
- `npm run build` - server `tsc` build + `vite build` both succeeded

Confirmed unmodified per constraints: `src/server/app.ts` (trust proxy), `src/server/auth/passport-config.ts` (`state: true`), `.env`, `render.yaml`, and all Phase 2 (`02-*`) files/mass-properties client methods/contract doc.

## Next Phase Readiness
- Local OAuth flow over `http://localhost` should now round-trip the passport `state` CSRF cookie once the user registers the localhost redirect URI in the Onshape Developer Portal and points `ONSHAPE_REDIRECT_URI` at it locally.
- No blockers for subsequent phase work; this was a narrow, isolated dev-environment fix.

## Self-Check: PASSED

- FOUND: src/server/session-cookie.ts
- FOUND: src/server/session-cookie.test.ts
- FOUND: e5026e4 in git log

---
*Quick task: 260709-k6r-enable-oauth-over-http-localhost-via-env*
*Completed: 2026-07-09*

---
phase: 01-connected-foundation-first-check
plan: 03
subsystem: api
tags: [openapi-fetch, oauth-refresh, express, react, vitest, tdd, passport, vite-proxy]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Authorized session (OAuth2 handshake, server-side session, iframe panel shell, postMessage handshake)"
  - phase: 01-02
    provides: "Pure check core: loadSeasonConfig, flattenAssembly, CheckEngine with 2 registered checks"
provides:
  - "Typed Onshape client (createOnshapeClient) that injects the session Bearer token server-side only"
  - "callWithRefresh — 401-reactive single retry, ReconnectRequiredError on refresh failure (D-04/D-05)"
  - "POST /api/check — re-derives live document/element context at request time, runs traversal + engine + config, returns a structured rule-cited report or a needsReconnect signal"
  - "Panel report rendering: PlumbingBanner, ReportTable, ReconnectState wired into main.tsx's check-now flow"
  - "End-to-end Walking Skeleton proven against a real Onshape assembly, both first-party and embedded in the Onshape Element-tab iframe (Chrome)"
affects: [phase-2, phase-3, phase-4]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "callWithRefresh wraps every Onshape-bound call; refresh failure ALWAYS sets session.needsReconnect and throws ReconnectRequiredError regardless of the refresh error's status code (RESEARCH Open Question 2) — never branch on refresh-failure status"
    - "The ELEMENT to check is re-derived server-side via getElementsInDocument at request time inside check.routes.ts — the panel supplies only documentId/workspaceId, never the element identity, closing CONN-02 and threat T-01-11"
    - "ReconnectRequiredError is caught in the route and returned as a 200 { needsReconnect: true } payload, kept structurally distinct from a check-failure verdict so the panel can never confuse 'session expired' with 'robot fails a rule' (D-05)"
    - "Vite dev-server proxy prefixes must be scoped with a trailing slash (\"/api/\", \"/auth/\") — a bare \"/api\" prefix matches the panel's own /api.ts module path and silently forwards it to the Express backend"
    - "passport's req.logIn() regenerates the session by default (session-fixation protection in passport >=0.6) and wipes anything written to req.session before logIn runs unless keepSessionInfo: true is passed"

key-files:
  created:
    - src/server/onshape-client/client.ts
    - src/server/onshape-client/types/onshape.d.ts
    - src/server/auth/refresh.ts
    - src/server/auth/refresh.test.ts
    - src/server/auth/login-session.test.ts
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts
    - src/panel/components/ReportTable.tsx
    - src/panel/components/PlumbingBanner.tsx
    - src/panel/components/ReconnectState.tsx
  modified:
    - package.json
    - src/server/app.ts
    - src/server/routes/auth.routes.ts
    - src/panel/api.ts
    - src/panel/main.tsx
    - vite.config.ts

key-decisions:
  - "callWithRefresh treats ANY refresh-call failure (thrown error or non-2xx) identically — sets needsReconnect and throws ReconnectRequiredError — rather than branching on the refresh endpoint's specific status code, per RESEARCH Open Question 2"
  - "check.routes.ts re-derives the target element via getElementsInDocument on every request rather than trusting an elementId from the panel, closing CONN-02 and threat T-01-11 (panel-supplied identity spoofing)"
  - "Vite dev proxy prefixes changed from bare \"/api\" and \"/auth\" to \"/api/\" and \"/auth/\" so the panel's own ./api.ts module import is never mistaken for a proxied backend path"
  - "auth.routes.ts passes { keepSessionInfo: true } to req.logIn() so accessToken/refreshToken written to req.session before logIn survive passport's session regeneration"

requirements-completed: [CONN-02, CONN-03, RUN-01]

# Metrics
duration: ~35min (18:50 start of Task 1 -> 15:52 final fix commit, across a paused session)
completed: 2026-07-02
---

# Phase 01 Plan 03: Wiring Slice — Typed Client, Live /api/check, Report/Reconnect Panel Summary

**A typed openapi-fetch Onshape client with a 401-reactive single-retry refresh wrapper, a POST /api/check route that re-derives live document context at click time and runs the Plan-02 engine over real assembly data, and a panel that renders a rule-cited pass/fail report — confirmed end-to-end against a real Onshape assembly in both first-party and embedded-iframe (Chrome) contexts.**

## Performance

- **Duration:** ~35 min of active implementation across the session (paused at the Task 4 human-verify checkpoint, resumed and approved)
- **Tasks:** 4 (3 code tasks + 1 human-verify checkpoint, now approved)
- **Files created:** 10
- **Files modified:** 6 (including 2 checkpoint-driven fixes)

## Accomplishments

- Built `createOnshapeClient(session)` (openapi-fetch, baseUrl `https://cad.onshape.com/api/v10`) attaching `Authorization: Bearer <session.accessToken>` entirely server-side, with typed helpers `getElementsInDocument` and `getAssemblyDefinition` each routed through `callWithRefresh`.
- Built `callWithRefresh` / `ReconnectRequiredError`: a 401 triggers exactly one transparent refresh-and-retry; any refresh failure (thrown or non-2xx) sets `session.needsReconnect = true` and throws `ReconnectRequiredError` — never a branch on refresh-failure status code.
- Built `POST /api/check`: requires an authenticated session, re-derives the live element via `getElementsInDocument` at request time (not a value cached at panel mount — CONN-02), fetches the assembly definition, runs it through `flattenAssembly` -> `loadSeasonConfig("2026")` -> `CheckEngine.runAll`, and returns `{ measuredContext, verdicts }` or `{ needsReconnect: true }` when refresh fails.
- Built the panel report UI: `PlumbingBanner` ("verdicts not yet trusted"), `ReportTable` (rule number, title, measured value, pass/fail badge), and a dedicated `ReconnectState` (visually separate container, reconnect button navigating the top frame to `/auth/onshape`) — wired into `main.tsx`'s check-now flow so a `needsReconnect` response never renders as a check-result row.
- **Task 4 (human-verify) — APPROVED.** Against the user's real 2019 FRC robot Onshape assembly, "check now" returned a structured, rule-cited report (PlumbingBanner + R101/R103 rows with measured values and PASS/FAIL badges), confirmed working both first-party (ngrok URL, real documentId/workspaceId) and embedded in the Onshape Element-tab iframe in Chrome (third-party session cookie delivered correctly).
- Two real bugs were found and fixed while resolving the checkpoint (see Deviations) — both were required for the approved end-to-end result and are documented below rather than treated as pre-existing plan tasks.

## Task Commits

1. **Task 1: Typed Onshape client + 401-reactive refresh-and-retry wrapper (D-04/D-05)**
   - `bd57c1d` test(01-03): add failing test for 401-reactive refresh-and-retry wrapper
   - `da0e101` feat(01-03): implement typed Onshape client + 401-reactive refresh wrapper
2. **Task 2: POST /api/check — live context re-derivation, traversal, engine, structured report**
   - `3c88735` test(01-03): add failing test for POST /api/check live-context route
   - `3051d48` feat(01-03): implement POST /api/check with live context re-derivation
3. **Task 3: Panel report rendering — plumbing banner, pass/fail rows, dedicated Reconnect state**
   - `7a279b5` feat(01-03): panel report rendering with plumbing banner and Reconnect state
4. **Task 4: End-to-end "check now" against a real Onshape assembly (checkpoint:human-verify)**
   - No code commit (verification-only task) — **Result: approved** (see Deviations for the two fixes made while resolving this checkpoint)

**Checkpoint-driven fixes (found while resolving Task 4):**
- `4bbafd8` fix(01-03): scope dev proxy prefixes so /api.ts panel module isn't swallowed
- `4707a1d` fix(01-03): preserve OAuth tokens across passport session regeneration

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: TDD tasks 1 and 2 followed test -> feat commit pairs; Task 3 (non-TDD, UI wiring) was a single feat commit; Task 4 is a verification checkpoint with no code of its own._

## Files Created/Modified

- `src/server/onshape-client/client.ts` — `createOnshapeClient(session)`, `getElementsInDocument`, `getAssemblyDefinition`; Bearer token attached server-side only
- `src/server/onshape-client/types/onshape.d.ts` — Onshape API types for the endpoints this phase uses
- `src/server/auth/refresh.ts` — `callWithRefresh`, `ReconnectRequiredError`
- `src/server/auth/refresh.test.ts` — 401-retry-once, refresh-failure-throws, first-try-success-no-retry
- `src/server/auth/login-session.test.ts` — pins `keepSessionInfo: true` behavior in both directions (added as part of the checkpoint fix, not originally in the plan's file list)
- `src/server/routes/check.routes.ts` — `checkRouter`, `POST /api/check`
- `src/server/routes/check.routes.test.ts` — supertest coverage: 2 verdicts, live re-derivation invoked per-request, needsReconnect signal, 401 when unauthenticated
- `src/panel/components/ReportTable.tsx` — renders `Verdict[]` as pass/fail rows
- `src/panel/components/PlumbingBanner.tsx` — "verdicts not yet trusted" banner
- `src/panel/components/ReconnectState.tsx` — dedicated Reconnect view, reconnect button -> `/auth/onshape`
- `package.json` — added `gen:types` script
- `src/server/app.ts` — mounts `checkRouter`
- `src/server/routes/auth.routes.ts` — `req.logIn(user, { keepSessionInfo: true }, ...)` (checkpoint fix)
- `src/panel/api.ts` — `runCheck()` posting to `/api/check` with `credentials: "include"`
- `src/panel/main.tsx` — check-now button, loading state, report/reconnect rendering
- `vite.config.ts` — dev proxy prefixes scoped from `/api` to `/api/` and `/auth` to `/auth/` (checkpoint fix)

## Decisions Made

- `callWithRefresh` never branches on the refresh endpoint's specific failure status — any thrown error or non-2xx response uniformly sets `needsReconnect` and throws `ReconnectRequiredError`, per RESEARCH Open Question 2.
- `check.routes.ts` re-derives the target element server-side on every request via `getElementsInDocument`, refusing to trust an element identity supplied by the panel — closes CONN-02 and threat T-01-11.
- Vite dev-proxy prefixes were changed to require a trailing slash (`/api/`, `/auth/`) so the panel's own `./api.ts` module specifier is never matched and forwarded to the Express backend.
- `auth.routes.ts` now passes `{ keepSessionInfo: true }` to `req.logIn()` so tokens written to `req.session` before `logIn()` runs survive passport's session-fixation-protection regeneration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vite dev proxy prefix swallowed the panel's own `/api.ts` module**
- **Found during:** Task 4 (human-verify checkpoint) — first attempt at a real end-to-end run produced a blank panel
- **Issue:** The dev-server proxy matched requests by the bare prefix `"/api"`. Once `main.tsx` began importing `./api.ts` (introduced in this plan), Vite's dev-server matched the module request path against the `"/api"` proxy prefix and forwarded the module fetch to the Express backend instead of serving the source file, returning a 404 for what should have been a JS module — breaking the panel's module graph and rendering a completely blank panel. This had not surfaced in Plans 01/02 because no panel code imported a path starting with `/api` until this plan added `api.ts`.
- **Fix:** Scoped the proxy prefixes with a trailing slash — `"/api/"` and `"/auth/"` — so only actual API/auth calls are proxied, never the panel's own same-named module path.
- **Files modified:** `vite.config.ts`
- **Verification:** Panel loads and renders correctly in both dev and the ngrok-tunneled/embedded contexts after the fix; confirmed during the approved Task 4 re-run.
- **Committed in:** `4bbafd8`

**2. [Rule 1 - Bug] passport session regeneration silently wiped OAuth tokens, causing persistent 401**
- **Found during:** Task 4 (human-verify checkpoint) — after fixing the blank panel, `/api/check` still returned "connect first" (401) even immediately after a successful-looking OAuth login, both first-party and embedded
- **Issue:** passport 0.6+ regenerates the session object inside `req.logIn()` as a session-fixation mitigation, discarding all prior `req.session` properties except `passport.user`. The OAuth verify callback wrote `accessToken`/`refreshToken` onto `req.session` *before* calling `req.logIn()`, so those values were being wiped on every single login. Every subsequent `/api/check` call therefore saw an empty session and returned 401, masquerading as "the user never really connected" when in fact login had succeeded and then erased its own token.
- **Fix:** Passed `{ keepSessionInfo: true }` as the options argument to `req.logIn()` in `auth.routes.ts`, which instructs passport to preserve existing `req.session` data across the internal regeneration. Added `src/server/auth/login-session.test.ts` (2 tests) pinning this behavior in both directions (tokens survive with the flag; would be wiped without it), so a future passport upgrade or refactor cannot silently reintroduce this regression.
- **Files modified:** `src/server/routes/auth.routes.ts`, `src/server/auth/login-session.test.ts` (new)
- **Verification:** Re-ran the full OAuth flow; session now retains `accessToken`/`refreshToken` after login; `/api/check` succeeds on the very next request. `login-session.test.ts` passes (2/2). Confirmed in the approved Task 4 result (both first-party and embedded Chrome).
- **Committed in:** `4707a1d`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs blocking the end-to-end flow, only surfaced once real browser/OAuth conditions were exercised at the Task 4 checkpoint; neither was reachable by the plan's stubbed unit tests)
**Impact on plan:** Both fixes were necessary for the plan's own acceptance criteria (a real "check now" against live Onshape data) to be achievable at all. No scope creep — no functionality was added beyond what Tasks 1-3 already specified; these are corrections to plumbing that Tasks 1-3 introduced.

## Issues Encountered

None beyond the two auto-fixed issues above, which are documented in Deviations rather than here since both were resolved without needing a user decision.

## Verification Results — Honest Scope

**Manually confirmed end-to-end (Task 4, approved):**
- "Check now" against the user's real 2019 FRC robot Onshape assembly returns a structured, rule-cited report: PlumbingBanner ("verdicts not yet trusted") plus R101/R103 rows with measured values and PASS/FAIL badges.
- Confirmed working **first-party** (ngrok HTTPS URL, real `documentId`/`workspaceId` query params).
- Confirmed working **embedded inside the Onshape Element-tab iframe in Chrome** (third-party session cookie delivered correctly in the user's Chrome browser).

**NOT manually exercised this session — relies on automated unit coverage instead:**
- **CONN-02 (live-context re-derivation on tab switch):** not manually re-tested by switching Onshape tabs before clicking "check now" in this session. Covered by `check.routes.test.ts`, which asserts `getElementsInDocument` is invoked during request handling (not read from a mount-time cache).
- **CONN-03 (token-refresh / Reconnect behavior):** not manually triggered via an expired/invalidated token in this session. Covered by `refresh.test.ts` (401 -> single retry -> success; refresh failure -> `needsReconnect` + `ReconnectRequiredError`; first-try success -> no retry).

**Known open item, carried forward (not this session's responsibility to close):**
- **Safari third-party-cookie behavior was NOT tested.** The user deferred this check. This continues the open item first raised in Plan 01-01 (Safari's stricter third-party-cookie defaults are a known risk for the embedded-iframe session cookie). Status: **works in Chrome; Safari untested.**

This scope is recorded honestly rather than claimed as fully re-verified — the core report loop (the highest-risk, highest-value path) was manually confirmed; the two narrower CONN-02/CONN-03 edge behaviors rely on their existing green unit tests, which were themselves written against the real bug patterns this plan's checkpoint uncovered (the refresh test suite predates and is unaffected by the two fixes above; the fixes were in the route/proxy/session-login layer, not the refresh-retry logic itself).

## User Setup Required

None — no external service configuration required beyond what Plan 01 already established (Onshape OAuth app registration, `.env` client id/secret, ngrok tunnel for dev).

## Follow-ups / Notes

- **Safari third-party-cookie test is still open.** Carry forward into a later verification pass before considering the Walking Skeleton fully cross-browser-proven. If Safari rejects the third-party session cookie inside the embedded iframe, the fallback per CLAUDE.md's serverless/session alternatives section (signed cookie carrying the token directly) may need reconsideration — but only if Safari support becomes a stated requirement.
- **USER REQUEST — dedicated UI/styling pass deferred.** The panel (PlumbingBanner, ReportTable, ReconnectState) is intentionally unstyled plumbing right now — the priority was proving the report loop is real and rule-cited, not making it look finished. The user has explicitly requested that a UI/styling pass wait until the checks themselves are real (post Phase 2-4), rather than polishing a UI whose verdicts are still explicitly labeled "not yet trusted." Suggest `/gsd-ui-phase` once Phase 2+ check accuracy work lands.

## Next Phase Readiness

- Phase 1's Walking Skeleton is now proven end-to-end: OAuth session (01-01) -> pure, config-driven check core (01-02) -> live typed client + refresh + report route + panel rendering (01-03), confirmed against a real Onshape document in the embedded Onshape iframe.
- CONN-02, CONN-03, RUN-01 satisfied, with the verification-scope caveats above (CONN-02/CONN-03 edge cases rely on unit coverage rather than a fresh manual re-check this session; Safari untested).
- No blockers for Phase 2 (Trustworthy Weight) — the shared `flattenAssembly` / `CheckEngine` / `loadSeasonConfig` path this phase exercised against live data is exactly what Phase 2's material-audit check will extend.
- Two structural gotchas worth flagging forward: (1) any future Vite proxy prefix must stay slash-scoped to avoid swallowing same-named panel modules; (2) any code writing to `req.session` before `req.logIn()` must pass `keepSessionInfo: true` or risk silent data loss on every login.

## Self-Check: PASSED

- All 7 commit hashes (`bd57c1d`, `da0e101`, `3c88735`, `3051d48`, `7a279b5`, `4bbafd8`, `4707a1d`) verified present in `git log --oneline`.
- All 7 key files verified present on disk: `src/server/onshape-client/client.ts`, `src/server/auth/refresh.ts`, `src/server/routes/check.routes.ts`, `src/panel/components/ReportTable.tsx`, `src/panel/components/PlumbingBanner.tsx`, `src/panel/components/ReconnectState.tsx`, `src/server/auth/login-session.test.ts`.
- `npx vitest run` executed: 7 test files, 28/28 tests passing.
- No source code was re-implemented or modified during this close-out — this SUMMARY documents work already implemented, verified, and approved (Task 4 checkpoint) prior to this session's SUMMARY step.

---
*Phase: 01-connected-foundation-first-check*
*Completed: 2026-07-02*

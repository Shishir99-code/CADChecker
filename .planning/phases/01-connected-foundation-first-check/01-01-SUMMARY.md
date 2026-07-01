---
phase: 01-connected-foundation-first-check
plan: 01
subsystem: auth
tags: [oauth2, passport-onshape, express-session, react, vite, postmessage, ngrok, vitest, supertest]

# Dependency graph
requires: []
provides:
  - TS/Node/Express + React/Vite project scaffold (tsconfig, eslint flat config, vite build/dev config)
  - Onshape OAuth2 authorization-code flow via passport-onshape (CSRF state enabled)
  - Server-side httpOnly/Secure/SameSite=None session cookie holding accessToken/refreshToken (never sent to client)
  - React panel shell with a "Connect Onshape" action and an origin-validated postMessage handshake (applicationInit)
  - Single-origin ngrok/Vite dev proxy (/auth, /api, /healthz -> Express) plus `trust proxy` so the Secure cookie is actually issued behind a TLS-terminating proxy
  - supertest coverage of /healthz and /auth/onshape (redirect + state param + httpOnly cookie)
affects: [01-02, 01-03, phase-2, phase-3]

# Tech tracking
tech-stack:
  added: [express@5.2.x, express-session@1.19.x, passport@0.7.x, passport-onshape@1.2.x, react@19.2.x, vite@8.x, vitest@4.x, supertest@7.x, zod@4.x, dotenv@17.x, openapi-typescript@7.13.x, openapi-fetch@0.17.x]
  patterns:
    - "buildApp() Express factory (src/server/app.ts) separate from the process entrypoint (src/server/index.ts) that owns session/listen config"
    - "OAuth tokens live only in req.session (server-side MemoryStore); response bodies never contain accessToken/refreshToken"
    - "postMessage handshake captures the Onshape server origin once at iframe load and rejects any later message whose event.origin does not match it"
    - "Single ngrok HTTPS tunnel fronts the Vite dev server, which proxies /auth, /api, /healthz to Express -- keeps the panel on one origin so relative fetch URLs and the session cookie behave the same in dev as in production"

key-files:
  created:
    - package.json
    - tsconfig.json
    - tsconfig.server.json
    - eslint.config.js
    - vitest.config.ts
    - .env.example
    - .gitignore
    - vite.config.ts
    - render.yaml
    - src/server/app.ts
    - src/server/index.ts
    - src/server/auth/passport-config.ts
    - src/server/routes/auth.routes.ts
    - src/server/types/session.d.ts
    - src/server/types/passport-onshape.d.ts
    - src/server/app.test.ts
    - src/panel/main.tsx
    - src/panel/index.html
    - src/panel/postMessage/handshake.ts
    - src/panel/api.ts
  modified:
    - src/server/app.ts (deviation fix: trust proxy)
    - vite.config.ts (deviation fix: dev proxy + allowedHosts)

key-decisions:
  - "ESLint 10 flat config (eslint.config.js) used instead of the plan's .eslintrc.cjs -- the installed ESLint major version no longer supports the legacy config format"
  - "Added a minimal ambient src/server/types/passport-onshape.d.ts because no official @types/passport-onshape package exists"
  - "Added vitest.config.ts to set the Vitest root explicitly, since Vite's own root (src/panel, for the React panel build) would otherwise be inferred as the test root and miss src/server tests"
  - "Single-origin ngrok -> Vite dev proxy (Task 4 checkpoint fix): the panel uses relative URLs, so OAuth + iframe embedding through a single ngrok tunnel requires Vite to proxy /auth, /api, /healthz to Express, plus allowedHosts for the ngrok hostname"
  - "app.set('trust proxy', 1) added (Task 4 checkpoint fix): required for express-session to issue the Secure session cookie behind ngrok's (and later Render's) TLS-terminating proxy -- without it OAuth succeeds but no session cookie is ever set"

patterns-established:
  - "Rule 1/3 mechanical deviations (tooling version drift, missing type packages, test-root config) are fixed inline without pausing execution"
  - "Human-verify checkpoints that reveal real integration gaps (proxy/cookie config) are captured as their own commit, separate from the task commits that preceded them"

requirements-completed: [CONN-01]

# Metrics
duration: 143min
completed: 2026-07-01
---

# Phase 01 Plan 01: Connected Foundation Walking Skeleton Summary

**Onshape OAuth2 (passport-onshape, CSRF state) into an httpOnly server-side session, embedded in a real Onshape Element-tab panel via ngrok with an origin-validated postMessage handshake — verified end-to-end in Chrome against a live document.**

## Performance

- **Duration:** 143 min (15:35:54 -> 17:58:59 local, plus checkpoint pause/approval time)
- **Started:** 2026-07-01T19:35:54Z
- **Completed:** 2026-07-01T21:58:59Z
- **Tasks:** 4 (3 auto + 1 checkpoint:human-verify, approved)
- **Files modified:** 22 (20 created in Tasks 1-3, 2 modified by the checkpoint deviation fix)

## Accomplishments

- Scaffolded a TypeScript/Node/Express + React/Vite project with a TDD RED->GREEN auth entry point (supertest)
- Wired Onshape OAuth2 (passport-onshape) with CSRF `state` protection and a server-side-only httpOnly/Secure/SameSite=None session cookie holding `accessToken`/`refreshToken`
- Built a React panel shell with a "Connect Onshape" action and a postMessage handshake that validates `event.origin` against the Onshape server origin captured at load
- Verified the entire OAuth + iframe-embedding round-trip in a real Onshape document (Chrome) via the Task 4 human-verify checkpoint, which is now **approved**
- Fixed two real integration gaps (single-origin dev proxy, `trust proxy`) surfaced only by that live verification, unblocking the Secure session cookie behind the ngrok tunnel

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold TS/Node/Express + React/Vite with failing e2e auth test** - `2770f57` (test, TDD RED)
2. **Task 2: Wire Onshape OAuth with server-side session token storage** - `873e54f` (feat, TDD GREEN)
3. **Task 3: Panel shell with origin-validated postMessage handshake + Connect action** - `f5eb966` (feat)
4. **Task 4: Human-verify checkpoint (OAuth + iframe embedding in real Onshape doc)** - no code commit (verification-only); checkpoint-pause recorded in `bb95665`; **approved** by user (see Checkpoint Result below)
5. **Deviation fix surfaced by Task 4 verification: single-origin dev proxy + trust proxy** - `91952a2` (fix)

**Plan metadata:** (this commit, following SUMMARY.md write)

_Note: TDD tasks (1, 2) follow test -> feat commit pairs; Task 3 is a non-TDD `auto` task per plan frontmatter._

## Files Created/Modified

- `package.json` - npm scaffold; express, express-session, passport, passport-onshape, react, vite, vitest, supertest, zod, dotenv, openapi-typescript, openapi-fetch at RESEARCH-pinned versions
- `tsconfig.json` / `tsconfig.server.json` - base TS config + server build config (NodeNext, ES2022 target)
- `eslint.config.js` - ESLint 10 flat config with typescript-eslint recommended (replaces plan's `.eslintrc.cjs`, see deviations)
- `vitest.config.ts` - explicit Vitest root so server tests are discovered independent of Vite's panel root
- `.env.example` - ONSHAPE_CLIENT_ID/SECRET, ONSHAPE_REDIRECT_URI, SESSION_SECRET, PORT placeholders
- `.gitignore` - node_modules, dist, .env, generated onshape-client types
- `vite.config.ts` - `@vitejs/plugin-react`, panel root/build config; **+dev proxy for /auth,/api,/healthz and `allowedHosts`** (deviation fix)
- `render.yaml` - single always-on Node web service declaration (D-01)
- `src/server/app.ts` - `buildApp()` Express factory (JSON body parsing, `/healthz`, passport init, `authRouter` mount); **+`app.set("trust proxy", 1)`** (deviation fix)
- `src/server/index.ts` - process entrypoint: express-session MemoryStore, httpOnly+Secure+SameSite=None cookie, `listen`
- `src/server/auth/passport-config.ts` - `OnshapeStrategy` wiring (clientID/clientSecret/callbackURL from env, `state: true`, verify callback stores tokens in session)
- `src/server/routes/auth.routes.ts` - `authRouter` exporting `GET /auth/onshape` and `GET /auth/onshape/callback`
- `src/server/types/session.d.ts` - augments `SessionData` with `accessToken`, `refreshToken`, `needsReconnect`
- `src/server/types/passport-onshape.d.ts` - minimal ambient module declaration (no official `@types/passport-onshape` exists)
- `src/server/app.test.ts` - supertest: `/healthz` 200, `/auth/onshape` 302 with `state` param, callback session cookie `HttpOnly` assertion (3/3 passing)
- `src/panel/index.html` / `src/panel/main.tsx` - React shell, "Connect Onshape" button (top-frame navigation to `/auth/onshape`), placeholder region for Plan 03's report/Reconnect UI
- `src/panel/postMessage/handshake.ts` - `startHandshake()`: parses iframe query params, posts `applicationInit`, listens for show/hide/takeFocus, rejects any message whose `event.origin` != captured server origin
- `src/panel/api.ts` - typed fetch wrapper (`credentials: "include"`), placeholder `runCheck` signature for Plan 03

## Decisions Made

- ESLint 10 flat config (`eslint.config.js`) used instead of the plan's `.eslintrc.cjs` — the installed ESLint major version dropped support for the legacy format.
- Added `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` to `tsconfig.server.json` for NodeNext relative `.ts` imports.
- Added a minimal ambient `src/server/types/passport-onshape.d.ts` since no official `@types/passport-onshape` package is published.
- Added `vitest.config.ts` to fix the test root, since the inferred root from `vite.config.ts` (`src/panel`) would otherwise apply to Vitest too and miss `src/server` tests.
- Single-origin ngrok -> Vite dev proxy + `trust proxy` (see Deviations below) — required for the live OAuth+iframe round-trip to actually issue a Secure session cookie.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `.eslintrc.cjs` replaced with `eslint.config.js` (ESLint flat config)**
- **Found during:** Task 1 (project scaffold)
- **Issue:** Plan specified `.eslintrc.cjs`, but the installed ESLint major version (10.x) requires flat config and no longer reads legacy `.eslintrc.*` files — `npm run lint` would not run.
- **Fix:** Created `eslint.config.js` using `typescript-eslint`'s recommended flat config instead.
- **Files modified:** `eslint.config.js` (in place of `.eslintrc.cjs`)
- **Verification:** `npm run lint` exits 0.
- **Committed in:** `2770f57` (Task 1 commit)

**2. [Rule 3 - Blocking] tsconfig.server.json needed extra NodeNext import-extension flags**
- **Found during:** Task 1 (project scaffold)
- **Issue:** NodeNext module resolution requires explicit `.ts` extensions on relative imports; the plan's base tsconfig fields alone produced import-resolution errors on the server build.
- **Fix:** Added `allowImportingTsExtensions` and `rewriteRelativeImportExtensions` to `tsconfig.server.json`.
- **Files modified:** `tsconfig.server.json`
- **Verification:** `tsc -p tsconfig.server.json` (via `npm run build`) compiles without resolution errors.
- **Committed in:** `2770f57` (Task 1 commit)

**3. [Rule 3 - Blocking] Minimal ambient type declarations for `passport-onshape`**
- **Found during:** Task 2 (OAuth wiring)
- **Issue:** No official `@types/passport-onshape` package exists; TypeScript compilation of `passport-config.ts` failed without type declarations for the module.
- **Fix:** Added `src/server/types/passport-onshape.d.ts` with a minimal ambient module declaration covering the `Strategy` constructor shape actually used.
- **Files modified:** `src/server/types/passport-onshape.d.ts`
- **Verification:** `tsc` and `vitest` both compile/run against `passport-config.ts` without type errors.
- **Committed in:** `873e54f` (Task 2 commit)

**4. [Rule 3 - Blocking] Added `vitest.config.ts` for explicit test root**
- **Found during:** Task 1/2 (test discovery)
- **Issue:** Without an explicit Vitest config, the test root was ambiguously inferred relative to `vite.config.ts`'s `root: src/panel` setting, risking `src/server/app.test.ts` not being discovered.
- **Fix:** Added a minimal `vitest.config.ts` setting the project root explicitly to the repo root.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run` discovers and runs `src/server/app.test.ts` (3/3 passing).
- **Committed in:** `2770f57` (Task 1 commit)

**5. [Rule 3 - Blocking] Single-origin ngrok/Vite dev proxy + `trust proxy` for the Secure session cookie**
- **Found during:** Task 4 human-verify checkpoint (live OAuth + iframe embedding test)
- **Issue:** Two gaps blocked the real OAuth + iframe round-trip through the ngrok HTTPS tunnel: (a) the panel uses relative URLs and needs a single origin, but nothing forwarded `/auth`, `/api`, `/healthz` from the Vite dev server to Express, and Vite's `allowedHosts` rejected the ngrok hostname by default; (b) `express-session`'s `cookie.secure: true` requires Express to trust the proxy's `X-Forwarded-*` headers — without `trust proxy` set, OAuth completed successfully but no session cookie was ever issued behind the TLS-terminating ngrok tunnel (and would fail identically behind Render in production).
- **Fix:** Added a Vite dev-server proxy for `/auth`, `/api`, `/healthz` to Express on port 3000, added the ngrok host to `allowedHosts`, and added `app.set("trust proxy", 1)` in `buildApp()`.
- **Files modified:** `vite.config.ts`, `src/server/app.ts`
- **Verification:** Live end-to-end test in a real Onshape document (Chrome): panel embeds inside the Element-tab iframe with no mixed-content/blocked-frame errors, "Connect Onshape" completes the full OAuth authorization-code round-trip, and the browser is redirected back to the panel with `?auth=success` and a session cookie set.
- **Committed in:** `91952a2` (separate fix commit, made while resolving the checkpoint)

---

**Total deviations:** 5 auto-fixed (4 Rule 3 tooling/blocking issues during Tasks 1-2, 1 Rule 3 blocking issue surfaced by the Task 4 live-verification checkpoint)
**Impact on plan:** All fixes were necessary for the plan's own acceptance criteria (lint/build/test green, and — for the checkpoint fix — the OAuth+iframe round-trip actually completing). No scope creep; no architectural changes.

## Issues Encountered

None beyond the deviations documented above. Task 4's checkpoint pause was the plan's designed behavior (`type="checkpoint:human-verify" gate="blocking-human"`), not an unplanned issue.

## Checkpoint Result: Task 4 (human-verify) — APPROVED

The user completed the Onshape Developer Portal registration (OAuth application + Element-tab Extension + a Store entry subscribed to their personal account), populated `.env` with real credentials, and ran the dev stack behind an ngrok static domain (`https://laterigrade-usefully-milly.ngrok-free.dev`). In a real Onshape document ("1678 2019 - Buzz Lime-Year"):

- The CADChecker panel rendered as an Element tab inside the document view with no mixed-content or blocked-frame errors.
- The `applicationInit` postMessage handshake completed without any origin-rejection for legitimate Onshape messages.
- Clicking "Connect Onshape" completed the full OAuth2 authorization-code round-trip and redirected back to the panel with `?auth=success`, with a session established (session cookie set; no tokens observed in any response body).
- Verified in **Chrome**.

**Open item carried forward to Plan 03 (not a v1 limitation, not a plan-01 failure):** Safari third-party-cookie (ITP) behavior for the session cookie was **not yet tested**. This only matters once the panel makes an authenticated fetch from *inside* the iframe (the `/api/check` call), which does not exist until Plan 03. Per the plan's threat model (T-01-SC, disposition "accept (with disclosure)"), Plan 03 must explicitly test Safari's in-iframe session-cookie behavior when the `/api/check` fetch is wired, and record the result as either working or a documented v1 limitation — it must not be silently resolved by swapping token-storage strategy without surfacing it as a decision.

## User Setup Required

Onshape Developer Portal registration (OAuth application, Element-tab Extension, Store entry) and local `.env` population were required and completed by the user as part of the Task 4 checkpoint — see `user_setup` in `01-01-PLAN.md` frontmatter for the exact steps performed. No `01-01-USER-SETUP.md` was generated separately; the checkpoint's `how-to-verify` steps served this purpose.

## Next Phase Readiness

- CONN-01 is satisfied: OAuth2 connect + authorized panel render inside a real Onshape document tab, verified live.
- Server-side session (accessToken/refreshToken, httpOnly/Secure/SameSite=None) and the origin-validated postMessage handshake are in place and ready for Plan 02 (pure check core) and Plan 03 (wiring: typed client, 401 refresh, live `/api/check`, report/Reconnect UI).
- Plan 03 must pick up the Safari in-iframe session-cookie open item noted above before considering CONN-01/T-01-SC fully closed across browsers.
- Plan 02 (check-engine core: versioned config + occurrence-traversal + pluggable check engine) has no dependency on anything blocked by this plan and can proceed.

## Self-Check: PASSED

- All 3 task-commit hashes (`2770f57`, `873e54f`, `f5eb966`) and the deviation-fix commit (`91952a2`) verified present in `git log --oneline --all`.
- All 19 key files listed in `key-files.created` (plus the 2 deviation-modified files) verified present on disk via direct file-existence checks.
- `npx vitest run` executed: 1 test file, 3/3 tests passing (`/healthz` 200; `/auth/onshape` 302 with `state`; callback session cookie `HttpOnly`).
- No source code was re-implemented or modified during this close-out — this SUMMARY documents work already committed prior to this session.

---
*Phase: 01-connected-foundation-first-check*
*Completed: 2026-07-01*

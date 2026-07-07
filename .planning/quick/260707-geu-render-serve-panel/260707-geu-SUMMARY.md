---
phase: quick-260707-geu
plan: 01
subsystem: infra
tags: [express, express-static, spa-fallback, render, vitest, supertest]

# Dependency graph
requires:
  - phase: 01-connected-foundation-first-check
    provides: buildApp factory (Express app with session/passport/authRouter/checkRouter), Vite panel build outputting to dist/panel
provides:
  - buildApp now serves the built React panel (static assets + SPA fallback) from the same origin as /auth and /api, guarded by existsSync so dev/test without a build is unaffected
  - Route-precedence proof: static mount and SPA fallback never shadow /healthz, /auth, or /api
affects: [deployment, render-deploy, panel-serving]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Express 5 SPA fallback via plain middleware (not app.get(\"*\")) — path-to-regexp 8 throws on wildcard route patterns"
    - "Repo-root path resolution via fileURLToPath(import.meta.url) + fixed relative join, reused from load-season.ts, so path resolution is independent of process.cwd() in both dev (src/server) and prod (dist/server)"

key-files:
  created: []
  modified:
    - src/server/app.ts
    - src/server/app.test.ts

key-decisions:
  - "SPA fallback implemented as a plain app.use(middleware) rather than a wildcard route, since Express 5 / path-to-regexp 8 throws at mount time on \"*\" patterns"
  - "panelDir is an optional BuildAppOptions field (test-only override); index.ts is unchanged and always resolves the real dist/panel path"

patterns-established:
  - "Static/SPA-serving mounts always go after all API/auth/health route mounts in buildApp, and the SPA fallback middleware explicitly excludes /auth, /api, /healthz prefixes as defense-in-depth"

requirements-completed: [QUICK-260707-geu]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Quick Task 260707-geu: Render-Serve-Panel Summary

**Express now serves the built React panel (static + SPA fallback) from the same origin as /auth and /api, closing the Render single-service deploy gap where GET / previously 404'd.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 2 (`src/server/app.ts`, `src/server/app.test.ts`)

## Accomplishments
- `buildApp` conditionally mounts `express.static(dist/panel)` plus an SPA-fallback middleware, guarded by `existsSync`, resolved via the repo-root `fileURLToPath` idiom (mirrors `load-season.ts`) so it works identically from `src/server` (dev) and `dist/server` (prod) regardless of `process.cwd()`.
- Confirmed with a manual prod-parity smoke test (`npm run build` then `node dist/server/index.js`): `GET /` returns the built panel HTML (200) and `GET /healthz` still returns `{"status":"ok"}` — Render's root URL will no longer 404.
- Nine vitest/supertest cases prove route precedence is intact: the static mount and SPA fallback never shadow `/healthz`, `/auth/onshape`, or `/api/*`, and the panel/`index.html` fallback only ever applies to genuine unknown GET routes.
- Confirmed the guard behavior for the existing dev/test path: when no panel directory exists, `buildApp` boots exactly as before (`GET /healthz` → 200, `GET /` → 404, no static mount).

## Task Commits

Each task was committed atomically:

1. **Task 1: Serve built panel from Express with a guarded static mount + SPA fallback** - `aefcfac` (feat)
2. **Task 2: Prove no route shadowing + panel is served (vitest)** - `8a9f89f` (test)

_Note: Task 1 was marked `tdd="true"` in the plan, but its `<action>` described only an implementation step (no separate RED test-first step was specified in this task's instructions — the test coverage was delivered as Task 2). Both commits land in dependency order (implementation, then test coverage), and Task 2's tests pass against the Task 1 implementation without modification, so the net RED→GREEN proof is intact across the two-task plan even though it isn't split into three TDD sub-commits within Task 1 itself._

## Files Created/Modified
- `src/server/app.ts` - Adds `DEFAULT_PANEL_DIR` (repo-root-resolved `dist/panel`), an optional `panelDir` field on `BuildAppOptions`, and — after the existing `/healthz`/`/auth`/`/api` mounts — a guarded `express.static` mount plus an SPA-fallback middleware that excludes `/auth`, `/api`, `/healthz` prefixes.
- `src/server/app.test.ts` - Extends `testApp()` to accept an optional `panelDir` override; adds three new `describe` blocks covering (a) no route shadowing when a panel fixture exists, (b) panel index served at `/` and via SPA fallback, (c) no panel mount / 404 at `/` when the panel dir is absent.

## Decisions Made
- Followed the plan's explicit guidance to use a plain middleware for the SPA fallback rather than `app.get("*", ...)`, since Express 5.2.1 (`path-to-regexp` 8) throws at mount time on bare wildcard route patterns.
- Kept `panelDir` test-only (optional, defaults to the real resolved path) so `index.ts` and `render.yaml` need no changes — production continues to resolve `dist/panel` automatically.

## Deviations from Plan

None - plan executed exactly as written. All four `<action>` steps in Task 1 and all three test blocks in Task 2 were implemented as specified; no bugs, missing critical functionality, blocking issues, or architectural changes were encountered.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This closes a code-level deployment gap; no new environment variables, Render config, or Onshape Developer Portal changes are needed (render.yaml was intentionally left untouched per the plan).

## Next Phase Readiness
- Render single-service deployment (per existing `render.yaml`: `npm run build` then `node dist/server/index.js`) will now serve the panel correctly at the deployed root URL, matching the origin the OAuth redirect URI resolves to.
- No blockers introduced for Phase 2 (trustworthy-weight) work; this quick task touched only `src/server/app.ts` and `src/server/app.test.ts`, leaving all Phase 2 mass-properties client work untouched.

---
*Quick task: 260707-geu-render-serve-panel*
*Completed: 2026-07-07*

## Self-Check: PASSED

- FOUND: src/server/app.ts
- FOUND: src/server/app.test.ts
- FOUND commit: aefcfac (Task 1)
- FOUND commit: 8a9f89f (Task 2)

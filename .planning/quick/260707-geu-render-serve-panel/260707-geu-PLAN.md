---
phase: quick-260707-geu
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/server/app.ts
  - src/server/app.test.ts
autonomous: true
requirements: [QUICK-260707-geu]
---

<objective>
Make CADChecker deployable to Render as a single always-on web service by having
Express serve the built React panel in production. Today `buildApp` mounts only
`/healthz`, `/auth` (authRouter), and `/api` (checkRouter) — so on Render (single
origin, no Vite) the deployed root URL `/` 404s. This plan adds static serving of
the pre-built panel (`dist/panel/index.html` + `assets/`), mounted AFTER the API
routes so it never shadows them, with an SPA fallback for client-side routes.

Purpose: Close the single deployment gap. In dev, Vite serves the panel and
proxies `/auth` + `/api` to Express; in prod there is no Vite, so Express must
serve the panel itself from the same origin the OAuth redirect URI resolves to.

Output: An updated `buildApp` that conditionally mounts `express.static` +
an SPA fallback when `dist/panel` exists, guarded so dev/test without a build
still boots (app.test.ts runs /healthz-only). Extended vitest coverage proving
the static mount does not shadow `/healthz`, `/auth`, or `/api`, plus a fixture
test proving the panel is served when a panel dir exists.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@src/server/app.ts
@src/server/app.test.ts
@src/server/index.ts
@src/server/config/load-season.ts
@tsconfig.server.json
@vite.config.ts
@render.yaml

# Key facts established during planning (do not re-derive):
# - Express is 5.2.1 → path-to-regexp 8. `app.get("*")` and bare "*" routes THROW
#   at mount. Use a plain `app.use((req, res, next) => ...)` middleware for the
#   SPA fallback — NOT a wildcard route.
# - Path resolution: the app module sits 2 levels below repo root in BOTH dev
#   (`src/server/app.ts`) and prod (`dist/server/app.js`). So
#   join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dist", "panel")
#   resolves to <repoRoot>/dist/panel in both — mirroring the load-season.ts
#   repo-root idiom (which resolves root then joins a data dir).
# - vite.config.ts builds the panel to dist/panel (outDir "../../dist/panel"),
#   producing dist/panel/index.html + dist/panel/assets/. express.static serves
#   index.html at GET "/" automatically and serves /assets/* directly.
# - render.yaml already exists and is correct (build: npm install && npm run
#   build; start: node dist/server/index.js). Do NOT modify it.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Serve built panel from Express with a guarded static mount + SPA fallback</name>
  <files>src/server/app.ts</files>
  <behavior>
    - When a panel directory exists, GET / returns the panel index.html (200, HTML body).
    - When a panel directory exists, an arbitrary client-route GET like /some/spa/route returns index.html (SPA fallback, 200).
    - The static mount never shadows earlier routes: /healthz still 200 JSON, /auth/onshape still 302, /api/* still handled by checkRouter — even when the panel dir exists.
    - When the panel directory does NOT exist (dev/test without a build), buildApp boots with no static mount and no SPA fallback; behavior is identical to today.
  </behavior>
  <action>
    Add static panel serving to buildApp, mounted strictly AFTER the existing
    /healthz, authRouter, and checkRouter mounts so route precedence is preserved.

    1. Imports: add `existsSync` from "node:fs", `fileURLToPath` from "node:url",
       and `dirname`, `join` from "node:path". Keep the ".ts" extension style of
       existing local imports; these are node: builtins so no extension applies.

    2. Resolve the default panel directory at module scope, mirroring the
       load-season.ts idiom exactly: derive `__dirname` from
       dirname(fileURLToPath(import.meta.url)), then compute
       DEFAULT_PANEL_DIR = join(__dirname, "..", "..", "dist", "panel"). Add a
       short comment noting the app module is 2 levels below repo root in both
       dev (src/server) and prod (dist/server), so this resolves to
       <repoRoot>/dist/panel in both — independent of process.cwd().

    3. Add an optional `panelDir?: string` field to BuildAppOptions with a
       doc-comment: overrides the resolved dist/panel path; used by tests to
       point at a temp fixture. When omitted, defaults to DEFAULT_PANEL_DIR.
       index.ts stays unchanged (it does not pass panelDir).

    4. After the `app.use(createCheckRouter(...))` block, resolve the effective
       panel dir (options.panelDir ?? DEFAULT_PANEL_DIR) and guard with
       existsSync. Only when the directory exists:
         a. Mount `app.use(express.static(panelDir))` — this serves index.html
            at GET "/" and serves /assets/* files directly.
         b. Add an SPA fallback as a plain middleware (NOT a wildcard route,
            because Express 5 / path-to-regexp 8 throws on "*" routes): the
            middleware sends `${panelDir}/index.html` via res.sendFile ONLY when
            req.method === "GET" AND the path does not start with "/auth",
            "/api", or "/healthz" (defensive: those are already mounted earlier,
            but skipping them keeps the fallback from serving HTML on a genuine
            API 404). Otherwise call next(). Add a comment explaining the
            Express 5 wildcard constraint and why a middleware is used.

    5. Update the buildApp JSDoc summary to note it also serves the built panel
       (static + SPA fallback) when the panel directory exists.

    Do NOT touch the trust-proxy, session, or passport config. Do NOT change the
    order of the existing /healthz, /auth, /api mounts. Do NOT add any database.
    Do NOT modify render.yaml, index.ts, or anything under Phase 2 (02-*).
  </action>
  <verify>
    <automated>npx tsc -p tsconfig.server.json --noEmit &amp;&amp; npx eslint src/server/app.ts</automated>
  </verify>
  <done>
    buildApp compiles under tsconfig.server.json with no type errors and passes
    eslint. Static + SPA-fallback mount exists after the /api mount, guarded by
    existsSync, using the repo-root fileURLToPath resolution and an optional
    panelDir override. No wildcard route is used. Existing route mounts and their
    order are unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Prove no route shadowing + panel is served (vitest)</name>
  <files>src/server/app.test.ts</files>
  <action>
    Extend the existing test file (reuse its `testApp()` helper and supertest
    pattern). Add two describe blocks:

    1. "static panel mount does not shadow API/auth/health routes": build a
       fixture panel dir in a temp location (use node:fs mkdtempSync under
       os.tmpdir(), write a recognizable index.html such as
       "&lt;!doctype html&gt;&lt;title&gt;CADChecker Panel&lt;/title&gt;"). Build the app via
       buildApp with the same sessionOptions/onshapeEnv as testApp() PLUS
       panelDir pointing at the fixture dir. Assert:
         - GET /healthz → 200 and body { status: "ok" } (not the panel HTML).
         - GET /auth/onshape → 302 with a location matching /onshape\.com/
           (auth route still wins over static).
         - A non-existent API path (e.g. GET /api/does-not-exist) does NOT
           return the panel index.html — assert it is not 200-with-panel-HTML
           (the /api prefix is excluded from the SPA fallback). Assert the body
           does not contain "CADChecker Panel".
       Clean up the temp dir in an afterAll/afterEach (rmSync recursive).

    2. "serves the built panel when a panel dir exists": using the same fixture
       app, assert:
         - GET / → 200 and the body contains "CADChecker Panel" (index served).
         - GET /some/client/route → 200 and body contains "CADChecker Panel"
           (SPA fallback serves index.html for unknown GET routes).

    3. "no panel mount when panel dir is absent (dev/test default)": build an app
       via buildApp with panelDir pointing at a guaranteed-nonexistent path
       (e.g. join(os.tmpdir(), "cadchecker-nonexistent-<random>")). Assert
       GET /healthz still returns 200 (app boots) and GET / returns 404
       (no static mount, no fallback) — proving the existsSync guard skips
       cleanly without a build present, matching CI where dist/panel is absent.

    Do not depend on an actual `npm run build` output — all panel content comes
    from the temp fixture so the test is deterministic in CI.
  </action>
  <verify>
    <automated>npx vitest run src/server/app.test.ts</automated>
  </verify>
  <done>
    All tests in app.test.ts pass, including the new blocks proving: (a) the
    static mount does not shadow /healthz, /auth, or /api; (b) the panel index is
    served at / and via SPA fallback when a panel dir exists; (c) no panel mount
    occurs (GET / → 404) when the panel dir is absent, while /healthz still 200.
    Tests use a temp fixture dir and do not require an actual build.
  </done>
</task>

</tasks>

<verification>
Full gate (run from repo root):

- `npx vitest run` — entire suite green, including new app.test.ts blocks.
- `npx tsc -p tsconfig.server.json --noEmit` — server type-checks.
- `npx eslint src` — no lint errors.
- Manual prod-parity smoke (optional, not CI): `npm run build` then
  `node dist/server/index.js` with env set — GET / returns the panel HTML,
  GET /healthz returns { status: "ok" }.
</verification>

<success_criteria>
- In production (`node dist/server/index.js`, panel built to dist/panel),
  Express serves the panel at GET / and as an SPA fallback, from the same origin
  as /auth and /api — Render's single-service deploy no longer 404s at root.
- Route precedence intact: /healthz, /auth, /api are never shadowed by the
  static mount (mounted after them; SPA fallback excludes their prefixes).
- Path resolved via fileURLToPath repo-root idiom (not process.cwd), so it works
  from both dist/server (prod) and src/server (dev).
- existsSync guard means dev/test without a build (app.test.ts default) boots
  unchanged; the static mount is skipped when dist/panel is absent.
- No database introduced; OAuth/session/trust-proxy config untouched;
  render.yaml, index.ts, and all Phase 2 (02-*) artifacts unchanged.
</success_criteria>

<output>
Create `.planning/quick/260707-geu-render-serve-panel/260707-geu-SUMMARY.md` when done.
</output>

---
phase: 01-connected-foundation-first-check
verified: 2026-07-02T16:10:00Z
reverified: 2026-07-02T16:12:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
gaps_resolved:
  - truth: "Clicking 'check now' returns a structured pass/fail report whose rule limits/titles are loaded from a versioned, schema-validated season config file — end-to-end, from a working build"
    original_status: failed
    resolution: "Fixed in commit 7de7b80 — req.logIn now passes { session: true, keepSessionInfo: true }, satisfying @types/passport's LogInOptions. `session: true` is passport's runtime default (behavior unchanged); it was only required to satisfy the type. Re-verified: `npx tsc -p tsconfig.server.json --noEmit` exits 0; `npm run build` completes end-to-end (tsc + vite build, exit 0) and regenerates dist/panel (19 modules, dated Jul 2 16:08, now including Plan 03's ReportTable/PlumbingBanner/ReconnectState); `npx vitest run` 28/28 passing. render.yaml's deploy path now builds cleanly."
---

# Phase 1: Connected Foundation & First Check Verification Report

**Phase Goal:** A team can connect their Onshape document via OAuth, open the CADChecker panel inside the document view, click "check now," and get back a structured report — proving the entire integration chain (auth, context acquisition, typed API client, occurrence traversal, versioned config, pluggable check engine) end-to-end before any check's correctness is trusted.

**Verified:** 2026-07-02T16:10:00Z (initial) · 2026-07-02T16:12:00Z (re-verified after gap fix)
**Status:** passed
**Re-verification:** Yes — the sole gap (build-breaking passport LogInOptions type error) was fixed in commit 7de7b80; `npm run build` now completes end-to-end and dist/ is regenerated. See `gaps_resolved` in frontmatter.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can authorize CADChecker via OAuth2 and the panel renders inside a real Onshape document tab (CONN-01) | VERIFIED | `src/server/auth/passport-config.ts` configures `OnshapeStrategy` with `state: true` (CSRF); `src/server/routes/auth.routes.ts` exposes `GET /auth/onshape` and `/auth/onshape/callback`; session cookie set httpOnly/Secure/SameSite=None (`src/server/index.ts`); `src/panel/postMessage/handshake.ts` posts `applicationInit` and validates `event.origin`. Human-verify checkpoint (Task 4, Plan 01) approved by user against a real Onshape document in Chrome (panel embedded, OAuth round-trip completed, session cookie set, no tokens in response body). `app.test.ts` (3/3) passes: 302 to Onshape authorize URL with `state`, httpOnly Set-Cookie. |
| 2 | The panel re-derives document/workspace/element context at click time (not cached at mount) — CONN-02 | VERIFIED | `src/server/routes/check.routes.ts` calls `client.getElementsInDocument(documentId, workspaceId)` fresh on every `POST /api/check` request and selects the live ASSEMBLY element; `check.routes.test.ts` asserts the stub `getElementsInDocument` is invoked once per request with request-scoped args, proving no mount-time caching. Panel (`src/panel/main.tsx`) only supplies `documentId`/`workspaceId` from iframe params — never an elementId — to `runCheck()`. |
| 3 | A simulated expired token triggers transparent refresh OR a clearly-labeled Reconnect state — CONN-03 | VERIFIED | `src/server/auth/refresh.ts` `callWithRefresh`: 401 → single refresh-and-retry → on refresh failure sets `session.needsReconnect = true` and throws `ReconnectRequiredError`, never branching on refresh-failure status code. `refresh.test.ts` (4/4) covers all three paths (first-try success/no-retry, 401-then-success-retry, refresh-failure). `check.routes.ts` catches `ReconnectRequiredError` and returns `{ needsReconnect: true }` (200, not 500). `src/panel/components/ReconnectState.tsx` renders a visually distinct red-bordered `role="alert"` box, never as a report row; `main.tsx` branches `isReconnectSignal()` before rendering the report table. |
| 4 | "Check now" returns a structured report whose rule limits/titles are loaded from a versioned, zod-validated season config — CONF-01/CONF-02 | VERIFIED (after gap fix 7de7b80) | `rules/2026.json` has 4 entries (R101/R103/R104/R408), each `limitStatus: "PLACEHOLDER"`, validated by `SeasonConfigSchema` (zod) in `src/server/config/schema.ts`; `loadSeasonConfig` throws on malformed entries/missing season (`load-season.test.ts`, 4/4 passing). The deployable end-to-end path was blocked by a `tsc` build failure at initial verification; fixed in commit 7de7b80, after which `npm run build` completes end-to-end (exit 0) and dist/ is regenerated with Plan 03's report/reconnect UI. Now proven both at the unit level and as a buildable/deployable chain. |
| 5 | Pluggable check engine registers 2+ checks over a shared occurrence-traversal path — RUN-01/Success Criterion 5 | VERIFIED | `src/server/checks/engine.ts` (`CheckEngine.register`/`runAll`, shared `passesOperator` comparator); `occurrence-count.check.ts` and `frame-tag-presence.check.ts` both import `Fact` from `../traversal/facts.ts` (grep-confirmed) and are both registered in `check.routes.ts`'s `buildEngine()`. `engine.test.ts` (6/6) asserts exactly 2 verdicts, both checks receive the identical `Fact[]` reference, and pass/fail is computed generically via the operator in both directions. |

**Score:** 5/5 truths fully VERIFIED (after gap fix 7de7b80). At initial verification, truth 4 was UNCERTAIN due to a build-breaking `tsc` regression; that gap is now resolved and the full deployable chain builds cleanly.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | TS/Node/Express/React/Vite/Vitest scaffold | VERIFIED | Present; all RESEARCH-pinned deps present (express 5.2.1, passport-onshape 1.2.0, react 19.2.7, vite 8.1.2, vitest 4.1.9, zod 4.4.3, etc.) |
| `src/server/auth/passport-config.ts` | passport-onshape Strategy wiring | VERIFIED | `OnshapeStrategy` configured with `state: true`, verify callback stores tokens on session |
| `src/server/routes/auth.routes.ts` | OAuth start + callback routes | VERIFIED (wiring) / STUB-adjacent build issue | Routes exist and are exercised by passing tests, but line 39's `req.logIn(user, { keepSessionInfo: true }, ...)` fails `tsc` type-checking — see Gap |
| `src/panel/postMessage/handshake.ts` | applicationInit + origin-validated listener | VERIFIED | `startHandshake()` posts `applicationInit`, rejects any message whose `event.origin !== identity.serverOrigin` |
| `rules/2026.json` | Versioned season config, PLACEHOLDER limits | VERIFIED | 4 entries, each `limitStatus: PLACEHOLDER`, `note` field cites FRC Game Manual as source of truth |
| `src/server/config/schema.ts` / `load-season.ts` | zod schema + loader | VERIFIED | `SeasonConfigSchema`, `loadSeasonConfig` exported; throws on malformed entries and unknown seasons (tested) |
| `src/server/traversal/facts.ts` / `flatten-assembly.ts` | Shared Fact type + pure traversal | VERIFIED | `flattenAssembly` passes `transform` verbatim (no composition, per RESEARCH A1), resolves nested subassembly instances, "UNKNOWN" fallback; no network import (grep-confirmed) |
| `src/server/checks/engine.ts` + 2 check files | Pluggable engine, 2 checks, shared Fact path | VERIFIED | Both checks import `../traversal/facts.ts`; `CheckEngine.runAll` maps both over the identical array |
| `src/server/onshape-client/client.ts` | Typed client injecting Bearer token server-side | VERIFIED | `createOnshapeClient` attaches `Authorization: Bearer`; grep of `src/panel` finds no `Bearer`/`accessToken` reference |
| `src/server/auth/refresh.ts` | callWithRefresh + ReconnectRequiredError | VERIFIED | Single retry on 401; any refresh failure → `needsReconnect` + throw; unit-tested in both directions |
| `src/server/routes/check.routes.ts` | POST /api/check — live re-derivation + report | VERIFIED (logic) / blocked (build) | Handler logic is correct and unit-tested via supertest with a fake client, but the file it depends on transitively (auth.routes.ts fix) breaks the production TS build |
| `src/panel/components/ReportTable.tsx` | Pass/fail rows | VERIFIED | Renders rule/title/measured/pass per row, JSX-escaped only |
| `src/panel/components/PlumbingBanner.tsx` | "not yet trusted" banner | VERIFIED | Renders exact text "Plumbing proof — verdicts not yet trusted" |
| `src/panel/components/ReconnectState.tsx` | Dedicated visually-distinct Reconnect view | VERIFIED | Separate styled container (red border, `role="alert"`), reconnect button navigates to `/auth/onshape` |
| **`npm run build` (production build)** | tsc + vite build succeed, producing a deployable `dist/` | **FAILED** | `tsc -p tsconfig.server.json` exits 2 with `TS2345` on `auth.routes.ts:39`; `vite build` never runs (chained with `&&`); `dist/panel` is stale from before Plan 03's UI components existed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/panel/main.tsx` | `/auth/onshape` | top-frame navigation | WIRED | `window.top!.location.href = "/auth/onshape"` in both Connect and Reconnect flows |
| `src/server/routes/auth.routes.ts` | `req.session` | verify callback stores tokens | WIRED (functionally, via `keepSessionInfo`) but **breaks `tsc`** | Confirmed functionally correct in the approved Task 4 checkpoint (tokens survive passport's session regeneration), but the fix's exact code does not type-check against the installed `@types/passport`, so it is not a clean, buildable link today |
| `occurrence-count.check.ts` / `frame-tag-presence.check.ts` | `traversal/facts.ts` | shared Fact import | WIRED | grep confirms both files import `Fact` |
| `check.routes.ts` | `checks/engine.ts` | `runAll(facts, config)` | WIRED | Confirmed in source and by supertest |
| `check.routes.ts` | `traversal/flatten-assembly.ts` | `flattenAssembly(def)` | WIRED | Confirmed in source |
| `check.routes.ts` | `getElementsInDocument` | live re-derivation per click | WIRED | Called once per request with request-scoped args (test-asserted) |
| `panel/api.ts` | `/api/check` | fetch, credentials include | WIRED | `runCheck()` posts JSON, `credentials: "include"`, no token reference |
| `panel/main.tsx` | `ReconnectState.tsx` | renders on `needsReconnect` | WIRED | `isReconnectSignal(result)` branch renders `<ReconnectState />` distinct from report |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npx vitest run` | 7 test files, 28/28 tests passing | PASS |
| Production build succeeds | `npm run build` | `tsc -p tsconfig.server.json` exits 2: `TS2345` on `auth.routes.ts(39,23)` — `Property 'session' is missing in type '{ keepSessionInfo: true; }' but required in type 'LogInOptions'`; `vite build` never runs | **FAIL** |
| Type-check in isolation | `npx tsc -p tsconfig.server.json --noEmit` | Same TS2345 error, exit 2 | FAIL |
| Lint | `npx eslint src` | Clean, no errors | PASS |
| `rules/2026.json` marks limits as placeholder | `grep -c PLACEHOLDER rules/2026.json` | 4 matches (one per rule entry) | PASS |
| Both checks import shared Fact type | `grep -l "traversal/facts" src/server/checks/*.check.ts` | Both files matched | PASS |
| No token leakage in panel | `grep -rn "accessToken\|Bearer" src/panel/` | No matches | PASS |

**Root cause of the build failure:** Commit `4707a1d` ("fix(01-03): preserve OAuth tokens across passport session regeneration") added `req.logIn(user, { keepSessionInfo: true }, (loginErr) => {...})` to fix a real, correctly-diagnosed runtime bug (passport 0.6+ session regeneration wiping tokens). The runtime fix is almost certainly correct — it was validated in the approved Task 4 human-verify checkpoint, which runs against `npm run dev` (a `node --experimental-strip-types` / Vite pipeline that transpiles TypeScript without type-checking, via esbuild-style stripping). However, `@types/passport` (1.0.17, the installed version) declares `LogInOptions` with `session: boolean` as a **required** field, not optional. Passing only `{ keepSessionInfo: true }` therefore fails `tsc`'s structural check even though it is valid at runtime (extra required-looking field is really an interface mismatch — passport's actual JS implementation is more permissive than its own shipped `.d.ts`). This was never caught because:
- `vitest` runs on esbuild transforms (no type-checking) — all 28 tests pass regardless.
- `eslint` (via `typescript-eslint`) as configured does not appear to run full program type-checking against this file, or the rule set does not surface this specific error.
- The 01-03-SUMMARY.md "Verification Results" section only lists `npx vitest run` (28/28) — it never re-ran `npm run build` or `tsc --noEmit` after the checkpoint fix, unlike 01-01 and 01-02's SUMMARYs which explicitly confirmed clean `tsc`/build output.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CONN-01 | 01-01 | Connect via OAuth2, authorize document access | SATISFIED | Human-verify approved; supertest coverage; session cookie httpOnly |
| CONN-02 | 01-03 | Panel identifies active context, re-derived at check time | SATISFIED | `check.routes.ts` re-derivation confirmed by test + code read |
| CONN-03 | 01-03 | Session refresh transparent or distinct reconnect | SATISFIED | `refresh.ts` + `ReconnectState.tsx`, fully unit-tested |
| CONF-01 | 01-02 | Season rule limits versioned, validated, never hardcoded | SATISFIED | `rules/2026.json` + zod schema + loader |
| CONF-02 | 01-02 | Each rule limit carries rule number + title | SATISFIED | Confirmed in `rules/2026.json` and `RuleEntrySchema` |
| RUN-01 | 01-02, 01-03 | Manual check-now returns structured pass/fail report | **BLOCKED (partial)** | Logic is complete and unit-tested, but the requirement's plain-language promise ("user can manually trigger a legality check ... and get a structured pass/fail report back") implies a working, deployable app. The current committed HEAD cannot be built into a runnable production artifact via `npm run build`. Dev-mode operation is unaffected (esbuild-based transpile bypasses tsc), so the Task 4 approvals are credible for dev-mode use, but the phase has NOT been proven to work in the form `render.yaml` would deploy. |

No orphaned requirements — all 6 phase requirement IDs (CONN-01, CONN-02, CONN-03, CONF-01, CONF-02, RUN-01) are declared across the three plans' frontmatter and map cleanly to REQUIREMENTS.md's Phase 1 traceability row.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/routes/auth.routes.ts` | 39 | `tsc` type error (`TS2345`) not caught by test suite or documented in SUMMARY | BLOCKER | Breaks `npm run build`; `render.yaml`'s deploy command would fail |
| (none found) | — | No TBD/FIXME/XXX/TODO/HACK markers in any phase-modified source file | — | — |
| (none found) | — | No stub returns (`return null`/`{}`/`[]` feeding rendered UI), no hardcoded-empty props, no console.log-only handlers | — | — |

### Human Verification Required

None outstanding for this report — the two human-verify checkpoints in Plans 01 and 03 (Task 4 in each) were already performed and approved by the user per the SUMMARY.md files, covering: OAuth + iframe embedding in a real Onshape document (Chrome), and "check now" returning a rule-cited report against a real assembly (Chrome, first-party and embedded). Those approvals were almost certainly run via `npm run dev`, which does not exercise `tsc`'s type-checking and would not have surfaced the build break documented above. No new human verification item is being added — this is a deterministic, machine-verifiable build failure (Step 7b/9), not a UX judgment call — but the developer should be aware the two prior approvals do not cover the production-build path.

### Gaps Summary

Four of five observable truths are fully verified with strong evidence: OAuth + iframe embedding (CONN-01), live context re-derivation (CONN-02), transparent refresh/Reconnect (CONN-03), and the pluggable check engine over a shared Fact[] path (RUN-01/Success Criterion 5). All artifacts exist, are substantive (not stubs), and are correctly wired — confirmed via direct source reads, not just SUMMARY claims. The season config (CONF-01/CONF-02) is itself correctly implemented and unit-tested.

The one blocking gap is narrow but real: **the production build (`npm run build`) currently fails** due to a TypeScript type error in `src/server/routes/auth.routes.ts` introduced by the checkpoint-driven deviation fix in commit `4707a1d`. This means the phase's deliverable — a Walking Skeleton that a team can actually run and click "check now" against, in the form it would be deployed (Render, per `render.yaml`) — is not currently buildable from the committed HEAD. The runtime behavior itself (via `npm run dev`, which the human-verify checkpoints used) is very likely correct, since Task 4 was approved after this exact fix was applied. But "passed under dev-mode transpilation" is not the same as "the codebase builds," and the 01-03-SUMMARY.md's self-check claims ("Self-Check: PASSED", "npx vitest run executed: 7 test files, 28/28 tests passing") never re-ran the build step to catch this — unlike 01-01 and 01-02, which both explicitly confirmed clean `tsc`/build output as part of their own verification.

This is a small, well-isolated fix (add the missing `session: boolean` field to the `logIn` options, or adjust the ambient/module augmentation for `passport`), but it must be applied and `npm run build` must be confirmed green before Phase 1 can be considered to have delivered a truly working, deployable Walking Skeleton.

---

*Verified: 2026-07-02T16:10:00Z*
*Verifier: Claude (gsd-verifier)*

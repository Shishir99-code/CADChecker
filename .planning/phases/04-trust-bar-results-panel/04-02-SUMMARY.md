---
phase: 04-trust-bar-results-panel
plan: 02
subsystem: ui
tags: [onshape-api, express, react, disclosure, trust]

# Dependency graph
requires:
  - phase: 04-trust-bar-results-panel
    plan: 01
    provides: 5 honest verdicts (MAT-AUDIT/R103/R408/R101/R104), no plumbing banner, trust-positioned panel
provides:
  - "OnshapeClient.getDocument(documentId) typed client method + DocumentInfo alias"
  - "measuredContext grown with documentName/tabName/configurationName/checkedAt, atomic with verdicts"
  - "DisclosureHeader.tsx panel component rendering the four disclosure fields"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getDocument uses the clean-200 client.GET idiom (operation declares an explicit 200 response), matching getElementsInDocument -- not the raw-fetch-cast idiom used by the other 4 client methods"
    - "Best-effort try/catch enrichment idiom (ReconnectRequiredError + 401 OnshapeApiError propagate, everything else swallowed) now applied a 4th time (3b, document-name resolution), matching 5b/5c/5d"
    - "Single-object-literal atomic response grown in place -- no await between measuredContext field assembly and res.json()"

key-files:
  created:
    - src/panel/components/DisclosureHeader.tsx
  modified:
    - src/server/onshape-client/client.ts
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts
    - src/panel/api.ts
    - src/panel/main.tsx

key-decisions:
  - "configurationName is a hardcoded 'Default' constant (DEFAULT_CONFIGURATION_NAME), not resolved via any API call -- no code path in this repo ever selects/applies a named Onshape Configuration; matches the wording already shipped in frame-perimeter.check.ts/starting-height.check.ts caveat strings"
  - "documentName resolution placed at step 3b (right after assembly/elementId derivation), independent of and before the 5b/5c/5d enrichment blocks -- grouped with other name/id resolution per PATTERNS.md guidance"
  - "DisclosureHeader renders as the FIRST child inside main.tsx's existing atomic 'report' branch, sibling of ReportTable -- no new state machine, reusing the already-correct clear-then-show-fresh discipline for SC4/D-03"

patterns-established:
  - "DisclosureHeader.tsx: falls back to raw documentId/elementId when documentName/tabName is undefined, renders checkedAt via new Date(...).toLocaleString(), inline style={{...}} objects only (no CSS framework), JSX text interpolation only (no dangerouslySetInnerHTML)"

requirements-completed: [RSLT-03]

# Metrics
duration: ~25min
completed: 2026-07-12
---

# Phase 4 Plan 2: Measured-Against Disclosure Header Summary

**Added one new typed `getDocument` client call, grew the server's atomic `measuredContext` response object with documentName/tabName/configurationName/checkedAt, and rendered a new `DisclosureHeader` component above the verdict table so every check run states what it was measured against.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-12T22:51Z (approx)
- **Completed:** 2026-07-12T22:53Z
- **Tasks:** 2 (Task 1 is TDD: RED + GREEN commits; Task 2 is a single auto commit)
- **Files modified:** 6 (5 modified, 1 created)

## Accomplishments

- `OnshapeClient.getDocument(documentId)` added using the "clean-200" `client.GET(...)` idiom (the `getDocument` operation declares an explicit `200` response in the vendored OpenAPI types, same shape as the existing `getElementsInDocument`) — not the raw-fetch-cast idiom used by the client's other four methods. New `DocumentInfo` type alias (`components["schemas"]["BTDocumentInfo"]`).
- `check.routes.ts` resolves the document display name via a new best-effort step (3b): `ReconnectRequiredError` and a 401 `OnshapeApiError` propagate (a broken session is never hidden); any other failure leaves `documentName` undefined and the response still returns 200 — a failed naming lookup never fails the whole check.
- `measuredContext` grew from 3 to 7 fields (`documentId`, `workspaceId`, `elementId`, `documentName`, `tabName`, `configurationName`, `checkedAt`), all assembled in the SAME `res.status(200).json({...})` object literal as `verdicts` — no `await` appears between field assembly and send, so the response is atomic by construction (SC4/D-03).
- `tabName` is free (`assembly.name`, already resolved at the existing `elements.find(ASSEMBLY)` step); `configurationName` is a new `DEFAULT_CONFIGURATION_NAME = "Default"` constant (zero API calls — no code path in this repo ever resolves a named Onshape Configuration); `checkedAt` is a `new Date().toISOString()` stamp taken once, inside the response literal.
- `CheckReportContext` (panel-side type) grew to mirror the server shape exactly, with a doc comment noting the four disclosure fields are never recomputed client-side.
- New `src/panel/components/DisclosureHeader.tsx`: renders "Measured against: Document / Tab / Configuration / Checked at" using inline `style={{...}}` objects only (no CSS framework, matching `ReportTable.tsx`/`ReconnectState.tsx`), falls back to the raw `documentId`/`elementId` when a name is undefined, renders `checkedAt` via `toLocaleString()`, and uses plain JSX text interpolation (no `dangerouslySetInnerHTML`).
- `main.tsx` renders `<DisclosureHeader>` as the first child inside the existing atomic `report` branch, immediately before `<ReportTable>` — no restructuring of the `checkState` discriminated union; the existing `loading` branch already unmounts the old report first, which is the entire SC4 atomicity guarantee on the client side.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: add failing measuredContext disclosure assertions** - `93136c3` (test)
2. **Task 1 GREEN: resolve and disclose document/tab/config/timestamp server-side** - `5d3438d` (feat)
3. **Task 2: render the measured-against disclosure header in the panel** - `b05c423` (feat)

_TDD Task 1 has two commits (test -> feat); no REFACTOR commit was needed (implementation matched the RESEARCH/PATTERNS idiom exactly on first pass)._

## TDD Gate Compliance

RED gate (`test(...)` commit `93136c3`) precedes GREEN gate (`feat(...)` commit `5d3438d`) in git log — both present, sequence correct.

## Files Created/Modified

- `src/server/onshape-client/client.ts` - `getDocument(documentId)` method (clean-200 idiom) + `DocumentInfo` type alias
- `src/server/routes/check.routes.ts` - `DEFAULT_CONFIGURATION_NAME` constant, step 3b best-effort `getDocument` call, `measuredContext` grown to 7 fields in the same atomic response literal
- `src/server/routes/check.routes.test.ts` - `stubGetDocument()` factory threaded into all 5 response-assembly `buildTestApp(...)` call-sites; primary success test's `measuredContext` assertion grown to include the 4 new fields
- `src/panel/api.ts` - `CheckReportContext` grown with `documentName?`/`tabName?`/`configurationName`/`checkedAt`
- `src/panel/components/DisclosureHeader.tsx` - new component (created)
- `src/panel/main.tsx` - imports and renders `<DisclosureHeader>` inside the `report` branch

## Decisions Made

- Followed 04-PATTERNS.md/04-RESEARCH.md's exact prescribed idioms throughout (clean-200 client call, 3b try/catch shape, single-object-literal response growth, `DEFAULT_CONFIGURATION_NAME` constant placement) — no deviations from the documented approach were needed.
- `documentName` resolution (3b) placed right after assembly/elementId derivation and before `getAssemblyDefinition`, keeping all identity/name resolution grouped together at the top of the handler, ahead of the heavier 5b/5c/5d enrichment blocks.
- `DisclosureHeader` renders as a single `<div>` with a compact one-line summary (`Document: X · Tab: Y · Configuration: Z · Checked at: W`) rather than a multi-row layout — matches D-05's "light polish, no framework" discretion and the existing compact styling of `ReconnectState.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied the gitignored generated Onshape API types file into the worktree**
- **Found during:** Task 1 verification (attempting to reference `operations["getDocument"]`/`BTDocumentInfo` and run `npm run build`)
- **Issue:** `src/server/onshape-client/types/onshape.d.ts` is a `gen:types`-produced, gitignored file. It exists in the main repo checkout but is absent from this git worktree (worktrees only carry tracked files) — this is the same pre-existing worktree-local gap already documented in 04-01-SUMMARY.md's deviation log, not a new issue introduced by this plan.
- **Fix:** Copied `onshape.d.ts` from the main repo's `src/server/onshape-client/types/` into the worktree's identical (gitignored) path. No source or config changes; the file remains untracked/gitignored, so it was never staged or committed.
- **Files modified:** `src/server/onshape-client/types/onshape.d.ts` (untracked, not committed)
- **Verification:** `npm run build` exits 0; `npm test` (86/86) passes.
- **Committed in:** N/A (gitignored file, never staged)

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only — recurrence of 04-01's documented worktree gap, not new to this plan).
**Impact on plan:** No scope creep — both tasks executed exactly as written in the plan and prescribed by 04-PATTERNS.md/04-RESEARCH.md.

## Issues Encountered

None beyond the recurring worktree-local generated-types gap documented above.

## User Setup Required

None — no external service configuration required. This plan installs zero new npm packages (per the plan's threat model T-04-SC, "accept" disposition, no legitimacy checkpoint required).

## Threat Flags

None. All four STRIDE threats in the plan's threat model (T-04-04 spoofing/tampering of disclosed names, T-04-05 XSS via DisclosureHeader, T-04-06 information disclosure via the getDocument response, T-04-07 DoS via a hanging naming lookup) were mitigated exactly as prescribed: names are server-derived (never from `req.body`), rendering is plain JSX text interpolation with no `dangerouslySetInnerHTML`, only `.name` is copied out of the `getDocument` response, and the best-effort try/catch never blocks the response on a naming-lookup failure. No new network endpoints, auth paths, or schema changes were introduced beyond what the threat model already scoped.

## Next Phase Readiness

- `/api/check` now returns exactly 5 honest verdicts (MAT-AUDIT, R103, R408, R101, R104) PLUS a fully-populated, atomic `measuredContext` (documentId/workspaceId/elementId/documentName/tabName/configurationName/checkedAt) — RSLT-03 is complete.
- The panel renders the "measured against" disclosure header above the verdict table on every check and re-check, atomically with the verdicts (SC4/D-03).
- This was the final plan of Phase 4 (2 plans, 2 waves) — Phase 4's stated goals (RSLT-01/RSLT-02 in Plan 01, RSLT-03 in this plan) are now all complete pending orchestrator-level verification/merge.

---
*Phase: 04-trust-bar-results-panel*
*Completed: 2026-07-12*

## Self-Check: PASSED

All 6 files listed as created/modified were verified present (`FOUND`); all 3 commit hashes (`93136c3`, `5d3438d`, `b05c423`) verified present in `git log --oneline --all`.

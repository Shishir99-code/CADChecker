---
phase: 03-frame-perimeter-height
plan: 03
subsystem: api
tags: [onshape, bounding-box, height-check, tdd]

# Dependency graph
requires:
  - phase: 03-frame-perimeter-height (Plan 01)
    provides: getAssemblyBoundingBoxes client method, the live-verified 03-BOUNDING-BOX-CONTRACT.md (A1-A4/G1-G4), VERIFIED rules/2026.json
  - phase: 03-frame-perimeter-height (Plan 02)
    provides: passesOperator/M_TO_IN in engine.ts, the "geometry payload" and UNKNOWN-gate check-writing pattern (frame-perimeter.check.ts), the route's 5b/5c enrichment discipline
provides:
  - startingHeightCheck (R104), registered in buildEngine()
  - Fact.robotMaxZWorld (whole-robot max +Z, world meters, UNRESOLVED convention)
  - The route's 5d single assembly-level getAssemblyBoundingBoxes enrichment
affects: [phase-4-dashboard-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5d enrichment block: ONE top-level try/catch (not per-group, not per-part) for a whole-robot scalar that gets copied onto every fact -- distinct from 5b/5c's per-group discipline since height needs a single assembly-level call, not a per-part join"
    - "TDD RED->GREEN applied to a pure CheckFn: failing test committed first (module-not-found), then the minimal implementation, mirroring tdd.md guidance"

key-files:
  created:
    - src/server/checks/starting-height.check.ts
    - src/server/checks/starting-height.check.test.ts
  modified:
    - src/server/traversal/facts.ts
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts
  removed:
    - scripts/spike-bounding-boxes.ts

key-decisions:
  - "startingHeightCheck gates UNKNOWN via facts.every(f => f.robotMaxZWorld === undefined) rather than checking a single fact, so an empty facts array or a total assembly-box-fetch failure both correctly resolve to UNKNOWN with no special-casing"
  - "robotMaxZWorld is fetched ONCE per request (5d, top-level try/catch) and copied onto every enriched fact -- not scoped per-group like 5b/5c -- because G3 explicitly prefers the single assembly-level highZ over any per-part enumeration"
  - "Added a dedicated check.routes.test.ts test for the 5d enrichment path (single getAssemblyBoundingBoxes call, robotMaxZWorld on every fact, end-to-end PASS verdict) beyond the plan's stated acceptance criteria, mirroring the precedent set by Plan 02's 5c enrichment test"

patterns-established:
  - "Whole-robot (all-occurrence) scalars that come from a single assembly-level API call are enriched in their own dedicated route step (5d) with their own try/catch, distinct from per-group/per-part enrichment blocks (5b/5c), even though all three merge into the same enrichedFacts.map()"

requirements-completed: [GEOM-03]

# Metrics
duration: ~15min active execution
completed: 2026-07-10
---

# Phase 3 Plan 3: Starting-Configuration Height Check Summary

**Whole-robot starting-configuration height check (R104) computed from a single assembly-level `getAssemblyBoundingBoxes` call's world-space `highZ`, gated UNKNOWN on an unreadable box rather than a silent 0-height PASS.**

## Performance

- **Duration:** ~15 min active execution
- **Completed:** 2026-07-10
- **Tasks:** 2 (`type="auto"`, `type="auto" tdd="true"`)
- **Files modified:** 6 (2 created, 3 modified, 1 deleted)

## Accomplishments

- Added `Fact.robotMaxZWorld?: number` (`src/server/traversal/facts.ts`) following the SAME UNRESOLVED doc-comment convention as `massKg`/`bboxCornersWorld` — `undefined` means the assembly-level box was unreadable, NEVER a substituted 0.
- Implemented the route's new 5d enrichment block: ONE top-level `try/catch` calling `client.getAssemblyBoundingBoxes(assemblyDocumentId, "w", workspaceId, elementId)` (server-derived ids only, never `req.body`), reading `highZ` directly with no transform (A2 — already world-space) and copying the same scalar onto every enriched fact. `ReconnectRequiredError`/401 `OnshapeApiError` are rethrown; any other error leaves `robotMaxZWorld` undefined on all facts.
- Implemented `startingHeightCheck` (R104) via strict TDD: wrote `starting-height.check.test.ts` first (confirmed RED — module not found), then the minimal `startingHeightCheck` implementation (confirmed GREEN — 6/6 tests pass). Gates UNKNOWN when every fact's `robotMaxZWorld` is undefined (including the empty-facts case), otherwise converts `robotMaxZWorld * M_TO_IN` to inches, sets status via the reused `passesOperator`, returns `measuredCount` = height inches, and attaches the D-04 (+Z-up) and D-06 (configuration-disclosure) caveats.
- Registered `startingHeightCheck` in `buildEngine()`.
- Updated `check.routes.test.ts`: bumped the verdict-count assertion 6→7, added an `R104` presence assertion, and added a dedicated 5d enrichment test proving the single `getAssemblyBoundingBoxes` call is made exactly once with server-derived ids, `robotMaxZWorld` lands on every fact (not just FRAME_-tagged ones), and the end-to-end verdict PASSes with the correctly converted inch value.
- Deleted the throwaway `scripts/spike-bounding-boxes.ts` — its coordinate-frame findings are permanently recorded in `03-BOUNDING-BOX-CONTRACT.md`, and both checks (`frame-perimeter.check.ts`, `starting-height.check.ts`) now consume that contract directly. Mirrors Phase 2's `spike-mass-properties.ts` deletion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Assembly-level bbox enrichment in the route + Fact.robotMaxZWorld** - `47a43ff` (feat)
2. **Task 2 (TDD RED): failing test for startingHeightCheck** - `df5a27c` (test)
2. **Task 2 (TDD GREEN): startingHeightCheck + registration + delete spike** - `839ae84` (feat)

**Plan metadata:** (this commit, following SUMMARY creation)

## Files Created/Modified

- `src/server/traversal/facts.ts` - Adds `Fact.robotMaxZWorld?: number` (UNRESOLVED convention)
- `src/server/routes/check.routes.ts` - New 5d enrichment block (single `getAssemblyBoundingBoxes` call) + `startingHeightCheck` registration
- `src/server/routes/check.routes.test.ts` - Bumps verdict-count assertion to 7, adds R104 presence assertion, adds an end-to-end 5d enrichment test
- `src/server/checks/starting-height.check.ts` / `.test.ts` - The R104 height `CheckFn`, TDD-built and unit-tested (UNKNOWN/empty/PASS/FAIL/caveats/missing-config-entry)
- `scripts/spike-bounding-boxes.ts` - Deleted (throwaway, contract permanently recorded)

## Decisions Made

- **UNKNOWN gate via `facts.every(...)`, not a single-fact read:** `startingHeightCheck` checks `facts.every((f) => f.robotMaxZWorld === undefined)` before reading the scalar, so an empty `facts` array and a total 5d fetch failure both cleanly resolve to UNKNOWN without a separate empty-array branch.
- **5d is its own dedicated enrichment step, not folded into 5b/5c:** the whole-robot scalar is fetched once at the top level (not per-group, not per-part) and merged into the same final `enrichedFacts.map()` alongside `massKg`/`materialAssigned`/`bboxCornersWorld` — keeping the "one call per enrichment concern" discipline visible in the route rather than overloading 5b/5c's per-group loops with an unrelated single-call concern.
- **Added a 5d-specific route test beyond the plan's literal acceptance criteria:** the plan's Task 2 verify command only re-runs the existing `check.routes.test.ts`, but this plan mirrors Plan 02's precedent (a dedicated 5c enrichment test) by adding one dedicated 5d enrichment test — proving the single-call behavior, whole-robot fact propagation, and end-to-end PASS verdict, not just an updated count assertion.

## Deviations from Plan

None — plan executed exactly as written. The additional `check.routes.test.ts` enrichment test (see Decisions Made) is an extension of test coverage already implied by the plan's own acceptance criteria ("check.routes.test.ts updated ... and green"), consistent with the precedent set by the immediately preceding plan; not a Rule 1-4 deviation since no bug, missing critical functionality, blocker, or architectural change was involved.

## TDD Gate Compliance

Task 2 followed the RED → GREEN cycle as required by `tdd="true"`:
- RED: `df5a27c` — `starting-height.check.test.ts` committed while `startingHeightCheck` did not yet exist; run confirmed to fail (module not found) before committing.
- GREEN: `839ae84` — `startingHeightCheck` implemented; run confirmed all 6 tests pass before committing (bundled with registration + spike deletion per the plan's Task 2 action).
- No REFACTOR commit — the GREEN implementation required no follow-up cleanup.

## Issues Encountered

None.

## Known Stubs

None. `startingHeightCheck` is fully wired to the real route-computed `robotMaxZWorld` enrichment (no hardcoded/placeholder data); the UNKNOWN branch is an intentional gate per D-02/T-03-08, not a stub.

## Threat Flags

None new. This plan's only new surface (the 5d assembly-level bbox fetch and `startingHeightCheck`) is fully covered by the plan's own `<threat_model>` (T-03-07 through T-03-09) and implemented per those mitigations: server-derived ids only (T-03-07), UNKNOWN-gate against a false PASS (T-03-08), and a single bounded call regardless of part count (T-03-09).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 (frame-perimeter-height) is now functionally complete: R101 (perimeter, Plan 02) and R104 (starting height, this plan) both ship real, honestly-gated verdicts alongside the Phase 1/2 checks.
- The pre-existing R101/R103 rule-citation collision (Phase-1 `occurrenceCountCheck`/`frameTagPresenceCheck` citing `config.rules[]` positionally), carried forward from Plan 02's summary and logged in `deferred-items.md`, remains open and unaffected by this plan (R104 is looked up by rule string, not position, so it does not add a new collision) — still recommended to resolve before Phase 4's dashboard polish.
- All four season-config rules (R101, R103, R104, R408) now have a real consuming check; Phase 4 dashboard work can rely on `verdicts` always containing 7 entries with `startingHeightCheck`'s R104 verdict selectable by `rule === "R104"` (no field-presence ambiguity, unlike the R101 perimeter verdict).

---
*Phase: 03-frame-perimeter-height*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created/modified files verified present on disk; `scripts/spike-bounding-boxes.ts` confirmed deleted; all task commits (47a43ff, df5a27c, 839ae84) verified present in git history.

---
phase: 02-trustworthy-weight
plan: 03
subsystem: api
tags: [typescript, vitest, check-engine, mass-properties, tri-state-verdict]

requires:
  - phase: 02-trustworthy-weight/02-02
    provides: "Tri-state Verdict (status/measured/affectedPartCount/affectedParts/caveats), KG_TO_LB, enriched Fact (massKg/materialAssigned, undefined=UNRESOLVED), and per-group cross-document mass/material merge producing enrichedFacts in check.routes.ts"
provides:
  - "robotWeightCheck (R103): independently-filtered total excluding BUMPER_ and BATTERY_ parts, per-verdict UNKNOWN gating, dual lb/kg via KG_TO_LB"
  - "robotBumpersWeightCheck (R408): independently-filtered total including bumpers and excluding only BATTERY_ parts, distinctly filtered from R103 (proven R408 = R103 + bumper mass)"
  - "rules/2026.json R103/R408 unit corrected kg -> lb (D-03)"
  - "Both checks registered in buildEngine(), consuming enrichedFacts automatically"
affects: []

tech-stack:
  added: []
  patterns:
    - "Per-verdict-own-set gating: a check only goes UNKNOWN when a part in ITS OWN included/filtered set is untrusted -- a BUMPER_ part missing material affects R408 but not R103, and vice versa is impossible since R103 excludes bumpers entirely"
    - "Integrity guard disjunct: untrusted = materialAssigned===false OR massKg===undefined -- the second arm catches a materialed-but-mass-unresolved part (enrichment gap or 02-02 F3 UNRESOLVED referenced part) so it never silently contributes 0 kg"
    - "config.rules.find(r => r.rule === '...') over fixed-index lookup, now that rules/2026.json has 4+ entries"

key-files:
  created:
    - src/server/checks/robot-weight.check.ts
    - src/server/checks/robot-weight.check.test.ts
    - src/server/checks/robot-bumpers-weight.check.ts
    - src/server/checks/robot-bumpers-weight.check.test.ts
  modified:
    - rules/2026.json
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts

key-decisions:
  - "Updated check.routes.test.ts's verdict-count assertion (3 -> 5) and added R103/R408 rule-presence assertions in the existing integration test, since registering two new checks in buildEngine() directly changes that test's observable output (Rule 1 correctness fix required by Task 3's own acceptance criteria, not a scope expansion)."

patterns-established:
  - "robot-bumpers-weight.check.ts is an intentional near-duplicate of robot-weight.check.ts (same UNKNOWN-gating shape, same lb/kg conversion, same error-throw-on-missing-config-entry idiom) -- two independently-filtered occurrence computations, never one number relabeled (D-05)."

requirements-completed: [WGHT-02, WGHT-03, WGHT-04]

duration: ~15min
completed: 2026-07-09
---

# Phase 2 Plan 3: R103/R408 Weight Verdicts Summary

**Two independently-filtered weight verdicts (R103 robot-only, R408 robot+bumpers) that gate to UNKNOWN and suppress the number the moment any part in their own included set lacks material or a resolved mass, each rendering `<lb> lb (<kg> kg)` off a single canonical-kg total.**

## Performance

- **Duration:** ~15 min (first commit `cde7516` to final commit `96e2645`)
- **Completed:** 2026-07-09
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- Shipped `robotWeightCheck` (R103): sums `massKg` over every fact NOT prefixed `BUMPER_`/`BATTERY_`, converts to pounds via the single `KG_TO_LB` constant, and returns `UNKNOWN` (no `measured` field) the instant any part in that included set has `materialAssigned === false` OR an unresolved `massKg === undefined` -- the latter disjunct is the integrity guard that also catches a 02-02 F3 UNRESOLVED referenced part (whose `materialAssigned` is `undefined`, not `false`) without needing a separate check.
- Shipped `robotBumpersWeightCheck` (R408) as a deliberate near-duplicate: same gating/conversion/error-handling shape, narrower exclusion (only `BATTERY_`), bumpers included. A dedicated test proves the two are genuinely independent filters, not one shared number: over identical facts, `R408.measured.kg === R103.measured.kg + bumperMass`.
- Proved per-verdict isolation both directions: a `BUMPER_` part missing material leaves R103 computable (Task 1 Test 4) but forces R408 `UNKNOWN` (Task 2 Test 3) -- the two verdicts never contaminate each other's trust gate.
- Fixed `rules/2026.json`: R103 and R408 `unit` corrected from `"kg"` to `"lb"` (D-03), matching the already pound-denominated PLACEHOLDER limits (115, 135); no limit values or `limitStatus` touched.
- Registered both checks in `buildEngine()`; they consume the same `enrichedFacts` the 02-02 per-group cross-document merge already produces -- no changes to the route handler's merge/try-catch logic.
- Updated the pre-existing `check.routes.ts` integration test (`3 verdicts` -> `5 verdicts`, plus explicit R103/R408 presence assertions) since registering the new checks is a direct, in-scope change to that test's observable behavior.

## Task Commits

Each task was committed atomically (TDD RED -> GREEN per task):

1. **Task 1: Ship R103 robot-weight check + fix rules/2026.json units** - `cde7516` (test, RED) -> `b433bd6` (feat, GREEN)
2. **Task 2: Ship R408 robot+bumpers weight check** - `e2d7572` (test, RED) -> `5521905` (feat, GREEN)
3. **Task 3: Register both weight checks in buildEngine() and prove the build** - `96e2645` (feat)

_TDD gate compliance: Tasks 1 and 2 each show a `test(...)` commit (tests failing because the check module did not yet exist) followed by a `feat(...)` commit (implementation, all behavior tests passing). No REFACTOR commit was needed for either task._

## Files Created/Modified

- `src/server/checks/robot-weight.check.ts` - `robotWeightCheck: CheckFn` (R103); excludes `BUMPER_`/`BATTERY_`; per-verdict UNKNOWN gate on `materialAssigned===false || massKg===undefined`; dual lb/kg via `KG_TO_LB`; missing-tag caveats.
- `src/server/checks/robot-weight.check.test.ts` - 7 tests: happy-path sum, BUMPER_/BATTERY_ exclusion, UNKNOWN gating, per-verdict isolation, integrity gate on undefined mass, missing-tag caveats, config-driven fields.
- `src/server/checks/robot-bumpers-weight.check.ts` - `robotBumpersWeightCheck: CheckFn` (R408); includes bumpers, excludes only `BATTERY_`; same gating/conversion shape as R103.
- `src/server/checks/robot-bumpers-weight.check.test.ts` - 5 tests: bumper inclusion, R408≠R103 distinct-number proof, per-verdict gating on a BUMPER_ part, battery-only caveat, dual lb/kg + config-driven fields.
- `rules/2026.json` - R103/R408 `unit` corrected `"kg"` -> `"lb"` (D-03).
- `src/server/routes/check.routes.ts` - Imports + `buildEngine()` registrations for `robotWeightCheck` and `robotBumpersWeightCheck`; handler body/merge step untouched.
- `src/server/routes/check.routes.test.ts` - Verdict-count assertion updated `3` -> `5`; added `R103`/`R408` rule-presence assertions.

## Decisions Made

- Updated the existing `check.routes.ts` integration test's verdict-count expectation and added rule-presence assertions for R103/R408, since Task 3 (registering two more checks) directly changes that test's real, observable output — required for the test suite to stay green, not a scope expansion.

## Deviations from Plan

None beyond the check.routes.test.ts assertion update noted above, which is a direct, expected consequence of Task 3's own action (register two more checks in buildEngine()) rather than an unplanned discovery.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- R103 and R408 are both live, config-driven, per-verdict-gated weight verdicts consuming the same `enrichedFacts` path every other check consumes (Success Criterion 5 preserved).
- `rules/2026.json`'s PLACEHOLDER limits (115 lb / 135 lb) still need replacement with verified current-season Game Manual numbers before this is trustworthy for a real competition -- explicitly out of scope for this plan (D-03 only covers the `unit` fix), flagged for a future season-config-verification pass.
- Panel UI (`ReportTable.tsx`) already renders any registered verdict generically (rule/title/measured/status/affectedParts/caveats), so R103/R408 rows appear automatically with no additional frontend wiring needed.
- No blockers carried forward.

---
*Phase: 02-trustworthy-weight*
*Completed: 2026-07-09*

## Self-Check: PASSED

All 4 created files (`robot-weight.check.ts`, `robot-weight.check.test.ts`, `robot-bumpers-weight.check.ts`, `robot-bumpers-weight.check.test.ts`) confirmed present on disk; all 5 commits (`cde7516`, `b433bd6`, `e2d7572`, `5521905`, `96e2645`) confirmed in git history; `npm run build`, `npx tsc -p tsconfig.server.json --noEmit`, `npx eslint src`, and `npx vitest run` (61 tests, 12 files) all pass.

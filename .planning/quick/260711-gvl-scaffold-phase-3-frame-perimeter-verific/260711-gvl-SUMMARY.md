---
phase: quick/260711-gvl-scaffold-phase-3-frame-perimeter-verific
plan: 01
subsystem: testing
tags: [supertest, express-session, offline-harness, verification-runbook, frame-perimeter, cr-01, cr-02]

# Dependency graph
requires:
  - phase: 03-frame-perimeter-height (plan 04)
    provides: "The CR-01/CR-02 code fixes in flatten-assembly.ts and check.routes.ts this harness proves against"
provides:
  - "A runnable offline harness (npm run verify:frame) that drives the REAL createCheckRouter with a synthetic high-fidelity FRC frame and exits non-zero on any CR-01/CR-02 regression"
  - "A non-CAD-user runbook for confirming the same fix against a real public Onshape document"
affects: [phase-03-frame-perimeter-height, ci-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone verification scripts under scripts/ import and drive REAL production route code via supertest (mirroring buildTestApp in *.test.ts) rather than reimplementing route/traversal/check logic — keeps the proof honest against future regressions."

key-files:
  created:
    - scripts/verify-frame-perimeter.ts
    - .planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md
  modified:
    - package.json

key-decisions:
  - "Chose a 32in x 28in synthetic frame (round-number meters: 0.8128m x 0.7112m) so the expected R101 perimeter is an exact 120in — deterministically FAIL against the 110in limit with no floating-point ambiguity in the assertions."
  - "Reused CAD part RAIL_LONG at two occurrences (left edge, right edge translated +X) to directly exercise the CR-02 guard; a second non-reused RAIL_CROSS part composes the front/back rails so the hull is a real full rectangle, not two disconnected segments."
  - "Selected the perimeter verdict by `geometry` field presence (not `rule === 'R101'`), per the pre-existing rule-citation collision between occurrenceCountCheck and framePerimeterCheck documented in check.routes.test.ts and deferred-items.md."

requirements-completed: [GEOM-01, GEOM-02, GEOM-03]

# Metrics
duration: ~25min
completed: 2026-07-11
---

# Quick Task 260711-gvl: Scaffold Phase 3 Frame-Perimeter Verification Summary

**Added a runnable offline harness (`npm run verify:frame`) that drives the real `createCheckRouter` with a synthetic high-fidelity FRC frame to guard CR-01/CR-02, plus a non-CAD-user live-verification runbook — zero changes to shipped product code.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-11
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `scripts/verify-frame-perimeter.ts` imports and drives the REAL `createCheckRouter` (via supertest, mirroring `check.routes.test.ts`'s `buildTestApp` idiom) against a synthetic 32x28in FRC frame with deliberately distinct instance-id/CAD-partId strings and a reused two-occurrence FRAME_ rail — proves CR-01 closed (real PASS/FAIL, never UNKNOWN), CR-02 closed (hull spans both reused-rail placements), and R104 computes a real measured height.
- Verified by direct execution: `node --experimental-strip-types scripts/verify-frame-perimeter.ts` and `npm run verify:frame` both print a human-readable report and exit 0 with "ALL GUARDS PASSED".
- `.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md` walks a non-CAD user through confirming the same fix against a real public Onshape document, including the exact CR-01 smoking-gun symptom (permanent UNKNOWN despite correct FRAME_ tagging) to watch for and report rather than "fix" in CAD.
- Confirmed zero files under `src/`, `src/panel/`, or `rules/` were touched — only `scripts/verify-frame-perimeter.ts`, the `package.json` `verify:frame` script entry, and the new runbook doc.

## Task Commits

Each task was committed atomically:

1. **Task 1: Offline verification harness driving the real route** - `f654226` (feat)
2. **Task 2: Live-verification runbook for a non-CAD user** - `5eb902e` (docs)

_Note: docs artifacts (this SUMMARY.md, STATE.md) are committed separately by the orchestrator, not by this executor._

## Files Created/Modified

- `scripts/verify-frame-perimeter.ts` - Standalone runnable (non-vitest) harness; builds a synthetic 32x28in FRC frame with a reused RAIL_LONG side rail at two occurrences, POSTs through the real `/api/check`, and asserts CR-01/CR-02/R104 guards with `process.exit(0)`/`process.exit(1)` and a human-readable stdout report.
- `package.json` - Added `"verify:frame": "node --experimental-strip-types scripts/verify-frame-perimeter.ts"` script entry (no other field touched).
- `.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md` - Non-CAD-user runbook: FRAME_ tagging is a plain rename, R104 needs no tagging, what a real PASS/FAIL hull + height look like, and the CR-01 smoking-gun signature.

## Decisions Made

See `key-decisions` in frontmatter above (synthetic frame sizing, CR-02 fixture shape, geometry-based verdict selection).

## Deviations from Plan

None - plan executed exactly as written. Both tasks' `<verify>`/`<done>` criteria were confirmed by direct execution, not just static reading:

- Task 1: ran both `node --experimental-strip-types scripts/verify-frame-perimeter.ts` and `npm run verify:frame` — both exited 0 and printed the expected report. Confirmed `git status --short` showed only `scripts/verify-frame-perimeter.ts` (new) and `package.json` (modified) after this task — no `src/` or `rules/` changes.
- Task 2: confirmed the runbook file exists, contains `FRAME_` and `UNKNOWN` (case-insensitive) per the automated verify command, and is 70 lines (exceeds the 40-line minimum).

## Findings

No regressions surfaced. The offline harness confirms the CR-01/CR-02 fixes shipped in Phase 03 Plan 04 hold against a high-fidelity synthetic assembly: the R101 verdict resolves to a real FAIL (120in measured perimeter vs. the 110in limit, deterministic by design) with a 4-vertex hull spanning the full 0-32in X range (both RAIL_LONG placements), and R104 resolves to a real PASS (19.69in measured vs. the 30in limit). No product-code change was needed or made.

## Self-Check: PASSED

- FOUND: `scripts/verify-frame-perimeter.ts`
- FOUND: `.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md`
- FOUND: `f654226` in `git log --oneline --all`
- FOUND: `5eb902e` in `git log --oneline --all`
- CONFIRMED: `npm run verify:frame` exits 0 and prints "ALL GUARDS PASSED"
- CONFIRMED: no `src/`, `src/panel/`, or `rules/` files appear in `git diff HEAD~2 HEAD --name-only`

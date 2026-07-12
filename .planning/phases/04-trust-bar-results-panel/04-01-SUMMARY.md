---
phase: 04-trust-bar-results-panel
plan: 01
subsystem: ui
tags: [react, vitest, checks-engine, results-panel]

# Dependency graph
requires:
  - phase: 03-frame-perimeter-height
    provides: framePerimeterCheck / startingHeightCheck idiom (caveats[0] self-contained reason)
provides:
  - Explicit, self-contained UNKNOWN reasons on both weight checks (R103/R408)
  - buildEngine() registering exactly the 5 real checks (Phase-1 plumbing checks retired)
  - ReportTable.tsx Limit column rendering verdict.limit + verdict.unit for every row
  - ReportTable.tsx "NOT YET CHECKABLE" badge/measured-cell relabel with per-check reason
  - Panel with no plumbing banner (trust-positioned)
affects: [04-02-trust-bar-results-panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UNKNOWN-branch caveats[0] reason idiom (originated in frame-perimeter.check.ts/starting-height.check.ts) now applied uniformly to all 5 real checks"
    - "renderLimit()/renderReason() small pure-function idiom in ReportTable.tsx, matching existing renderMeasured() style"

key-files:
  created: []
  modified:
    - src/server/checks/robot-weight.check.ts
    - src/server/checks/robot-bumpers-weight.check.ts
    - src/server/routes/check.routes.ts
    - src/server/checks/engine.test.ts
    - src/server/routes/check.routes.test.ts
    - src/panel/components/ReportTable.tsx
    - src/panel/main.tsx
  deleted:
    - src/server/checks/occurrence-count.check.ts
    - src/server/checks/frame-tag-presence.check.ts
    - src/panel/components/PlumbingBanner.tsx

key-decisions:
  - "R103/R408 UNKNOWN caveats[0] is now always the explicit 'N part(s) have missing material or unresolved mass' reason, with pre-existing BUMPER_/BATTERY_ tag-presence notes appended after it"
  - "engine.test.ts rewritten to use two small inline trivial CheckFns (totalCountCheck/framePrefixCountCheck) instead of importing the retired Phase-1 plumbing checks, keeping CheckEngine mechanics tested with zero dependency on retired or real check modules"
  - "R101/R103 rule-citation collision (deferred-items.md) is now resolved by retiring the two plumbing checks -- exactly one verdict cites R101"

patterns-established:
  - "renderLimit(verdict): clean em-dash placeholder ('—') when verdict.limit is not a finite number, never the literal string 'undefined'"
  - "renderReason(verdict): caveats[0] when present, else a defensive fallback mentioning affectedPartCount -- used inside the existing caveats-row block so the reason renders exactly once, never duplicated with the Measured cell"

requirements-completed: [RSLT-01, RSLT-02]

# Metrics
duration: ~10min
completed: 2026-07-12
---

# Phase 4 Plan 1: Honest Per-Check UNKNOWN Reasons + Season-Limit Column Summary

**Retired the two Phase-1 proof-of-plumbing checks, gave both weight checks a self-contained UNKNOWN reason, and added a dedicated Limit column + "NOT YET CHECKABLE" badge relabel to ReportTable.tsx so every one of the 5 real checks shows rule/title/limit/measured honestly.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-11T22:03Z (approx)
- **Completed:** 2026-07-12T02:09Z
- **Tasks:** 3 (Task 1 is TDD: RED + GREEN commits)
- **Files modified:** 12 (7 modified, 3 deleted, 2 test files extended)

## Accomplishments
- Both weight checks (R103/R408) now emit an explicit, self-contained UNKNOWN reason as `caveats[0]` (`"N part(s) have missing material or unresolved mass — see affected parts"`), matching the idiom already used by `frame-perimeter.check.ts` and `starting-height.check.ts` — all 5 real checks are now consistent.
- Retired the two Phase-1 proof-of-plumbing checks (`occurrenceCountCheck`, `frameTagPresenceCheck`) from `buildEngine()` and deleted their source files, resolving the pre-existing R101/R103 rule-citation collision (`deferred-items.md`) — `/api/check` now returns exactly 5 verdicts, exactly one citing R101.
- `engine.test.ts` rewritten with two small inline trivial `CheckFn`s so `CheckEngine`'s register/runAll/identical-facts/operator mechanics stay fully tested with zero dependency on any retired or real check module.
- `ReportTable.tsx` gained a dedicated "Limit" column (`renderLimit()`) rendering `verdict.limit + verdict.unit` for every row, and a `renderReason()` helper wired into the existing caveats-row block so every UNKNOWN row's own `caveats[0]` reason renders exactly once (not duplicated with the Measured cell).
- UNKNOWN badges and the Measured cell now read the plain-language "NOT YET CHECKABLE" instead of the previous hardcoded, misleading `"UNKNOWN — N parts missing material"` string (which was wrong for non-material-audit checks).
- Removed the "Plumbing proof — verdicts not yet trusted" banner and its component file — the panel is now positioned as trustworthy per D-01.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: add failing UNKNOWN-reason assertions** - `b9f16e0` (test)
2. **Task 1 GREEN: push explicit UNKNOWN reason into both weight checks** - `3ab12ad` (feat)
3. **Task 2: retire the two plumbing checks from the engine** - `867dfed` (feat)
4. **Task 3: render Limit column + honest not-yet-checkable rows, remove plumbing banner** - `567c789` (feat)

_TDD Task 1 has two commits (test -> feat); no REFACTOR commit was needed._

## Files Created/Modified
- `src/server/checks/robot-weight.check.ts` - UNKNOWN branch prepends explicit self-contained reason to `caveats`
- `src/server/checks/robot-bumpers-weight.check.ts` - mirrors the same change
- `src/server/checks/robot-weight.check.test.ts` - extended UNKNOWN assertions for `caveats[0]`
- `src/server/checks/robot-bumpers-weight.check.test.ts` - mirror assertion
- `src/server/routes/check.routes.ts` - `buildEngine()` no longer registers the two plumbing checks; imports removed
- `src/server/checks/engine.test.ts` - rewritten with inline trivial CheckFns
- `src/server/routes/check.routes.test.ts` - verdict-count assertion 7 -> 5, R101-collision assertion 2 -> 1, stale comments updated
- `src/panel/components/ReportTable.tsx` - `renderLimit()` + Limit column, `renderReason()` wired into caveats block, badge/measured-cell "NOT YET CHECKABLE" relabel, notes-row `colSpan` 3 -> 4
- `src/panel/main.tsx` - removed `<PlumbingBanner />` render/import, updated stale R101-collision comment
- `src/server/checks/occurrence-count.check.ts` - deleted
- `src/server/checks/frame-tag-presence.check.ts` - deleted
- `src/panel/components/PlumbingBanner.tsx` - deleted

## Decisions Made
- Kept the exact `caveats[0]`-as-reason idiom already established by `frame-perimeter.check.ts`/`starting-height.check.ts` rather than inventing a new shape for the weight checks (consistency across all 5 checks).
- `renderReason()` is wired into the existing caveats-row block (mapping `caveats[0]` explicitly via the helper for the first list item) rather than introducing a separate render location, so the reason text renders exactly once per row — matching the plan's explicit "not duplicated" requirement and the 04-PATTERNS.md guidance.
- No Verdict schema changes: `STATUS_COLORS` stays keyed by the literal `"UNKNOWN"` status; only the *displayed* label changed to "NOT YET CHECKABLE" (D-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied the gitignored generated Onshape API types file into the worktree**
- **Found during:** Task 3 verification (`npm run build`)
- **Issue:** `src/server/onshape-client/types/onshape.d.ts` is a `gen:types`-produced, gitignored file. It exists in the main repo checkout but is absent from this git worktree (worktrees only carry tracked files), so `tsc -p tsconfig.server.json` failed with `Cannot find module './types/onshape.d.ts'` and a cascading `implicitly has an 'any' type` error in `check.routes.ts` — both pre-existing before any of this plan's edits (confirmed via `git stash`), purely an artifact of the worktree missing an untracked generated file.
- **Fix:** Copied `onshape.d.ts` from the main repo's `src/server/onshape-client/types/` into the worktree's identical (gitignored) path. No source or config changes; the file remains untracked/gitignored, so it will not be committed.
- **Files modified:** `src/server/onshape-client/types/onshape.d.ts` (untracked, not committed)
- **Verification:** `npm run build` now exits 0; `npm test` (86/86) unaffected either way.
- **Committed in:** N/A (gitignored file, never staged)

---

**Total deviations:** 1 auto-fixed (1 blocking, environment-only)
**Impact on plan:** No scope creep — this was a worktree-local environment gap (a generated, gitignored artifact missing from the linked worktree checkout), not a code change. All three tasks otherwise executed exactly as written.

## Issues Encountered
None beyond the worktree-local generated-types gap documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `/api/check` now returns exactly 5 honest verdicts (MAT-AUDIT, R103, R408, R101, R104), each with rule/title/limit/measured and a plain-language reason on any UNKNOWN branch.
- `ReportTable.tsx`'s Limit column and "NOT YET CHECKABLE" relabel are ready for Plan 02's disclosure-header work (per 04-PATTERNS.md, which documents Plan 02's `DisclosureHeader`/`measuredContext` growth against this same file set) — no blockers for Plan 02.

---
*Phase: 04-trust-bar-results-panel*
*Completed: 2026-07-12*

## Self-Check: PASSED

All files listed as created/modified/deleted were verified present or absent as claimed; all 5 commit hashes (`b9f16e0`, `3ab12ad`, `867dfed`, `567c789`, `2a74201`) verified in `git log`.

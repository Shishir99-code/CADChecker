---
phase: 02-trustworthy-weight
plan: 02
subsystem: api
tags: [typescript, express, onshape, mass-properties, tri-state-verdict, vitest]

requires:
  - phase: 02-trustworthy-weight/02-01
    provides: "getPartStudioMassProperties/getPartsMetadata typed OnshapeClient methods + 02-MASS-PROPERTIES-CONTRACT.md live-verified response shape (mass[0], SI kg, partId join, material-absence, F1-F4)"
provides:
  - "Tri-state Verdict (status PASS|FAIL|UNKNOWN, dual measured{lb,kg}, measuredCount, affectedPartCount/affectedParts, caveats) + KG_TO_LB conversion constant"
  - "Fact.massKg/Fact.materialAssigned enrichment fields (undefined always means UNRESOLVED, never 0/false)"
  - "groupPartsByElement + AssemblyDefinition.parts[]/AssemblyPartInfo (with cross-document documentVersion/documentMicroversion/isStandardContent)"
  - "Per-group cross-document mass/material merge in check.routes.ts producing enrichedFacts, with graceful per-group 403 degradation"
  - "materialAuditCheck (MAT-AUDIT, WGHT-01) registered as a first-class report row"
affects: [02-03-weight-verdicts]

tech-stack:
  added: []
  patterns:
    - "Tri-state Verdict shape (status/measured/measuredCount/affectedParts/caveats) as the single Verdict contract for every CheckFn"
    - "Route-level enrichment merge (mass+material fetched/merged onto Facts in check.routes.ts) keeping every CheckFn pure/synchronous"
    - "Per-group (documentId:elementId) wvm selection: w/{workspaceId} for the assembly's own document, v/{documentVersion} (m/{documentMicroversion} fallback) for referenced documents"
    - "Per-group try/catch degradation: 401/ReconnectRequiredError re-throw, any other error (e.g. 403) swallowed leaving the group's parts UNRESOLVED (undefined, never 0/false)"

key-files:
  created:
    - src/server/checks/material-audit.check.ts
    - src/server/checks/material-audit.check.test.ts
  modified:
    - src/server/checks/engine.ts
    - src/server/checks/engine.test.ts
    - src/server/traversal/facts.ts
    - src/server/traversal/flatten-assembly.ts
    - src/server/checks/occurrence-count.check.ts
    - src/server/checks/frame-tag-presence.check.ts
    - src/panel/api.ts
    - src/panel/components/ReportTable.tsx
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts

key-decisions:
  - "ReconnectRequiredError is re-thrown (not swallowed) from a per-group catch, alongside a 401 OnshapeApiError -- swallowing a genuine session-refresh failure as 'just an unreadable group' would hide a broken session behind a misleading UNRESOLVED result (Rule 1 correctness fix, not in the plan's literal text but consistent with its intent)"
  - "materialAuditCheck constructs its Verdict directly with literal rule:'MAT-AUDIT'/limit:0/unit:'parts' rather than reading rules/2026.json, since it is a CADChecker-internal trust gate, not a Game-Manual numeric limit (per plan design)"

patterns-established:
  - "CheckFn implementations that don't need config (e.g. materialAuditCheck) may omit the second parameter in their arrow function -- structurally valid against CheckFn = (facts, config) => Verdict"

requirements-completed: [WGHT-01]

duration: ~90min
completed: 2026-07-09
---

# Phase 2 Plan 2: Material Audit + Tri-State Verdict + Cross-Document Mass Merge Summary

**Tri-state PASS/FAIL/UNKNOWN Verdict shape, per-group cross-document mass/material enrichment (w/v/m addressing with graceful 403 degradation), and a shipped `materialAuditCheck` (MAT-AUDIT) so a user can click "Check Now" and see the exact set of weight-contributing parts missing a material assignment.**

## Performance

- **Duration:** ~90 min (session start to final commit; commit span ~6 min)
- **Completed:** 2026-07-09
- **Tasks:** 4 (1a, 1b, 2, 3)
- **Files modified:** 12 (2 created, 10 modified)

## Accomplishments

- Extended `Verdict` (engine.ts) to the D-11 tri-state shape (`status`, dual `measured{lb,kg}`, `measuredCount`, `affectedPartCount`/`affectedParts`, `caveats`) plus the single documented `KG_TO_LB` conversion constant, and migrated every Phase-1 consumer (`occurrence-count.check.ts`, `frame-tag-presence.check.ts`, `panel/api.ts`'s `CheckReportVerdict`, `ReportTable.tsx`) in lock-step so the build never went red.
- Extended the shared `Fact` (facts.ts) with `massKg`/`materialAssigned`, both documented so `undefined` always means UNRESOLVED (never `0`/`false`).
- Extended `flatten-assembly.ts` with `AssemblyPartInfo` (carrying `documentVersion`/`documentMicroversion`/`isStandardContent` for cross-document addressing) and the new `groupPartsByElement` helper, grouping `definition.parts[]` by owning Part Studio element.
- Inserted a per-group mass + material fetch/merge step in `check.routes.ts` between the shared traversal and the engine run: each group selects `w/{workspaceId}` (same document) or `v/{documentVersion}` / `m/{documentMicroversion}` fallback (referenced document, 02-MASS-PROPERTIES-CONTRACT.md F3), fetches via the already-existing (02-01) `getPartStudioMassProperties`/`getPartsMetadata`, and merges onto Facts by `partId`. Each group's fetch pair is isolated in its own try/catch: a 401 or a `ReconnectRequiredError` re-throws; any other error (e.g. a 403 on an unreadable other-owner referenced document) is swallowed, leaving that group's parts UNRESOLVED so one bad group never fails the whole `/api/check`.
- Shipped `material-audit.check.ts` (WGHT-01) via full RED→GREEN TDD: a failing test file was committed first (materialAuditCheck did not yet exist), then the pure `CheckFn` implementation was added and registered in `buildEngine()` as a first-class `MAT-AUDIT` report row.

## Task Commits

Each task was committed atomically:

1. **Task 1a: Extend Fact + Verdict shapes, add KG_TO_LB and groupPartsByElement** - `46dea66` (feat)
2. **Task 1b: Migrate all Phase-1 Verdict consumers to the tri-state shape** - `30bfc02` (feat)
3. **Task 2: Per-group cross-document-aware mass + material fetch/merge** - `5f373bb` (feat)
4. **Task 3: Ship material-audit.check.ts (WGHT-01)** - `bed84bf` (test, RED) → `b1056c3` (feat, GREEN)

_TDD gate compliance: Task 3 followed RED (`bed84bf`, tests fail because `materialAuditCheck` does not exist) → GREEN (`b1056c3`, implementation + registration, all 5 behavior tests pass). No REFACTOR commit was needed._

## Files Created/Modified

- `src/server/checks/engine.ts` - Tri-state `Verdict` (`status`/`measured`/`measuredCount`/`affectedPartCount`/`affectedParts`/`caveats`) + `KG_TO_LB` constant; `passesOperator`/`CheckEngine` unchanged.
- `src/server/checks/engine.test.ts` - Migrated `.measured`/`.pass` assertions to `.measuredCount`/`.status`.
- `src/server/traversal/facts.ts` - `Fact.massKg?`/`Fact.materialAssigned?`, documented UNRESOLVED semantics.
- `src/server/traversal/flatten-assembly.ts` - `AssemblyPartInfo` (incl. `documentVersion`/`documentMicroversion`/`isStandardContent`), `AssemblyDefinition.parts?`, and the new `groupPartsByElement` export.
- `src/server/checks/occurrence-count.check.ts` / `frame-tag-presence.check.ts` - Return `status`/`measuredCount`/`caveats: []` against the new `Verdict`.
- `src/panel/api.ts` - `CheckReportVerdict` mirrors the extended backend `Verdict` field-for-field.
- `src/panel/components/ReportTable.tsx` - Tri-state Measured cell (UNKNOWN suppresses the number per D-10), PASS/FAIL/UNKNOWN badge colors, an offending-parts list, and inline caveats -- no CSS framework added.
- `src/server/routes/check.routes.ts` - New per-group merge step (`groupPartsByElement` → per-group wvm selection → per-group try/catch fetch → `enrichedFacts`); `materialAuditCheck` registered in `buildEngine()`.
- `src/server/routes/check.routes.test.ts` - Extended `stubAssemblyDefinition` with same-doc+material, same-doc+no-material/no-mass, and referenced-doc-403 cases; new test asserting merged `enrichedFacts`, 200-on-partial-failure, and per-group wvm/id selection; verdict count bumped to 3 and a `MAT-AUDIT` row assertion added.
- `src/server/checks/material-audit.check.ts` (new) - `materialAuditCheck` pure `CheckFn`; excludes `BATTERY_` parts (D-07), FAILs with the full offending-part list (D-08) when any `materialAssigned === false` (strict -- `undefined`/UNRESOLVED never reported).
- `src/server/checks/material-audit.check.test.ts` (new) - 5 behavior tests (FAIL-with-list, PASS-when-clean, BATTERY_ exclusion, UNRESOLVED exclusion, caveats/measured invariants).

## Decisions Made

- **Re-throw `ReconnectRequiredError` from the per-group catch, not just 401.** The plan's literal text only calls out re-throwing an `OnshapeApiError` with `status === 401`; in practice `client.ts`'s existing `callWithRefresh` wrapper never lets a raw 401 escape (it either succeeds after an internal refresh+retry or converts a failed refresh into `ReconnectRequiredError`). Swallowing `ReconnectRequiredError` as "just an unreadable group" would silently hide a genuinely broken session behind a misleading UNRESOLVED result, so it is re-thrown to the outer handler's existing `ReconnectRequiredError` branch (Rule 1 correctness fix).
- **`materialAuditCheck` omits the `config` parameter** in its arrow function signature (it never reads `rules/2026.json` per the plan's design, since MAT-AUDIT is a CADChecker-internal trust gate, not a Game-Manual limit) -- this is structurally valid against the `CheckFn` type.

## Deviations from Plan

None beyond the `ReconnectRequiredError` re-throw noted above (a Rule 1 auto-fix, not a plan deviation in scope/architecture terms — it strengthens the plan's own "never swallow a 401" intent to also cover "never swallow a failed refresh").

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `Fact.massKg`/`Fact.materialAssigned`, the tri-state `Verdict`, `KG_TO_LB`, and the per-group cross-document merge step are all in place for 02-03's `robotWeightCheck` (R103) and `robotBumpersWeightCheck` (R408) to consume directly -- both are pure `CheckFn`s over the same `enrichedFacts` this plan produces.
- `rules/2026.json`'s `R103`/`R408` `unit: "kg"` → `"lb"` fix (D-03) is still pending -- explicitly out of this plan's `files_modified` list, deferred to 02-03 per the phase's own sequencing.
- No blockers carried forward.

---
*Phase: 02-trustworthy-weight*
*Completed: 2026-07-09*

## Self-Check: PASSED

All 13 created/modified files confirmed present on disk; all 5 task commits (`46dea66`, `30bfc02`, `5f373bb`, `bed84bf`, `b1056c3`) confirmed in git history.

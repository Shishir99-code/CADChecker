---
phase: 03-frame-perimeter-height
plan: 02
subsystem: api
tags: [onshape, bounding-box, convex-hull, d3-polygon, svg, transform, geom-check]

# Dependency graph
requires:
  - phase: 03-frame-perimeter-height (Plan 01)
    provides: getBoundingBoxes/getAssemblyBoundingBoxes client methods, the live-verified 03-BOUNDING-BOX-CONTRACT.md (A1-A4/G1-G4), VERIFIED rules/2026.json
provides:
  - transformPoint (pure occurrence-transform math), floorHull/hullPerimeterInches (pure d3-polygon wrapper)
  - Verdict.geometry / Fact.bboxCornersWorld / CheckReportVerdict.geometry (mirrored server<->panel fields)
  - The route's 5c FRAME_-tagged bbox enrichment block (fetch, transform, merge)
  - framePerimeterCheck (R101), registered in buildEngine()
  - HullRender.tsx, mounted in main.tsx beside ReportTable
affects: [03-03-starting-height-check, phase-4-dashboard-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure geometry utils (src/server/geometry/) with no Onshape/network dependency, unit-tested independently of the route/check layer"
    - "5c enrichment block extends 5b's existing groups/wvm derivation rather than re-deriving it -- same per-group try/catch discipline (401/ReconnectRequiredError rethrown, else swallowed+UNRESOLVED)"
    - "Collision-proof verdict selection: consumers select the perimeter verdict by `v.geometry` presence, not by rule string, due to a pre-existing R101 rule-citation collision (see Known Issues below)"

key-files:
  created:
    - src/server/geometry/transform-point.ts
    - src/server/geometry/transform-point.test.ts
    - src/server/geometry/convex-hull.ts
    - src/server/geometry/convex-hull.test.ts
    - src/server/checks/frame-perimeter.check.ts
    - src/server/checks/frame-perimeter.check.test.ts
    - src/panel/components/HullRender.tsx
    - .planning/phases/03-frame-perimeter-height/deferred-items.md
  modified:
    - src/server/checks/engine.ts
    - src/server/traversal/facts.ts
    - src/panel/api.ts
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts
    - src/panel/main.tsx

key-decisions:
  - "framePerimeterCheck gates UNKNOWN in three distinct branches (SC4 empty-state, unresolved bbox, null hull) so a dropped FRAME_ part or a degenerate hull can never silently produce a false PASS (D-02)"
  - "Perimeter verdict selected by `geometry` field presence, not `rule === 'R101'` string match -- a pre-existing Phase-1 proof-of-plumbing check (occurrenceCountCheck) also positionally cites 'R101' now that rules/2026.json is VERIFIED; documented rather than fixed (out of this plan's file scope)"
  - "5c block reuses 5b's groups map and wvm/wvmid derivation verbatim, adding only the FRAME_-filtered per-part bbox fetch + transformPoint application -- no duplicated addressing logic"

patterns-established:
  - "geometry payload (hullVertices, optional framePartFootprints) mirrored field-for-field between engine.ts's Verdict and panel/api.ts's CheckReportVerdict, matching the existing measured/measuredCount mirroring convention"

requirements-completed: [GEOM-01, GEOM-02]

# Metrics
duration: ~13min active execution
completed: 2026-07-10
---

# Phase 3 Plan 2: Frame Perimeter Check + Hull Render Summary

**Frame-perimeter check computing the 2D convex hull (d3-polygon) of floor-projected, transform-corrected FRAME_ bounding-box corners vs the R101/110in limit, rendered as an inline SVG in the panel.**

## Performance

- **Duration:** ~13 min active execution
- **Completed:** 2026-07-10
- **Tasks:** 3 (all `type="auto" tdd="true"` / `type="auto"`)
- **Files modified:** 14 (6 created source, 1 created doc, 7 modified)

## Accomplishments

- Added `transformPoint` (`src/server/geometry/transform-point.ts`), implementing the 03-BOUNDING-BOX-CONTRACT.md-confirmed row-major transform formula (rotation + translation, indices 3/7/11) -- unit-tested against identity, pure-translation, and rotation+translation cases.
- Added `floorHull`/`hullPerimeterInches` (`src/server/geometry/convex-hull.ts`), wrapping `d3-polygon`'s `polygonHull`/`polygonLength` with a de-dupe step so "fewer than 3 unique projected points" reliably returns `null` (not just d3-polygon's own raw `<3`-points check), plus the new `M_TO_IN` meters-to-inches conversion constant in `engine.ts` (mirrors `KG_TO_LB`).
- Extended `Verdict.geometry` / `Fact.bboxCornersWorld` / `CheckReportVerdict.geometry` (server<->panel mirrored fields), all following the existing "UNRESOLVED, never a substituted default" doc-comment convention.
- Implemented the route's new 5c enrichment block: fetches per-part bounding boxes for `FRAME_`-tagged parts only (via `groupPartsByElement`'s existing groups, reusing 5b's exact wvm/wvmid derivation), enumerates 8 corners guarding against any absent field (G4), applies `transformPoint`, and merges `bboxCornersWorld` onto `Fact[]` before the engine runs.
- Implemented `framePerimeterCheck` (R101): SC4 empty-state short-circuit before any hull math, UNKNOWN gating on any unresolved FRAME_ bbox, a distinct UNKNOWN for a degenerate (`null`) hull, and PASS/FAIL with hull geometry + the D-02/D-04/D-06 standard caveats otherwise. Registered in `buildEngine()`.
- Implemented `HullRender.tsx`: self-contained inline SVG (no chart library, no `dangerouslySetInnerHTML`), auto-scaled to the hull's bounding extents, with the documented Y-flip at the SVG-mapping boundary and status-colored polygon fill/stroke. Mounted in `main.tsx` beside `ReportTable`, selected via `verdicts.find(v => v.geometry)`.
- Added an end-to-end `check.routes.test.ts` test proving the 5c enrichment path actually applies the occurrence transform (a translated 1m unit-cube's corners land in the expected translated range) and that non-`FRAME_` facts never receive bbox data -- validating the "FRAME_ selection path" open flag carried forward from Plan 01's summary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure geometry utils (transform-point, convex-hull) + M_TO_IN + model-field extensions** - `0fa470b` (feat)
2. **Task 2: 5c per-part FRAME_ bbox enrichment in the route + framePerimeterCheck + registration** - `51f7480` (feat)
3. **Task 3: HullRender SVG component + mount in the panel** - `7534454` (feat)

**Plan metadata:** (this commit, following SUMMARY creation)

## Files Created/Modified

- `src/server/geometry/transform-point.ts` / `.test.ts` - Pure occurrence-transform math, unit-tested
- `src/server/geometry/convex-hull.ts` / `.test.ts` - Floor-projection + d3-polygon hull + meters->inches conversion, unit-tested
- `src/server/checks/engine.ts` - Adds `M_TO_IN` constant and `Verdict.geometry` field
- `src/server/traversal/facts.ts` - Adds `Fact.bboxCornersWorld?` (UNRESOLVED convention)
- `src/panel/api.ts` - Mirrors `CheckReportVerdict.geometry`
- `src/server/checks/frame-perimeter.check.ts` / `.test.ts` - The R101 perimeter `CheckFn`, unit-tested (empty-state, unresolved-gate, PASS, FAIL, null-hull)
- `src/server/routes/check.routes.ts` - New 5c enrichment block + `framePerimeterCheck` registration
- `src/server/routes/check.routes.test.ts` - Bumps the verdict-count assertion to 6, adds an end-to-end 5c enrichment test
- `src/panel/components/HullRender.tsx` - Inline SVG hull render
- `src/panel/main.tsx` - Mounts `HullRender` beside `ReportTable`
- `.planning/phases/03-frame-perimeter-height/deferred-items.md` - Logs the pre-existing R101/R103 rule-citation collision (see Known Issues)

## Decisions Made

- **Three distinct UNKNOWN branches, never a shrunk hull:** SC4 empty-state (no FRAME_ parts), unresolved-bbox gate (any FRAME_ part's geometry unreadable), and null-hull (degenerate <3-unique-point geometry) are each their own branch with distinct caveat wording -- mirrors `robotWeightCheck`'s gating discipline and never silently drops a point from the hull.
- **`M_TO_IN` applied exactly once**, inside `hullPerimeterInches`, mirroring `KG_TO_LB`'s single-conversion-boundary discipline.
- **Verdict selection by `geometry` field, not rule string:** both the new `check.routes.test.ts` test and `main.tsx` select the perimeter verdict via `v.geometry` presence rather than `v.rule === "R101"`, because of a pre-existing rule-citation collision (see Known Issues) -- this matches `03-02-PLAN.md`'s own Task 3 guidance verbatim.

## Deviations from Plan

### Auto-fixed Issues

None required Rule 1/2/3 auto-fixes to plan-owned files. One out-of-scope discovery was logged (not fixed) per the Scope Boundary rule:

**1. [Scope Boundary — logged, not fixed] Pre-existing R101/R103 rule-citation collision**
- **Found during:** Task 2, while writing the end-to-end `check.routes.test.ts` enrichment test.
- **Issue:** `occurrenceCountCheck` (Phase 1 "proof-of-plumbing" check, `src/server/checks/occurrence-count.check.ts`) cites `config.rules[0]` **positionally**. Now that Plan 01 flipped `rules/2026.json` to VERIFIED real data, `rules[0]` is the genuine R101 entry -- so `occurrenceCountCheck`'s Verdict also reports `rule: "R101"`, colliding with this plan's new `framePerimeterCheck` R101 verdict in the same `/api/check` response. The identical pattern affects `frameTagPresenceCheck` (`config.rules[1]`) vs. `robotWeightCheck`'s genuine R103 citation, silently present since Phase 2.
- **Why not fixed:** `occurrence-count.check.ts` / `frame-tag-presence.check.ts` are outside this plan's `files_modified` list; the collision is a pre-existing design property of Phase 1 scaffolding, not something this plan's changes broke -- Plan 01's PLACEHOLDER->VERIFIED flip is what first gave it real semantic meaning.
- **Mitigation:** Every consumer this plan touches (`check.routes.test.ts`, `frame-perimeter.check.test.ts`, `main.tsx`'s `HullRender` mount) selects the perimeter verdict by `geometry` field presence, never by rule string -- collision-proof by construction.
- **Logged in:** `.planning/phases/03-frame-perimeter-height/deferred-items.md`, with a recommended follow-up (retire the Phase-1 proof-of-plumbing checks or give them non-colliding rule identifiers, mirroring `materialAuditCheck`'s `"MAT-AUDIT"` convention).

---

**Total deviations:** 0 auto-fixed; 1 out-of-scope issue logged (not fixed).
**Impact on plan:** No scope creep. The logged collision does not affect this plan's own success criteria (all of which are satisfied using the collision-proof `geometry` selector), but is worth prioritizing before Phase 4's dashboard polish makes rule-string-keyed UI more prominent.

## Issues Encountered

None blocking. During verification, I accidentally ran `git checkout HEAD~3 -- .` while diffing against a prior commit to confirm the pre-existing-TypeScript-error hypothesis, which reverted several tracked working-tree files (including the not-yet-committed Task 3 edit to `main.tsx`) to their state from before this plan's Task 1 commit. Recovered immediately via `git checkout HEAD -- .` (restoring all Task 1/2 work, already safely committed) and manually re-applied the lost Task 3 `main.tsx` edit (re-adding the `HullRender` import and mount block) before re-verifying and committing Task 3. No commits were lost; `HullRender.tsx` itself was untouched throughout since it was still untracked at the time.

## Known Stubs

None. `framePerimeterCheck` and `HullRender` are fully wired to real server-computed geometry (no hardcoded/placeholder data); the empty-state and unresolved-gate paths are intentional UNKNOWN verdicts per D-02, not stubs.

## Threat Flags

None. All new surface (5c bbox fetch, `framePerimeterCheck`, `HullRender`) was already covered by this plan's own `<threat_model>` (T-03-03 through T-03-06) and implemented per those mitigations (server-derived ids only, per-group swallow-and-UNRESOLVED, no `dangerouslySetInnerHTML`, UNKNOWN-gate against false PASS).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (starting-height check) can proceed independently -- it uses `getAssemblyBoundingBoxes(...).highZ` directly per the contract's G3 guidance, with no dependency on this plan's per-part FRAME_ enrichment.
- The `FRAME_`-tag selection path (`Fact.name.startsWith("FRAME_")` filtering in the 5c enrichment), flagged as unproven end-to-end in Plan 01's summary, is now covered by a dedicated `check.routes.test.ts` test confirming both the filtering and the transform application against a translated fixture.
- **Carried-forward flag:** the pre-existing R101/R103 rule-citation collision (see Deviations/Known Issues above) should be resolved before Phase 4's dashboard polish widens the audience for rule-string-keyed UI lookups -- recommended follow-up is documented in `deferred-items.md`.

---
*Phase: 03-frame-perimeter-height*
*Completed: 2026-07-10*

## Self-Check: PASSED

All created files verified present on disk; all task commits (0fa470b, 51f7480, 7534454) verified present in git history.

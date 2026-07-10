---
phase: 03-frame-perimeter-height
plan: 01
subsystem: api
tags: [onshape, bounding-box, geometry, d3-polygon, transform, season-config]

# Dependency graph
requires:
  - phase: 02-trustworthy-weight
    provides: callWithRefresh raw-fetch-then-cast client idiom, assembly-level single-call pattern (F4), UNRESOLVED-gating discipline
provides:
  - Two typed Onshape client methods (getBoundingBoxes, getAssemblyBoundingBoxes) routed through callWithRefresh
  - A throwaway live-verification spike (scripts/spike-bounding-boxes.ts) confirming the bounding-box coordinate frame
  - A live-verified 03-BOUNDING-BOX-CONTRACT.md that locks the coordinate-frame + transform-layout + units contract for Plan 02/03
  - rules/2026.json season limits flipped from PLACEHOLDER to VERIFIED (documentary only, no numeric change)
affects: [03-02-frame-perimeter-check, 03-03-starting-height-check]

# Tech tracking
tech-stack:
  added: [d3-polygon@3.0.1, "@types/d3-polygon@3.0.2"]
  patterns:
    - "Live-verification spike script (scripts/spike-bounding-boxes.ts) mirrors Phase 2's spike-mass-properties.ts to de-risk an undocumented API contract BEFORE check logic is written"
    - "Occurrence -> part join goes through an instance map (rootAssembly.instances + subAssemblies[].instances), never a direct path.last === partId match"

key-files:
  created:
    - scripts/spike-bounding-boxes.ts
    - .planning/phases/03-frame-perimeter-height/03-BOUNDING-BOX-CONTRACT.md
  modified:
    - src/server/onshape-client/client.ts
    - rules/2026.json
    - .planning/phases/03-frame-perimeter-height/03-RESEARCH.md
    - package.json
    - package-lock.json

key-decisions:
  - "Per-part getBoundingBoxes returns LOCAL (Part-Studio) coordinates; the occurrence transform MUST be applied to reach world space (A1, live-confirmed)"
  - "getAssemblyBoundingBoxes is already world-space; no transform is applied to it (A2, live-confirmed)"
  - "The research-inferred row-major transform formula (translation in indices 3/7/11, world = R*local + T) is correct AS-IS -- no correction needed (A3, live-confirmed)"
  - "Bounding-box values are SI meters; convert with a single M_TO_IN = 39.37007874 constant, mirroring Phase 2's KG_TO_LB pattern (A4, live-confirmed)"
  - "occurrences[].path holds INSTANCE ids, not part ids -- the occurrence-to-part join must resolve the leaf instance id through an instances map built from rootAssembly.instances + every subAssemblies[].instances entry (G1, discovered via a spike bug fix)"
  - "rules/2026.json limitStatus is a documentary-only field (not present in RuleEntrySchema), so flipping PLACEHOLDER->VERIFIED cannot break config validation"

patterns-established:
  - "Design guidance G1-G4 in 03-BOUNDING-BOX-CONTRACT.md is the load-bearing spec for Plan 02 (perimeter hull) and Plan 03 (starting height) -- G2 governs per-part-corner-transform-then-hull, G3 governs assembly-level-highZ-for-height, G4 governs never-default-absent-fields-to-zero"

requirements-completed: [GEOM-01, GEOM-03]

# Metrics
duration: ~15min active execution (excludes the Task 2 checkpoint pause, during which a human ran the live spike against a real Onshape document)
completed: 2026-07-10
---

# Phase 3 Plan 1: Bounding-Box API + Live Coordinate-Frame Verification Summary

**Two typed Onshape bounding-box client methods, a live-verified coordinate-frame contract confirming per-part LOCAL vs assembly WORLD-space geometry, and season limits flipped to VERIFIED against the 2026 Game Manual.**

## Performance

- **Duration:** ~15 min of active agent execution across two sessions (Task 1 + Task 3), separated by a blocking checkpoint during which a human ran the live spike against a real Onshape document and recorded the contract
- **Completed:** 2026-07-10
- **Tasks:** 3 (1 auto, 1 checkpoint:human-verify, 1 auto)
- **Files modified:** 7 (client.ts, spike script, contract doc, research doc, rules/2026.json, package.json, package-lock.json)

## Accomplishments

- Added `getBoundingBoxes` (per-part) and `getAssemblyBoundingBoxes` (whole-robot) typed client methods to `src/server/onshape-client/client.ts`, both routed through `callWithRefresh` using the established raw-fetch-then-cast idiom.
- Installed `d3-polygon` + `@types/d3-polygon` (both slopcheck-audited `[OK]`) for Plan 02's convex-hull computation.
- **Live-confirmed the phase's single biggest unknown** — the bounding-box coordinate frame — via `scripts/spike-bounding-boxes.ts` run against the real `finalindex` Onshape document. All four research assumptions (A1-A4) were confirmed correct with no corrections needed to the inferred transform formula.
- Fixed a bug discovered during the live-verification run: the spike's original occurrence-to-part join incorrectly assumed `occurrences[].path[last] === partId`; the correct join resolves the leaf path id through an instance map built from `rootAssembly.instances[]` and every `subAssemblies[].instances[]` entry.
- Flipped `rules/2026.json`'s four season-limit entries (R101, R103, R104, R408) from `limitStatus: "PLACEHOLDER"` to `"VERIFIED"`, with the top-level `note` rewritten to cite the 2026 Game Manual (Team Update 22) and clarify the R101-defines/R104-states-the-number split and the R104-vs-R107 distinction. No numeric limit, rule, title, unit, or operator value was changed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install d3-polygon and add the two bounding-box client methods + spike script** - `4dc5956` (feat)
   - Follow-up doc commit recording Task 1 completion + Task 2 checkpoint pause: `a72329a` (docs)
2. **Task 2: Live-verify the bounding-box coordinate frame + transform layout against a real document** - `204db9b` (docs) — includes the contract doc, the spike-script occurrence-join bug fix, and the 03-RESEARCH.md Open Questions 1/2 resolution
3. **Task 3: Flip season limits R101/R103/R104/R408 from PLACEHOLDER to VERIFIED** - `45f070f` (feat)

**Plan metadata:** (this commit, following SUMMARY creation)

## Files Created/Modified

- `src/server/onshape-client/client.ts` - Adds `BoundingBoxResponse` type alias and `getBoundingBoxes`/`getAssemblyBoundingBoxes` methods on the `OnshapeClient` interface + `createOnshapeClient`, each wrapped in `callWithRefresh`
- `scripts/spike-bounding-boxes.ts` - Throwaway live-verification spike; fetches a FRAME_ (or off-origin fallback) part's per-part box, applies the transform, and fetches the assembly-level box; occurrence-to-part join now goes through an instance map (bug fix)
- `.planning/phases/03-frame-perimeter-height/03-BOUNDING-BOX-CONTRACT.md` - Records the live-confirmed A1-A4 answers and G1-G4 design guidance for Plan 02/03
- `.planning/phases/03-frame-perimeter-height/03-RESEARCH.md` - Open Questions 1 and 2 marked resolved in place, pointing to the contract doc
- `rules/2026.json` - `limitStatus` PLACEHOLDER -> VERIFIED on all four rule entries; `note` rewritten citing the 2026 Game Manual (TU22)
- `package.json` / `package-lock.json` - `d3-polygon` (dependencies) + `@types/d3-polygon` (devDependencies) added

## Decisions Made

- **Coordinate-frame contract locked (A1-A4):** per-part boxes are LOCAL and need the occurrence transform applied; the assembly-level box is already WORLD-space; the row-major transform formula (translation in indices 3/7/11) is correct as originally inferred, requiring no correction; box values are SI meters. All four are now load-bearing spec for Plan 02/03, not inference.
- **Occurrence-to-part join must use an instance map (G1):** `occurrences[].path[]` holds instance ids, not part ids. Plan 02's perimeter enrichment and any future occurrence-to-part join in this codebase must resolve the leaf instance id through `rootAssembly.instances[]` + `subAssemblies[].instances[]`, exactly as the corrected spike now does — this generalizes beyond the spike to any future geometry/occurrence code.
- **`limitStatus` is documentary-only:** confirmed via `src/server/config/schema.ts`'s `RuleEntrySchema` that `limitStatus` is not a validated schema field, so flipping it cannot affect `loadSeasonConfig`'s zod validation — verified by re-running `load-season.test.ts` after the change (still green).

## Deviations from Plan

None — plan executed exactly as written. The occurrence-join bug fix in `scripts/spike-bounding-boxes.ts` was made by the checkpoint orchestrator during the human-verify gate itself (per the resume-instructions context), not as an executor-side deviation during this continuation; it is documented here for completeness since it is committed as part of Task 2's atomic commit.

## Issues Encountered

None during this continuation. The prior session's Task 2 checkpoint blocked correctly (as designed — `gate="blocking"`, `autonomous: false`) until the human ran the live spike and typed "approved"; no auth gates or unresolved errors were hit during Task 3's execution.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (frame-perimeter check) can now implement `transform-point.ts` and the perimeter `CheckFn` directly from `03-BOUNDING-BOX-CONTRACT.md`'s locked A1-A4 answers and G1-G2 design guidance, with zero remaining coordinate-frame ambiguity.
- Plan 03 (starting-height check) can use `getAssemblyBoundingBoxes(...).highZ` directly per G3, with no transform needed.
- **Open flag carried forward:** the `finalindex` test document used for the live spike has **no `FRAME_`-tagged parts** (it used the first off-origin Part occurrence instead, per the contract's caveat). The coordinate-frame conclusions (A1-A4) are fully valid since they don't depend on the tag, but the `FRAME_`-tag *selection* path itself (`Fact.name.startsWith("FRAME_")` filtering in Plan 02's enrichment) remains unproven end-to-end against a live, properly tagged document. Plan 02 execution should validate this selection path against a document with real `FRAME_`-tagged parts before considering the perimeter check production-trustworthy.
- Season config (`rules/2026.json`) is now fully VERIFIED for this phase's rules (R101/R104) and the two weight rules (R103/R408) — no remaining `PLACEHOLDER` entries anywhere in the file.

---
*Phase: 03-frame-perimeter-height*
*Completed: 2026-07-10*

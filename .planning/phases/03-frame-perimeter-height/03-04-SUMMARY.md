---
phase: 03-frame-perimeter-height
plan: 04
subsystem: api
tags: [onshape, assembly-traversal, bounding-box, convex-hull, gap-closure]

# Dependency graph
requires:
  - phase: 03-frame-perimeter-height
    provides: flattenAssembly occurrence traversal (03-02), per-occurrence 5c bbox enrichment scaffold (03-02), floor-projected convex-hull perimeter check (03-02)
provides:
  - flattenAssembly resolves each occurrence's leaf instance id to its real CAD partId (Fact.partId), closing the permanently-broken 5b/5c enrichment join on any real multi-instance Onshape document (CR-01)
  - check.routes.ts 5c enrichment caches the LOCAL FRAME_ bbox once per unique CAD partId and applies each occurrence's own transform, storing world corners keyed by occurrence path -- every placement of a reused frame part now contributes to the perimeter hull (CR-02)
  - regression fixtures using deliberately distinct instance-id/CAD-partId strings plus a two-occurrence same-partId FRAME_ fixture, so this class of id-aliasing/occurrence-collapse bug is guarded against reintroduction (WR-02)
affects: [03-frame-perimeter-height verification, phase-04 dashboard polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Instance id vs CAD partId resolution: flattenAssembly resolves occ.path leaf id through instanceById.get(leafId)?.partId, falling back to the leaf id only when unresolved -- never a silent false match."
    - "Cache-once-per-partId, transform-per-occurrence: LOCAL geometry fetched once per unique CAD partId (part-invariant), then each occurrence applies its own world transform and is stored under a per-occurrence key (fact.path.join('/'))."

key-files:
  created: []
  modified:
    - src/server/traversal/flatten-assembly.ts
    - src/server/traversal/flatten-assembly.test.ts
    - src/server/routes/check.routes.ts
    - src/server/routes/check.routes.test.ts
    - .planning/phases/03-frame-perimeter-height/deferred-items.md

key-decisions:
  - "InstanceInfo gains an optional partId field with a doc-comment explaining real Onshape Part instances carry it at runtime even though the generated .d.ts omits it -- avoids importing the (incomplete) generated type into the network-free traversal module."
  - "5c enrichment split into two passes: localCornersByPartId (fetched once per unique frame CAD partId, still LOCAL/untransformed) and bboxByOccurrence (per-occurrence transform application, keyed by fact.path.join('/')) -- keeps getBoundingBoxes call count unchanged (once per partId) while fixing the occurrence-collapse bug."
  - "Two pre-existing, out-of-scope tsc --noEmit errors (missing onshape.d.ts, an implicit-any in the untouched 5b block) were confirmed present on the base commit before this plan started and logged to deferred-items.md rather than fixed, per the Scope Boundary rule -- neither is caused by this plan's changes."

patterns-established:
  - "Pattern: any occurrence-to-part join must resolve through instance.partId, never assume the occurrence path's leaf id IS the CAD partId."
  - "Pattern: any per-part-geometry enrichment that must respect multiple occurrences of the same reused part should cache the network fetch by partId but key the final transformed result by occurrence (path), never by partId alone."

requirements-completed: [GEOM-01, GEOM-02]

# Metrics
duration: 8min
completed: 2026-07-10
---

# Phase 03 Plan 04: Gap Closure (CR-01/CR-02) Summary

**Fixed the permanently-broken frame-perimeter enrichment join (instance id vs CAD partId) and the occurrence-collapse bug that silently dropped reused FRAME_ part placements from the hull, closing verification gaps CR-01/CR-02 with distinct-id-space and two-occurrence regression tests.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-10T11:32:xx-04:00
- **Completed:** 2026-07-10T11:37:06-04:00
- **Tasks:** 3 completed
- **Files modified:** 4 source/test files + 1 deferred-items.md note

## Accomplishments
- `flattenAssembly` now resolves each occurrence's leaf instance id to its real CAD partId (`instance?.partId ?? leafId`) instead of assigning the raw instance id to `Fact.partId` -- the 5b mass/material join and the 5c bbox join now actually match on any real document where instance id != CAD partId (previously permanently stuck in UNKNOWN/UNRESOLVED).
- `check.routes.ts`'s 5c enrichment block now caches each unique FRAME_ part's LOCAL bounding box once (`localCornersByPartId`) and applies **every occurrence's own transform** separately, storing world corners keyed by `fact.path.join("/")` (`bboxByOccurrence`) -- a frame part reused at N locations now contributes N distinct footprints to the perimeter hull instead of collapsing to whichever occurrence was processed last.
- Regression coverage rewritten with deliberately distinct instance-id/CAD-partId fixtures (`occ-frame-1`/`"JHD"`, etc.) so the 5b/5c joins are proven to resolve through `instance.partId`, not id-aliasing coincidence, plus a new `stubTwoOccurrenceAssembly()` fixture and test asserting the perimeter hull's X-extent spans both placements of a reused "BRK" bracket.
- `frame-perimeter.check.ts` and the 5d/GEOM-03 starting-height path are untouched and confirmed still green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve leaf instance id -> real CAD partId in flattenAssembly (CR-01 / Gap 1)** - TDD: `80b7444` (test, RED) -> `c376bb8` (feat, GREEN)
2. **Task 2: Rekey 5c FRAME_ enrichment per OCCURRENCE, not per partId (CR-02 / Gap 2)** - `4d124c4` (fix)
3. **Task 3: Regression fixtures — distinct id spaces + two-occurrence FRAME_ guard (WR-02 / both gaps)** - `e21561e` (test)

**Plan metadata:** (this commit) `docs(03-04): complete gap-closure plan`

_Note: Task 1 followed the full TDD RED/GREEN cycle. Task 3 writes regression tests against already-fixed code (Tasks 1-2 landed first); the pre-fix failure mode is documented in code comments per the plan's own guidance rather than demonstrated live, since the pre-fix implementation no longer exists in the working tree by the time Task 3 runs._

## Files Created/Modified
- `src/server/traversal/flatten-assembly.ts` - `InstanceInfo.partId?: string` added; `flattenAssembly` resolves `instance?.partId ?? leafId` into `Fact.partId` instead of the raw leaf instance id.
- `src/server/traversal/flatten-assembly.test.ts` - Fixture instances now carry a `partId` distinct from their `id`; resolution assertions check the CAD partId.
- `src/server/routes/check.routes.ts` - 5c block reworked: `localCornersByPartId` (cached once per unique frame partId, LOCAL) + `bboxByOccurrence` (per-occurrence transform, keyed by `fact.path.join("/")`); `enrichedFacts` merge reads by occurrence key. 5b and 5d blocks unchanged.
- `src/server/routes/check.routes.test.ts` - `stubAssemblyDefinition` rekeyed to distinct instance-id/CAD-partId strings across all 5b/5c stubs and assertions; new `stubTwoOccurrenceAssembly()` + CR-02 guard test.
- `.planning/phases/03-frame-perimeter-height/deferred-items.md` - Logged two pre-existing, out-of-scope `tsc --noEmit` errors confirmed present before this plan started.

## Decisions Made
- See `key-decisions` in frontmatter above -- summarized: instance-id resolution via an explicit optional `InstanceInfo.partId`; 5c split into cache-once-per-partId + transform-per-occurrence; pre-existing tsc errors deferred, not fixed (out of this plan's scope).

## Deviations from Plan

None — plan executed exactly as written. The plan itself anticipated the two pre-existing tsc errors would be encountered (they are unrelated to the plan's `files_modified` scope) and Task 2's own instructions explicitly excluded the 5b block from rework, which is where one of those errors lives; no auto-fix rule applied since neither issue was introduced by this plan's changes.

## Issues Encountered
None — all three tasks' verification commands passed on the first implementation attempt (after the intentional RED step in Task 1).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- GEOM-01 (frame perimeter, R101) is now honestly satisfiable end-to-end against a real multi-instance Onshape document: the join resolves via CAD partId, and every occurrence of a reused frame part contributes to the hull.
- GEOM-02 (HullRender) requires no code change — it already consumes `perimeterVerdict.geometry.hullVertices`, which now reflects real, un-collapsed geometry.
- GEOM-03 (starting height) remains untouched and verified passing.
- Full test suite: 86/86 passing (`npm test`). `npx tsc -p tsconfig.server.json --noEmit` still reports the same two pre-existing errors present before this plan (see deferred-items.md) — no new errors introduced by this plan.
- Recommend re-running `/gsd-verify-phase 03` (live, against a `FRAME_`-tagged doc) to confirm CR-01/CR-02 closure end-to-end per STATE.md's "Next" pointer.

---
*Phase: 03-frame-perimeter-height*
*Completed: 2026-07-10*

## Self-Check: PASSED

All modified/created files confirmed present on disk; all task commit hashes (80b7444, c376bb8, 4d124c4, e21561e) and the SUMMARY commit (9d74d62) confirmed present in git log.

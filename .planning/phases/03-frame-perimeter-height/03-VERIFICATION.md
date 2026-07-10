---
phase: 03-frame-perimeter-height
verified: 2026-07-10T15:30:00Z
status: gaps_found
score: 6/9 must-haves verified
overrides_applied: 0
gaps:
  - truth: "User sees a robot/frame perimeter verdict (R101/R104) computed as the 2D convex hull of the floor-plane projection of FRAME_-tagged parts' bounding-box corners — not a raw bounding box, not a 3D hull, and functioning against a real multi-instance Onshape document"
    status: failed
    reason: "flattenAssembly() assigns Fact.partId the occurrence's leaf INSTANCE id (never resolving it to the real CAD partId via an instance map, despite 03-BOUNDING-BOX-CONTRACT.md G1 explicitly requiring this). check.routes.ts's 5c enrichment block builds frameFactsById keyed by that same (wrong) Fact.partId, then filters definition.parts[]'s real CAD partIds against it. On any real document where instance id != CAD partId (the normal case), this join never matches, bboxByPartId stays empty, every FRAME_ fact's bboxCornersWorld stays undefined, and framePerimeterCheck permanently falls into its 'unresolved' UNKNOWN branch — it can never produce a real PASS/FAIL hull verdict in production. Independently reproduced with a minimal fixture using distinct instance-id/partId strings (join returned 0 matches) — confirms 03-REVIEW.md CR-01 by direct execution, not just static reading."
    artifacts:
      - path: "src/server/traversal/flatten-assembly.ts:83-97"
        issue: "partId: leafId assigns the occurrence's leaf path id (an instance id) directly as Fact.partId; never resolved through instanceById to the real CAD partId. InstanceInfo type doesn't even carry a partId field to resolve to."
      - path: "src/server/routes/check.routes.ts:190-259"
        issue: "5c block's frameFactsById Map and framePartIds filter both key/match on Fact.partId, which is actually an instance id per the bug above — the join against definition.parts[]'s real CAD partIds silently fails on any real document."
    missing:
      - "flattenAssembly() must resolve each occurrence's leaf path id through the instance map to the part's REAL CAD partId (per 03-BOUNDING-BOX-CONTRACT.md G1), OR the 5c/5b joins must be reworked to join on instance id consistently end-to-end."
      - "check.routes.test.ts fixtures must use deliberately DIFFERENT instance-id and part-id strings (not the current inst-1/inst-1 aliasing) so this class of bug cannot be silently reintroduced and masked by tests again."
  - truth: "The perimeter hull includes every occurrence of a FRAME_ part (not just one), so a frame rail/bracket reused at multiple locations is never silently undersized (D-02 'never a false PASS')"
    status: failed
    reason: "check.routes.ts's 5c enrichment keys bboxByPartId as a Map<partId, corners> and frameFactsById as new Map([...].map(f => [f.partId, f])) — both collapse multiple occurrences sharing one partId down to the LAST occurrence processed. Once CR-01 above is fixed and the join actually starts succeeding, a FRAME_ part placed at N locations (the standard FRC drivetrain-rail topology) will contribute only ONE occurrence's transformed corners to the hull, silently omitting the other N-1 real-world positions — directly risking an undersized measured perimeter, i.e. a false PASS. This is the exact failure mode the phase's own design doc (03-BOUNDING-BOX-CONTRACT.md G1: 'the perimeter hull must include the transformed corners of every occurrence, not just one') and D-02 were written to prevent. Independently reproduced: two occurrences of the same CAD partId with different transforms collapse to a Map of size 1, retaining only the last occurrence's transform."
    artifacts:
      - path: "src/server/routes/check.routes.ts:190-192"
        issue: "frameFactsById = new Map(facts...map(f => [f.partId, f])) — last-write-wins per partId, discards all but one Fact per CAD part."
      - path: "src/server/routes/check.routes.ts:255-258"
        issue: "bboxByPartId.set(partId, ...) inside framePartIds.forEach — one entry per partId regardless of how many occurrences share it; enrichedFacts.map() then assigns the SAME bboxCornersWorld array to every occurrence-Fact sharing that partId."
    missing:
      - "Enrichment must be keyed per OCCURRENCE (e.g. occurrence path.join('/') or an index), not per partId alone. The per-part LOCAL box fetch can still be cached once per partId, but transform application + resulting bboxCornersWorld must be stored per occurrence, and frame-perimeter.check.ts must consume all resulting per-occurrence corner sets."
      - "A check.routes.test.ts fixture with the same partId at two occurrences with different transforms, asserting the resulting hull/enriched facts include points from BOTH occurrences."
deferred: []
human_verification: []
---

# Phase 3: Frame Perimeter & Height Verification Report

**Phase Goal:** Robot/frame perimeter computed as the 2D convex hull of the floor-plane projection of FRAME_-tagged parts (rendered visually), plus the whole-robot starting-configuration height check, each cited to its rule and gated to UNKNOWN rather than a false PASS.
**Verified:** 2026-07-10
**Status:** gaps_found
**Re-verification:** No — initial verification

## Note on prior code review

`.planning/phases/03-frame-perimeter-height/03-REVIEW.md` (status: `issues_found`, 2 Critical: CR-01, CR-02) already identified the defects reported here. This verification independently re-derived and **executed** both defects against the actual code (not just read the review) — see "Independent Reproduction" below — and confirms they are goal-blocking, not stylistic.

## Independent Reproduction

Ran two minimal Node scripts (via `node --experimental-strip-types`) directly importing the shipped `flattenAssembly`, `groupPartsByElement`, and `transformPoint` from the repo (not test-suite fixtures):

**CR-01 reproduction** (distinct instance-id `"M123"` vs. real CAD `partId: "JHD"`):
```
Fact.partId produced: M123  (expected real CAD partId 'JHD', got instance id)
Real CAD partIds in this group: [ 'JHD' ]
frameFactsById keys: [ 'M123' ]
Matched framePartIds (join result): []
=> CONFIRMED: join fails, FRAME_ part never gets bboxCornersWorld
```

**CR-02 reproduction** (same CAD `partId: "JHD-rail"` at two occurrences with different transforms, simulating a post-CR-01-fix join):
```
Number of distinct FRAME_ occurrence facts: 2
Number of entries survived in frameFactsById Map (keyed by partId): 1
Surviving fact's transform (only ONE occurrence's transform is used): [1,0,0,100, 0,1,0,200, 0,0,1,0, 0,0,0,1]
=> CONFIRMED CR-02: occurrence collapsed, only last occurrence's transform survives
```

Both defects are real, present in the shipped code, and independent of the code-review's own description — I did not simply trust the review's prose.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Perimeter verdict (R101/R104) computed as a real 2D convex hull of floor-projected FRAME_ bbox corners, functioning against a real multi-instance document | ✗ FAILED | CR-01: `flatten-assembly.ts:91` sets `Fact.partId` to the leaf **instance** id, never resolved to the real CAD `partId`. `check.routes.ts:190-259`'s join against `definition.parts[]`'s real partIds never matches on a real document → `bboxCornersWorld` always undefined → `framePerimeterCheck` permanently returns its "unresolved" UNKNOWN, never a real hull. Independently reproduced (see above). |
| 2 | Hull includes every occurrence of a reused FRAME_ part — never a false PASS from an undersized hull | ✗ FAILED | CR-02: `check.routes.ts:190-192,255-258` keys `frameFactsById`/`bboxByPartId` by `partId` alone; `new Map(...)` construction keeps only the last occurrence per partId. Even after CR-01 is fixed, a FRAME_ part reused at N locations contributes only 1 occurrence's corners — directly violates D-02 "prefer false FAIL, never false PASS." Independently reproduced (see above). |
| 3 | Perimeter verdict is UNKNOWN with exact wording "not yet checkable — no frame parts tagged" when zero FRAME_ parts exist | ✓ VERIFIED | `frame-perimeter.check.ts:51-60` short-circuits on `frameFacts.length === 0` with the exact SC4 caveat string, before any hull math. This branch operates on `Fact.name` only (unaffected by the CR-01/CR-02 partId bug) and is unit-tested. |
| 4 | Perimeter verdict is UNKNOWN (never a silently-shrunk hull) when any FRAME_ part's bbox could not be read | ⚠️ VACUOUSLY TRUE (not exercised as designed) | The gating code (`frame-perimeter.check.ts:62-76`) is correctly written and would work if `bboxCornersWorld` were only sometimes undefined for a genuinely unreadable part — but per CR-01, it is ALWAYS undefined for every FRAME_ part in production, so this branch fires unconditionally rather than selectively. The check never reaches its PASS/FAIL branch with real data today. Counted as part of Gap #1, not a separate pass. |
| 5 | Computed hull rendered as an inline SVG polygon with perimeter length + season limit labeled; measured configuration disclosed | ⚠️ ORPHANED (correct code, never exercised with real data) | `src/panel/components/HullRender.tsx` is well-implemented: renders `null` when `geometry` absent, correctly negates Y at the SVG boundary (documented), labels `measuredCount unit` and `limit unit`. Wired into `src/panel/main.tsx:8,98` via `verdicts.find(v => v.geometry)`. Configuration-disclosure caveat present in `STANDARD_CAVEATS` (`frame-perimeter.check.ts:14-19`). However, because of Gap #1, `geometry` is never populated against a real document today — this component is currently unreachable with production data (Level 4 data-flow: DISCONNECTED upstream, not the component's own fault). |
| 6 | Starting-configuration height verdict (R104) computed as whole-robot max +Z extent vs. season limit | ✓ VERIFIED | `check.routes.ts:274-299` (5d block) calls `getAssemblyBoundingBoxes` ONCE with server-derived ids, copies `highZ` onto every fact as `robotMaxZWorld`. `starting-height.check.ts:34-67` converts via `M_TO_IN`, compares via `passesOperator`. This path does **not** depend on the partId join — unaffected by CR-01/CR-02. Unit tests (`starting-height.check.test.ts`) and `check.routes.test.ts`'s 5d test both pass and exercise the real enrichment shape (not aliased ids). |
| 7 | Height measured via a single assembly-level API call covering ALL occurrences (not just FRAME_ parts) | ✓ VERIFIED | `check.routes.ts:288`: exactly one `getAssemblyBoundingBoxes` call, not per-group/per-part; `robotMaxZWorld` copied onto every enriched fact (`check.routes.ts:307-313`), independent of the `FRAME_` name filter. |
| 8 | Height verdict is UNKNOWN (never a silent 0) when the assembly-level box could not be read | ✓ VERIFIED | `starting-height.check.ts:40-51`: gate is `facts.every(f => f.robotMaxZWorld === undefined)`, not a coerced default. `check.routes.ts:290-299`: any non-401/non-ReconnectRequiredError leaves `robotMaxZWorld` unset. Unit-tested. |
| 9 | Season limits R101/R103/R104/R408 recorded VERIFIED (not PLACEHOLDER); bbox coordinate frame + transform layout live-confirmed before check code was written | ✓ VERIFIED | `rules/2026.json`: all four `limitStatus: "VERIFIED"`, numeric limits unchanged (110/115/30/135). `03-BOUNDING-BOX-CONTRACT.md` records live-confirmed A1-A4 (LOCAL-vs-world coordinate frame, row-major transform w/ translation at indices 3/7/11, SI meters) against the real `finalindex` document. **Caveat, itself disclosed in the contract doc:** `finalindex` has no `FRAME_`-tagged parts, so the FRAME_-tag *selection + join* path (as opposed to the transform math) was never live-verified end-to-end — which is precisely the path where CR-01/CR-02 hide. |

**Score:** 6/9 truths verified (2 hard FAILED, 1 vacuously-true/masked, 1 orphaned-by-upstream-failure counted within the FAILED items per Step 9 grouping)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/onshape-client/client.ts` (`getBoundingBoxes`, `getAssemblyBoundingBoxes`) | Typed client methods routed through `callWithRefresh` | ✓ VERIFIED | Both present, typecheck (`tsc -p tsconfig.server.json --noEmit` exits 0), used by both 5c and 5d route blocks. |
| `src/server/geometry/transform-point.ts` | Pure `transformPoint(m, p)` per confirmed contract | ✓ VERIFIED | Row-major, translation at indices 3/7/11, matches 03-BOUNDING-BOX-CONTRACT.md A3 verbatim; unit-tested (identity/translation/rotation cases). |
| `src/server/geometry/convex-hull.ts` | `floorHull` + `hullPerimeterInches` via d3-polygon | ✓ VERIFIED | Correct floor-projection, dedup, `M_TO_IN` applied once. Correct in isolation — the defect is entirely upstream in the enrichment join, not in this file. |
| `src/server/checks/frame-perimeter.check.ts` | Pure `framePerimeterCheck`, UNKNOWN-gated, carries geometry | ⚠️ STUB-BY-DATA-STARVATION | Code itself is well-formed and passes all its unit tests (fabricated `Fact[]`), but is unreachable in its PASS/FAIL branch against real route-enriched data because of CR-01. Correct code, wrong (starved) inputs in production. |
| `src/server/checks/starting-height.check.ts` | Pure `startingHeightCheck`, UNKNOWN-gated, m→in | ✓ VERIFIED | Fully functional, unaffected by the join bug, real data flows through. |
| `src/panel/components/HullRender.tsx` | Inline SVG hull render with limit overlay | ✓ VERIFIED (component) / ⚠️ HOLLOW (data) | Component itself correct and wired into `main.tsx`; never receives real `geometry` data in production today (Gap #1 upstream). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `check.routes.ts` (5c) | `transform-point.ts` | `transformPoint` applied to bbox corners | ⚠️ WIRED BUT UNREACHABLE | Call is present and correctly implemented (`check.routes.ts:257`), but `framePartIds.forEach` (line 229) only iterates entries that survived the broken partId join — in production, `framePartIds` is always empty for real documents, so this transform call never executes against real FRAME_ geometry. |
| `frame-perimeter.check.ts` | `convex-hull.ts` | `floorHull`/hull computation | ✓ WIRED (in isolation) | Correctly wired at the code level; never invoked with real corner data in production for the same upstream reason. |
| `main.tsx` | `HullRender.tsx` | renders from verdict's `geometry` field | ✓ WIRED | `verdicts.find(v => v.geometry)` then `<HullRender verdict={perimeterVerdict} />`; correct, but `geometry` is `undefined` on every real verdict today (component renders `null`). |
| `check.routes.ts` (5d) | `client.ts` `getAssemblyBoundingBoxes` | single call, `highZ` → every fact | ✓ WIRED AND FUNCTIONING | Independent of the CR-01/CR-02 defect; confirmed functioning both by code reading and by `check.routes.test.ts`'s dedicated 5d enrichment test using non-aliased fixture shapes. |
| `starting-height.check.ts` | `engine.ts` | `passesOperator`/`M_TO_IN` | ✓ WIRED | Confirmed. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `frame-perimeter.check.ts` (PASS/FAIL branch) | `frameFacts[].bboxCornersWorld` | `check.routes.ts` 5c enrichment via broken partId join | No — always `undefined` on a real document (CR-01) | ✗ DISCONNECTED |
| `HullRender.tsx` | `verdict.geometry` | `framePerimeterCheck`'s return value | No — `geometry` field only set on the unreachable PASS/FAIL branch | ✗ DISCONNECTED (upstream) |
| `starting-height.check.ts` | `facts[].robotMaxZWorld` | `check.routes.ts` 5d single assembly-level call | Yes — direct call, no join, confirmed by dedicated route test | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CR-01 join fails on real (non-aliased) instance-id/partId | Minimal script importing `flattenAssembly`/`groupPartsByElement` with distinct ids | `framePartIds` join result: `[]` (0 matches) | ✗ FAIL (confirms gap) |
| CR-02 occurrence collapse | Minimal script simulating two occurrences of one CAD partId with different transforms | `frameFactsById` Map size 1 (expected 2); only last occurrence's transform retained | ✗ FAIL (confirms gap) |
| Full existing test suite | `npx vitest run src/server/checks/frame-perimeter.check.test.ts src/server/checks/starting-height.check.test.ts src/server/routes/check.routes.test.ts src/server/geometry/` | 5 files, 29 tests, all pass | ✓ PASS (but does NOT exercise the real join — see WR-02: fixtures alias `inst-1` as both instance id and partId) |
| Server typecheck | `npx tsc -p tsconfig.server.json --noEmit` | exit 0 | ✓ PASS |

**Interpretation:** passing tests/typecheck are necessary but explicitly NOT sufficient here — the test suite's green status is a false signal for GEOM-01, caused by the fixtures accidentally aliasing two distinct real-world id spaces into one string (`03-REVIEW.md` WR-02, itself confirmed present at `check.routes.test.ts:42-63`).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GEOM-01 | 03-01 (partial), 03-02 | Frame perimeter as 2D convex hull of FRAME_-tagged parts vs. season limit | ✗ BLOCKED | CR-01/CR-02 — see Gaps. `REQUIREMENTS.md` currently marks GEOM-01 `[x]` complete; this is not supported by the codebase against a real document. |
| GEOM-02 | 03-02 | Hull rendered visually, configuration disclosed | ⚠️ PARTIAL | `HullRender.tsx` itself is correctly implemented and wired, but never receives real geometry in production today because GEOM-01's data source is broken. Cannot be honestly marked SATISFIED until GEOM-01 is fixed and re-verified with a real render. |
| GEOM-03 | 03-03 | Starting-configuration height vs. R104, configuration disclosed | ✓ SATISFIED | Fully functioning, independent code path (no partId join), unit- and route-tested against realistic (non-aliased) enrichment shapes. |

**Note:** `.planning/REQUIREMENTS.md` currently shows all three (GEOM-01, GEOM-02, GEOM-03) as `[x]` complete. Per this verification, GEOM-01 should be reopened and GEOM-02 downgraded to partial pending GEOM-01's fix — REQUIREMENTS.md's checkmarks reflect the SUMMARY.md narrative, not independently confirmed behavior.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/server/traversal/flatten-assembly.ts` | 91 | Incorrect id substitution (`partId: leafId`) masquerading as a resolved CAD partId | 🛑 Blocker | Root cause of CR-01; breaks GEOM-01 and (per 03-REVIEW.md) also the pre-existing Phase 2 mass/material join in production. |
| `src/server/routes/check.routes.ts` | 190-192, 255-258 | `Map<partId, ...>` construction silently drops all-but-last occurrence per shared partId | 🛑 Blocker | Root cause of CR-02; risks a false PASS once CR-01 is naively patched. |
| `src/server/routes/check.routes.test.ts` | 42-63 | Test fixture aliases instance id and CAD partId to the identical string (`"inst-1"`) | ⚠️ Warning | Masks CR-01-class bugs; green tests give false confidence (03-REVIEW.md WR-02, independently confirmed). |
| `src/server/geometry/convex-hull.test.ts` | 52-59 | Collinear-points test asserts only "does not throw," never the actual expected `null` result | ⚠️ Warning | Weak test — a regression returning a degenerate hull instead of `null` would not be caught (03-REVIEW.md WR-03, not independently re-verified line-by-line here but consistent with file content). |
| `src/server/checks/frame-perimeter.check.ts` / `engine.ts` | `geometry.framePartFootprints` | Declared and rendered by `HullRender.tsx` but never populated by the check | ℹ️ Info | Dead/speculative field (03-REVIEW.md IN-01); low priority, noted for completeness. |
| `src/server/onshape-client/client.ts` | 251-254, 282-285 | `documentId`/`workspaceId` interpolated unencoded into request URLs (pre-existing idiom, not new to this phase) | ⚠️ Warning | Defense-in-depth gap, mirrors existing methods; not phase-blocking on its own (03-REVIEW.md WR-01). |

No unresolved `TBD`/`FIXME`/`XXX` debt markers found in any Phase 3 file.

### Human Verification Required

None. The gaps found here are code-level correctness defects, independently confirmed by direct execution against the shipped functions — no ambiguous UI/UX judgment call is needed to resolve them.

### Gaps Summary

The phase shipped a correct, well-tested **starting-configuration height check (GEOM-03)** — this works end-to-end today, uses a single assembly-level API call unaffected by the partId-join defect, gates UNKNOWN honestly, and discloses the measured configuration.

The **frame-perimeter check (GEOM-01/GEOM-02)**, however, does not achieve the phase goal against a real Onshape document, for two compounding reasons both rooted in the same underlying id-space confusion:

1. **CR-01 (blocking):** `flattenAssembly()` never resolves an occurrence's leaf instance id to the real CAD `partId` it's supposed to represent, so the route's per-part bbox enrichment join against `definition.parts[]` never matches on a real document. Every FRAME_-tagged part ends up "unresolved," and `framePerimeterCheck` can never leave its defensive UNKNOWN branch — it will report UNKNOWN forever, on every document, tagged or not, geometry-readable or not.
2. **CR-02 (blocking, would manifest immediately after CR-01 is fixed):** Even once the join is corrected, the enrichment Maps are keyed by `partId` alone, so a FRAME_ part reused at multiple occurrences (the standard FRC frame-rail/bracket pattern) collapses to a single occurrence's transform — silently dropping the other placements from the hull and risking an undersized perimeter, i.e. a false PASS. This is the exact scenario the phase's own design guidance (D-02, 03-BOUNDING-BOX-CONTRACT.md G1) explicitly says must never happen.

Both defects are masked by the current test suite because `check.routes.test.ts`'s fixture uses the identical string for both an instance id and a CAD partId (`"inst-1"`), so the join "succeeds" only by coincidence in tests. Green tests and a passing typecheck are real signals of code quality but are not evidence that GEOM-01 works — a fix must (a) correct the instance→partId resolution per 03-BOUNDING-BOX-CONTRACT.md G1, (b) rekey the per-occurrence enrichment so multiple occurrences of one partId are each preserved, and (c) update the test fixtures to use deliberately distinct instance-id/partId strings so this class of regression cannot be silently reintroduced.

`.planning/REQUIREMENTS.md` currently marks GEOM-01/GEOM-02/GEOM-03 all `[x]` complete based on the SUMMARY.md narrative; GEOM-01 should be reopened and GEOM-02 downgraded pending the fix above.

---

_Verified: 2026-07-10_
_Verifier: Claude (gsd-verifier)_

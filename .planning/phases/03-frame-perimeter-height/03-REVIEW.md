---
phase: 03-frame-perimeter-height
reviewed: 2026-07-10T14:28:13Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src/server/onshape-client/client.ts
  - src/server/geometry/transform-point.ts
  - src/server/geometry/transform-point.test.ts
  - src/server/geometry/convex-hull.ts
  - src/server/geometry/convex-hull.test.ts
  - src/server/checks/frame-perimeter.check.ts
  - src/server/checks/frame-perimeter.check.test.ts
  - src/server/checks/starting-height.check.ts
  - src/server/checks/starting-height.check.test.ts
  - src/server/checks/engine.ts
  - src/server/traversal/facts.ts
  - src/server/routes/check.routes.ts
  - src/server/routes/check.routes.test.ts
  - src/panel/api.ts
  - src/panel/components/HullRender.tsx
  - src/panel/main.tsx
  - rules/2026.json
  - package.json
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-10T14:28:13Z
**Depth:** standard
**Files Reviewed:** 15 (+ related root-cause file `src/server/traversal/flatten-assembly.ts`, read as a called dependency of `check.routes.ts`'s 5c block, not itself in the Phase 03 change list)
**Status:** issues_found

## Summary

The pure geometry utilities (`transform-point.ts`, `convex-hull.ts`) are correct and well tested against the live-verified `03-BOUNDING-BOX-CONTRACT.md`: the row-major transform (indices 3/7/11) is applied verbatim, `M_TO_IN` is applied exactly once at each conversion boundary, and both `frame-perimeter.check.ts` and `starting-height.check.ts` faithfully implement the G4 "never default an absent field to 0" discipline with distinct, well-labeled UNKNOWN branches.

However, tracing the occurrence → part join that `check.routes.ts`'s new 5c block depends on (per this review's explicit focus) surfaces two compounding **Critical** defects that mean `framePerimeterCheck` (R101) cannot produce a trustworthy PASS/FAIL verdict against a real, multi-instance Onshape document today, and would remain unsafe (capable of a false PASS) even after the first defect is patched. Both defects are masked by the current test suite because its fixtures alias instance ids and CAD part ids to the same literal string, so the enrichment "succeeds" in tests while failing in the exact way the join is used in production. A handful of lower-severity hardening and dead-code items round out the findings.

## Critical Issues

### CR-01: `Fact.partId` is actually the occurrence's INSTANCE id, not a CAD part id, breaking the 5c/5b partId join in production

**File:** `src/server/traversal/flatten-assembly.ts:83-97` (root cause; consumed by `src/server/routes/check.routes.ts:190-272` — the 5c FRAME_ bbox join this review was asked to verify)

**Issue:** `03-BOUNDING-BOX-CONTRACT.md` (G1, live-verified 2026-07-10, ground truth for this phase) states explicitly:

> `rootAssembly.occurrences[].path[]` holds **instance ids**, NOT part ids... For each occurrence, resolve `path[path.length − 1]` (the leaf instance id) via [an instance] map to recover its `partId`.

`flattenAssembly()` does not do this resolution. It assigns the occurrence's leaf path id directly as the Fact's `partId`:

```ts
return def.rootAssembly.occurrences.map((occ): Fact => {
  const leafId = occ.path[occ.path.length - 1] ?? "";
  const instance = instanceById.get(leafId);
  return {
    partId: leafId,          // <-- this is the INSTANCE id, not a CAD partId
    name: instance?.name ?? UNKNOWN_NAME,
    transform: occ.transform,
    path: occ.path,
  };
});
```

Its local `InstanceInfo` type doesn't even carry a `partId` field to resolve to (`{ id, name, type?, suppressed? }`), and the real Onshape schema (`BTAssemblyInstanceInfo` in `src/server/onshape-client/types/onshape.d.ts:3015-3027`) has no `partId` field either — only `definition.parts[]` (`BTAssemblyPartsInfo`) carries the real `partId`.

`check.routes.ts`'s 5c block (and the pre-existing 5b block) builds its per-part maps keyed by the REAL CAD `partId` sourced from `groups` (`definition.parts[]`):

```ts
const framePartIds = parts.map((p) => p.partId).filter((id) => frameFactsById.has(id));
```

but `frameFactsById` is keyed by `Fact.partId`, which — per the bug above — actually holds instance ids. In any real Onshape document where an occurrence's instance id differs from its part's CAD `partId` (the normal case, per the contract), this `.has(id)` check will never match, `framePartIds` will always be empty, `bboxByPartId` stays empty, and **every** FRAME_-tagged fact ends up with `bboxCornersWorld: undefined` — so `framePerimeterCheck` always falls into its "unresolved" UNKNOWN branch, regardless of how correctly the document is tagged. The R101 perimeter check is non-functional end-to-end against a real document.

This is masked in `check.routes.test.ts`'s fixture (`stubAssemblyDefinition()`), which uses the literal string `"inst-1"` as **both** the instance `id` and the `partId` in `parts[]` — the two id spaces are accidentally identical in the test, so the join "works" in the test suite while remaining broken in production. (Same underlying `Fact.partId` field is also relied on by the pre-existing 5b mass/material join — this finding likely also affects Phase 2's weight checks, though that is outside this phase's scope to fix.)

**Fix:** Resolve the true CAD `partId` when building `Fact` in `flattenAssembly()`, matching the contract's G1 guidance exactly — e.g. carry `definition.parts[]` into the join (or, if Onshape truly has no direct instance→partId field in the assembly definition response, build the correlation via `documentId:elementId:configuration` context the way `groupPartsByElement` already does) — then update `check.routes.test.ts`'s fixtures to use **deliberately different** instance-id and part-id strings so this class of bug cannot be silently reintroduced.

---

### CR-02: 5c's `Map<partId, corners>` enrichment collapses multiple occurrences of the same FRAME_ part to a single position — risks a false PASS

**File:** `src/server/routes/check.routes.ts:190-259`

**Issue:** Per `03-BOUNDING-BOX-CONTRACT.md` G1:

> A `FRAME_` part placed N times yields N occurrences, each with its own transform — the perimeter hull must include the transformed corners of **every** occurrence, not just one.

The 5c enrichment block, however, keys everything by `partId` alone:

```ts
const frameFactsById = new Map(
  facts.filter((f) => f.name.startsWith("FRAME_")).map((f) => [f.partId, f]),
);
const bboxByPartId = new Map<string, Array<[number, number, number]>>();
...
framePartIds.forEach((partId, i) => {
  const box = boxes[i];
  const fact = frameFactsById.get(partId);   // only ONE fact survives per partId
  ...
  bboxByPartId.set(partId, corners.map((corner) => transformPoint(fact.transform, corner)));
});
...
bboxCornersWorld: bboxByPartId.get(f.partId),   // every occurrence of that partId reads the SAME entry
```

`new Map(...)` construction keeps only the **last** `[partId, Fact]` pair for a given key — so if the same CAD part (e.g. a `FRAME_bracket` used at all four corners of the frame) appears as multiple occurrences sharing one `partId` (which is exactly what will happen once CR-01 is fixed and the join actually succeeds), only ONE occurrence's `transform` is ever applied. `bboxByPartId` then stores a single transformed-corner set for that `partId`, and **every** occurrence sharing that `partId` — including the three others placed elsewhere on the robot — is enriched with the identical transformed corners in the final `enrichedFacts.map()`.

The resulting hull will only ever include the footprint contributed by whichever occurrence happened to be iterated last, silently omitting the other N-1 real-world positions of that tagged part from the perimeter calculation. This directly risks an undersized measured perimeter — a **false PASS** — for the common FRC drivetrain topology of one bracket/rail part reused at multiple frame locations. This is the exact failure mode (D-02 "never a false PASS") this phase's own design guidance was written to prevent.

**Fix:** Key the per-occurrence enrichment by something unique per occurrence (e.g. the occurrence's `path.join("/")`, or an index), not by `partId` alone. `getBoundingBoxes`'s LOCAL box result can still be cached/fetched once per unique `partId` (it's legitimately part-invariant), but the **transform application and resulting `bboxCornersWorld` must be computed and stored per occurrence**, and `frame-perimeter.check.ts` must consume all resulting per-occurrence corner sets, not one entry per tagged part. Add a `check.routes.test.ts` fixture with the same `partId` appearing at two occurrences with different transforms, and assert the resulting hull includes points from both.

## Warnings

### WR-01: Client-supplied `documentId`/`workspaceId` are interpolated unencoded into Onshape API URLs in the two new client methods

**File:** `src/server/onshape-client/client.ts:251-254, 282-285`

**Issue:** `getBoundingBoxes` and `getAssemblyBoundingBoxes` build request URLs via raw template-literal interpolation:

```ts
const url = new URL(
  `/api/parts/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/partid/${partId}/boundingboxes`,
  ONSHAPE_API_BASE_URL,
);
```

`documentId`/`wvmid` (workspaceId) originate from `req.body`, validated only with `z.string().min(1)` (`check.routes.ts:19-22`) — no format/character validation. A value containing path-navigation sequences (e.g. `../`) could redirect the constructed path to an unintended Onshape API route while still using the authenticated user's own token (bounding the blast radius to what that token can already access, but still a maintainability/defense-in-depth gap). This mirrors the pre-existing idiom in `getAssemblyDefinition`/`getPartStudioMassProperties`/`getPartsMetadata`, so it isn't unique to Phase 03, but the two new methods reproduce it rather than hardening it.

**Fix:** Either validate `documentId`/`workspaceId` against Onshape's known id format (e.g. 24-character hex) in the `CheckRequestSchema` zod schema, or `encodeURIComponent()` each path segment before interpolation, across all client methods (not just the two new ones).

### WR-02: Test fixtures alias instance ids and CAD part ids, masking the CR-01 class of bug

**File:** `src/server/routes/check.routes.test.ts:41-67`

**Issue:** `stubAssemblyDefinition()` uses the identical string (`"inst-1"`, `"inst-2"`, `"inst-3"`) as both `rootAssembly.instances[].id` and `parts[].partId`. In real Onshape documents these are different id namespaces (see CR-01). Because the fixture conflates them, every test asserting the 5b/5c join "works" is not actually exercising the real-world join logic.

**Fix:** Use deliberately distinct instance-id and part-id strings in the fixture (e.g. `instanceId: "occ-1"` vs `partId: "JHD"`), forcing the route code to perform a genuine id resolution rather than a coincidental match.

### WR-03: `convex-hull.test.ts`'s collinear-points test never asserts the actual result

**File:** `src/server/geometry/convex-hull.test.ts:52-59`

**Issue:**
```ts
it("does not crash on collinear projected points", () => {
  ...
  expect(() => floorHull(collinear)).not.toThrow();
});
```
This only proves `floorHull` doesn't throw; it never asserts whether collinear points correctly resolve to `null` (as `d3-polygon`'s `polygonHull` is documented to do for degenerate input) or to some hull value. A regression that silently returned a degenerate 2-point "hull" instead of `null` would pass this test.

**Fix:** Add `expect(floorHull(collinear)).toBeNull();` (or the documented expected behavior) to make the assertion meaningful.

## Info

### IN-01: `geometry.framePartFootprints` is rendered but never populated

**File:** `src/panel/components/HullRender.tsx:72-83`, `src/server/checks/engine.ts:39-42`, `src/server/checks/frame-perimeter.check.ts:100`

**Issue:** `Verdict.geometry`/`CheckReportVerdict.geometry` both declare an optional `framePartFootprints` field, and `HullRender.tsx` renders it (dashed per-part outline polygons) — but `frame-perimeter.check.ts` only ever returns `geometry: { hullVertices: hull }`, never setting `framePartFootprints`. This is currently dead/speculative UI code.

**Fix:** Either populate `framePartFootprints` from the per-part corner sets (once CR-02 is fixed and each occurrence's footprint is individually available) or remove the unused field/render branch until it's backed by real data.

### IN-02: Pre-existing R101/R103 rule-citation collision (already logged, not new)

**File:** `src/server/checks/occurrence-count.check.ts`, `src/server/checks/frame-tag-presence.check.ts` (not in this phase's file list)

**Issue:** Confirmed present per `deferred-items.md` — `occurrenceCountCheck`/`frameTagPresenceCheck` cite `config.rules[0]`/`[1]` positionally, colliding with `framePerimeterCheck`'s genuine R101 and `robotWeightCheck`'s genuine R103. All Phase 03 consumers (tests, `HullRender` selection in `main.tsx`) correctly work around this via `geometry`-field selection rather than rule-string matching. No action needed from this review; noted only for completeness since it is directly adjacent to this phase's new R101 verdict.

### IN-03: `floorHull`'s exact-string dedup key is float-precision-sensitive

**File:** `src/server/geometry/convex-hull.ts:20-25`

**Issue:** `` `${x},${y}` `` as a Set key relies on bit-exact floating point equality. Two corners that are conceptually the same world point but arrive via slightly different floating-point paths (e.g. two adjacent occurrences whose transforms should produce coincident corners but differ by float noise) would not dedupe. In practice this is low-impact — `polygonHull` still computes a correct hull with a few extra near-duplicate points — but it's worth a comment noting the limitation, since the docstring implies exact dedup is the primary defense against degenerate "fewer than 3 unique points" inputs.

**Fix:** Optional: round coordinates to a fixed epsilon before keying, or leave as-is with a doc-comment caveat. Not blocking.

---

_Reviewed: 2026-07-10T14:28:13Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

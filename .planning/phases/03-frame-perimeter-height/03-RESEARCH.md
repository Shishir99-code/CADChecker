# Phase 3: Frame Perimeter & Height - Research

**Researched:** 2026-07-09
**Domain:** Onshape geometry APIs (bounding boxes, occurrence transforms) + 2D convex-hull computation + FRC Game Manual rule verification
**Confidence:** MEDIUM (the single highest-value question — bounding-box coordinate frame — is answered by strong architectural inference + community-sourced transform-layout details, not by a live-verified API call; everything else is HIGH)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Hull geometry source (perimeter)**
- **D-01:** For v1, build the hull from **per-part bounding-box corners** of `FRAME_`-tagged parts — fetch each frame part's bounding box, transform its 8 corners into world space, project onto the floor plane, then take the 2D convex hull of all projected corners. This is the fast/simple path (few API calls, small payloads, deterministic) over tessellated mesh vertices. Choosing per-part-bbox vs one assembly-level `boundingboxes` call is the planner's/researcher's call — but the hull must be of **many parts' corner points**, never a single whole-robot bounding box (Success Criterion 1 forbids a raw bounding box).
- **D-02:** Bounding boxes **overestimate** angled/rounded/diagonal frame rails, so the perimeter reads slightly LARGE. This is **accepted for v1** because the user explicitly **prefers a false FAIL over a false PASS**. The verdict MUST carry a **caveat disclosing the measurement method**. Attach this caveat on every perimeter verdict.
- **D-03:** **Tessellated-vertex measurement is the documented upgrade path**, not v1 scope.

**Up-axis, floor plane & height**
- **D-04:** **Assume world +Z is up.** Perimeter projects onto the world **XY plane** (drop Z). Height = the **max +Z extent** in world space. Disclose the assumption in a caveat.
- **D-05:** **Height measures the WHOLE robot**, not just `FRAME_` parts — the max +Z extent across **all** occurrences in the measured configuration. Do NOT subtract bumpers/battery for height.

**Starting configuration**
- **D-06:** Measure Onshape's **default (as-modeled) configuration** — what `getAssemblyDefinition` already returns with no configuration parameter — and **explicitly disclose its name** in both geometry verdicts. Attach a caveat if the assembly has multiple configurations.

**Visual render (perimeter)**
- **D-07:** Render the measured footprint as an **inline SVG polygon with a limit overlay** — hull outline top-down, auto-scaled, perimeter length + season limit labeled. **Self-contained SVG, no chart library / no new dependency.** Optionally draw individual `FRAME_` part footprints faintly behind the hull. The server must return hull vertices (and ideally per-part footprints) alongside the verdict.

### Claude's Discretion (with guidance)
- **Geometry source verification:** Verify the bounding-box overestimate magnitude and payload sizes against a real public team CAD doc early in planning (Chief Delphi / GrabCAD, e.g. teams 1690/254) before committing.
- **Configuration approach:** Confirm whether the test CAD docs even use configurations during planning; if they don't, the caveat can be softened.
- **Convex hull implementation:** `d3-polygon` (`polygonHull()`) is CLAUDE.md-recommended but not yet installed — install vs hand-roll is the planner's call. Winding order must be consistent so perimeter length is a simple closed-polygon sum.
- **Where the geometry enrichment lives:** Follow Phase 2's pattern — fetch bounding boxes in `check.routes.ts`, merge world-space corner points onto `Fact[]` before the engine runs; keep checks pure/synchronous. Exact enriched-`Fact` field shape is the planner's to design. Referenced-document parts that 403 leave geometry UNRESOLVED (`undefined`, never a substituted 0), exactly like mass/material in Phase 2.
- **Height as a check vs a facet of perimeter:** whether height is its own registered `CheckFn` or shares enrichment with perimeter is the planner's call; both consume the same shared enriched `Fact[]`.

### Deferred Ideas (OUT OF SCOPE)
- **≤¼-in minor-protrusion exception** to frame perimeter — deferred pending rule-text confirmation. **RESOLVED BY THIS RESEARCH: the exception text is confirmed and simple (see Game Manual findings below), but implementation is NOT simple with the D-01 bounding-box-corner approach (see Common Pitfalls) — remains correctly deferred.**
- **Tessellated-vertex hull measurement** — pursue only if bbox overestimation proves inadequate against real CAD.
- **Named-configuration convention** (e.g. `STARTING_` marker) — v1 measures + discloses the default config instead.
- **Game-Manual limit-value + exact rule-number verification** — **RESOLVED BY THIS RESEARCH** (see Game Manual Verification below): R101/R103/R104/R408 limits and the R104-vs-R107 ambiguity are now confirmed against the official 2026 Game Manual PDF (TU22).
- **Trust-bar panel polish** (document/tab/config/timestamp shown per verdict) — Phase 4.
- v2 items in `.planning/REQUIREMENTS.md` §v2 — untouched.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GEOM-01 | Robot/frame perimeter computed as the 2D convex hull of the floor-plane projection of `FRAME_`-tagged parts, vs season limit (R101/R104) | Bounding-box endpoint analysis (per-part endpoint + coordinate-frame inference), d3-polygon verification, transform-application formula, Game Manual verification confirming R104 holds the 110in number, M_TO_IN unit-conversion pitfall, UNRESOLVED-gating pitfall (false-PASS risk) |
| GEOM-02 | Hull rendered visually (SVG) + configuration disclosed | d3-polygon winding-order/`polygonLength` findings, SVG y-flip/scaling pitfall, recommended geometry payload shape on `Verdict`/`CheckReportVerdict` |
| GEOM-03 | Starting-configuration height vs season limit (R104/R107), configuration disclosed | Assembly-level `getAssemblyBoundingBoxes` single-call recommendation for whole-robot height (avoids per-part N-call scaling risk and F3 cross-document 403s, mirroring Phase 2's F4 precedent), Game Manual verification resolving the R104-vs-R107 rule-number ambiguity in favor of **R104** |

</phase_requirements>

## Summary

Three findings should drive planning. **First**, the primary unknown flagged in CONTEXT.md — the bounding-box endpoint's coordinate frame — cannot be resolved from the OpenAPI spec or official docs alone (neither documents it); it must be resolved by a live-verification spike, exactly like Phase 2's `spike-mass-properties.ts`. However, cross-referencing the endpoint parameter shapes with Onshape's documented transform model yields a strong, actionable inference: the **per-part** endpoint (`/api/parts/.../partid/{partid}/boundingboxes`, Parts API, addressed by Part-Studio element + partId, no occurrence/transform parameter) almost certainly returns a box in the **Part Studio's local/native coordinate system** and needs each corner run through the occurrence's `Fact.transform` to reach world space — while the **assembly-level** endpoint (`/api/assemblies/.../boundingboxes`, addressed by the assembly element itself, whose coordinate system Onshape's docs define as *the* world/top-level frame) is almost certainly **already in world space**, no transform needed. This distinction, combined with the fact that neither bounding-box endpoint accepts a `partId[]` bulk filter (unlike mass properties), leads to the second finding: **use two different endpoints for two different purposes**. Fetch the per-part endpoint only for `FRAME_`-tagged parts (a small, curated subset by design) to build the perimeter hull; fetch the assembly-level endpoint **once** to get the whole-robot max Z for height (D-05 requires *all* occurrences, and Team 1678's real public robot has 201 parts across 40+ referenced documents — one call per part would both be slow and re-trigger Phase 2's F3 cross-document-403 problem, which the assembly-level endpoint sidesteps the same way Phase 2's F4 assembly-level mass call did).

**Third**, the Game Manual research questions are now resolved with HIGH confidence, extracted directly from the official 2026 Game Manual PDF (Team Update 22, `firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf`): R101 defines *what counts as* the ROBOT PERIMETER (taut-string method, excludes BUMPERS, and contains the exact 0.25in minor-protrusion exception text) but carries **no numeric limit itself**; R104 ("STARTING CONFIGURATION — max size") is the rule that actually states **both** numbers — 110.0in perimeter and 30.0in height — in one rule; R107 is a *separate* "vertical extension limit" rule (also 30.0in, but governing extended/deployed height at any time, not specifically the starting configuration) — which resolves the ROADMAP's "R104 vs R107" ambiguity firmly in favor of **R104** for Phase 3's height check, since this phase measures the as-modeled default configuration only. All four PLACEHOLDER values in `rules/2026.json` (R101=110, R103=115, R104=30, R408=135) match the verified manual exactly and can be flipped from PLACEHOLDER to VERIFIED. The minor-protrusion exception is confirmed to exist with genuinely simple wording, but is correctly left deferred: implementing it requires identifying which *sub-features* of a part (bolt heads, weld beads) are "minor," which is not derivable from a whole-part bounding box — the CONTEXT.md deferral holds.

**Primary recommendation:** Ship a throwaway `scripts/spike-bounding-boxes.ts` (mirroring `spike-mass-properties.ts`) as the first planning/execution task to confirm the coordinate-frame inference above against a real document before writing any check logic; install `d3-polygon` + `@types/d3-polygon` (both clean per slopcheck, zero new runtime deps beyond d3-polygon itself); gate the perimeter verdict to UNKNOWN (not a silently-shrunk hull) if any `FRAME_` part's bounding box is unresolved, since a dropped point shrinks the hull and risks exactly the false-PASS the project's core value forbids.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Bounding-box fetch (per-part FRAME_ + assembly-level whole-robot) | API / Backend | — | New Onshape API surface, fetched server-side in `check.routes.ts`'s enrichment step, mirroring the Phase 2 mass/material 5b block. Never exposed to the panel directly. |
| World-space corner transform (apply `Fact.transform`) + floor-plane (XY) projection | API / Backend | — | Pure matrix/vector math over server-fetched data; must happen before the response is built so the perimeter `CheckFn` stays pure/synchronous (locked reuse constraint). |
| 2D convex hull computation (`d3-polygon`) | API / Backend | — | Same reasoning — a pure geometry step, computed once server-side, returned as a vertex list. |
| Perimeter / height `Verdict` computation (PASS/FAIL/UNKNOWN + caveats) | API / Backend (`CheckEngine`) | — | Pure `CheckFn(facts, config)` reusing Phase 1's engine and Phase 2's tri-state pattern. |
| Season rule limits (110in / 30in / rule numbers) | Config / Storage (versioned JSON) | — | `rules/2026.json`, unchanged pattern from Phase 1 — never hardcoded. |
| SVG hull rendering (outline + limit overlay + optional per-part footprints) | Browser / Client (React panel) | — | Presentation-only; the panel draws whatever vertex array the server returns and performs zero geometry recomputation, matching the existing `src/panel/api.ts` doc comment ("duplicates no business logic client-side"). |
| Configuration-name disclosure | API / Backend (caveat string) → Browser / Client (render) | — | Server derives the disclosure string from the already-fetched `getAssemblyDefinition` response (no new API call); panel renders it as an existing `caveats[]` row. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `d3-polygon` | 3.0.1 [VERIFIED: npm registry + GitHub source read directly] | 2D convex hull (`polygonHull`) + closed-polygon perimeter (`polygonLength`) of the floor-projected `FRAME_` corner points | Andrew's monotone-chain algorithm, zero runtime dependencies, 14.4M weekly downloads (confirmed via `npm.js` downloads API 2026-07-02..08), package first published 2015 (10+ years mature), `[OK]` per slopcheck. Already the CLAUDE.md-locked recommendation. |
| `@types/d3-polygon` | 3.0.2 [VERIFIED: npm registry] | TypeScript types — `d3-polygon`'s own `package.json` ships **no bundled `.d.ts`** (confirmed by inspecting the installed package: only `src/**/*.js`, no types field) | Required as a `devDependency` for `tsc -p tsconfig.server.json` to typecheck against `polygonHull`/`polygonLength`; official DefinitelyTyped package, 13.3M weekly downloads, `[OK]` per slopcheck. |

### Supporting

No new supporting libraries are needed. The bounding-box fetch reuses the existing `client.ts` raw-`fetch`-then-cast idiom (identical to `getAssemblyDefinition`/`getPartStudioMassProperties`, since `getBoundingBoxes`/`getAssemblyBoundingBoxes` also declare only a `default` response in the OpenAPI spec, not an explicit `200` — confirmed by reading `onshape.d.ts` lines 10064-10094 and 12219-12248). No matrix library (e.g. `gl-matrix`) is needed — see Don't Hand-Roll for why a ~10-line point-transform function is the *correct* choice here, not an anti-pattern.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `d3-polygon` `polygonHull` | Hand-rolled ~40-line Andrew's monotone chain | Only worth it to avoid the dependency entirely; d3-polygon's implementation (read directly from `github.com/d3/d3-polygon/blob/main/src/hull.js`) already correctly handles the `<3 points → null` degenerate case and collinear-point pruning via a `cross() <= 0` check — exactly the edge cases a hand-rolled version is most likely to get wrong. Not recommended. |
| Per-part bounding-box calls for height (all occurrences) | Assembly-level single-call `getAssemblyBoundingBoxes` for height | Per-part-for-height was considered to reuse one code path for both checks, but rejected: Team 1678's real public robot has 201 parts across 40+ referenced documents (`02-MASS-PROPERTIES-CONTRACT.md` F3) — one bbox call per part for height alone would be slow and re-trigger the same cross-document 403 problem Phase 2 hit, which the assembly-level endpoint resolves server-side (mirrors F4). |
| `getAssemblyBoundingBoxes` for perimeter | Per-part `getBoundingBoxes` for perimeter | Explicitly forbidden by Success Criterion 1 / D-01 — the assembly-level call returns **one box for the whole entity** (confirmed: its query params are `linkDocumentId, includeHidden, displayStateId, configuration, explodedViewId` — no `partId` filter, no per-occurrence breakdown), which is exactly the "raw bounding box" the phase must NOT produce for perimeter. |

**Installation:**
```bash
npm install d3-polygon
npm install -D @types/d3-polygon
```

**Version verification:** Verified live via `npm view d3-polygon version` → `3.0.1` (published 2022-06-14, package created 2015-07-07) and `npm view @types/d3-polygon version` → `3.0.2`, both on 2026-07-09. Neither package declares a `postinstall` script (`npm view <pkg> scripts.postinstall` returned empty for both).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `d3-polygon` | npm | ~10 yrs (created 2015-07-07) | 14.4M/wk | github.com/d3/d3-polygon | [OK] | Approved |
| `@types/d3-polygon` | npm | mature (DefinitelyTyped) | 13.3M/wk | github.com/DefinitelyTyped/DefinitelyTyped | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Verification method note: `slopcheck install <pkg>` was initially run to check `d3-polygon`, but that subcommand **actually executes `npm install`** against the live project (it modified `package.json`/`package-lock.json` during this research session) — this was immediately reverted via `git checkout -- package.json package-lock.json` before any other work continued, and the repo was confirmed clean afterward. Subsequent checks used `slopcheck scan --pkg npm <name>` instead, which does not install. **Planners/executors should use `slopcheck scan --pkg`, not `slopcheck install`, for verification-only checks.**

## Architecture Patterns

### System Architecture Diagram

```
POST /api/check (existing, check.routes.ts)
  │
  ├─ (1-4, unchanged) auth check → getElementsInDocument → getAssemblyDefinition
  │
  ├─ (5) flattenAssembly() → Fact[]  (unchanged)
  │
  ├─ (5b, unchanged) per-group mass/material fetch+merge (Phase 2)
  │
  ├─ (5c, NEW) geometry enrichment — TWO parallel sub-steps:
  │    │
  │    ├─ Per-part bbox fetch (FRAME_-tagged facts only)
  │    │    groupPartsByElement() [reused] → filter each group's partIds to
  │    │    those whose Fact.name startsWith("FRAME_") → Promise.all per group:
  │    │    client.getBoundingBoxes(doc, wvm, wvmid, elementId, partId) [NEW method]
  │    │    → for each of the 8 corners of {lowX..highZ}: apply Fact.transform
  │    │      (row-major, world = R·local + T — see Code Examples) → world-space
  │    │      corner → store on Fact.bboxCornersWorld
  │    │    → 403/other-error per group: swallow, leave UNRESOLVED (undefined),
  │    │      same discipline as mass/material (401/ReconnectRequiredError still
  │    │      re-thrown, never swallowed)
  │    │
  │    └─ Assembly-level bbox fetch (ONE call, whole robot)
  │         client.getAssemblyBoundingBoxes(doc, "w", workspaceId, assemblyElementId)
  │         [NEW method] → already world-space (assembly IS the world frame) →
  │         highZ → copied onto EVERY Fact as Fact.robotMaxZWorld (redundant but
  │         cheap: one call, one number, no per-part iteration needed)
  │
  ├─ (6) buildEngine() registers framePerimeterCheck + startingHeightCheck
  │      alongside the existing 5 checks — both pure CheckFn(facts, config)
  │
  └─ (8) response: { measuredContext, verdicts: [...existing, perimeterVerdict
         (now carrying a `geometry` field: hull + optional per-part footprints),
         heightVerdict] }
         │
         ▼
   Panel: ReportTable.tsx renders rows as today (measuredCount reused for the
   inches figure) + a NEW sibling component reads perimeterVerdict.geometry and
   draws the inline SVG hull + limit overlay (D-07) — no client-side geometry math.
```

### Recommended Project Structure

```
src/server/
├── checks/
│   ├── frame-perimeter.check.ts     # NEW — pure CheckFn: floor-project + hull + compare
│   └── starting-height.check.ts     # NEW — pure CheckFn: max Z + compare
├── geometry/
│   ├── transform-point.ts           # NEW — apply Fact.transform to a [x,y,z] corner
│   ├── convex-hull.ts               # NEW — thin wrapper over d3-polygon (project XY,
│   │                                 #        hull, length, unit conversion) — pure,
│   │                                 #        independently unit-testable
├── onshape-client/
│   └── client.ts                    # EXTEND — add getBoundingBoxes + getAssemblyBoundingBoxes
├── traversal/
│   └── facts.ts                     # EXTEND — bboxCornersWorld?, robotMaxZWorld? fields
├── routes/
│   └── check.routes.ts              # EXTEND — 5c enrichment block + 2 new registrations
scripts/
└── spike-bounding-boxes.ts          # NEW, throwaway — mirrors spike-mass-properties.ts;
                                       # DELETE after coordinate-frame + transform-layout
                                       # assumptions are confirmed against a live document
src/panel/
├── components/
│   └── HullRender.tsx               # NEW — self-contained inline SVG, no chart lib
└── api.ts                           # EXTEND — CheckReportVerdict.geometry? field
```

### Pattern 1: Per-part FRAME_ bbox enrichment (mirrors Phase 2's 5b block)

```typescript
// Source: existing check.routes.ts 5b block (Phase 2), extended for geometry.
// The SAME groupPartsByElement()/wvm-addressing logic is reused; only the
// per-group work changes to fetch+transform bounding-box corners instead of
// mass/material, and ONLY for parts whose Fact already starts with "FRAME_".
const frameFactsById = new Map(
  facts.filter((f) => f.name.startsWith("FRAME_")).map((f) => [f.partId, f]),
);

for (const parts of groups.values()) {
  const first = parts[0];
  if (!first) continue;
  const framePartIds = parts
    .map((p) => p.partId)
    .filter((id) => frameFactsById.has(id));
  if (framePartIds.length === 0) continue; // no FRAME_ parts in this group

  // ... same wvm/wvmid addressing derivation as the existing 5b block ...

  try {
    const boxes = await Promise.all(
      framePartIds.map((partId) =>
        client.getBoundingBoxes(groupDocumentId, wvm, wvmid, groupElementId, partId, configuration),
      ),
    );
    framePartIds.forEach((partId, i) => {
      const box = boxes[i];
      const fact = frameFactsById.get(partId)!;
      if (box.lowX === undefined /* ... */) return; // leave UNRESOLVED
      const corners = cornersOf(box); // 8x [x,y,z] in Part-Studio-local space
      // VERIFY LIVE (see Open Questions): is this box already world-space, or
      // does it need fact.transform applied? Current best inference: per-part
      // Parts-API endpoint returns LOCAL coordinates (no occurrence/transform
      // parameter exists on this endpoint) -- apply the transform.
      bboxByPartId.set(partId, corners.map((c) => transformPoint(fact.transform, c)));
    });
  } catch (err) {
    if (err instanceof ReconnectRequiredError) throw err;
    if (err instanceof OnshapeApiError && err.status === 401) throw err;
    continue; // 403 etc — leave this group's FRAME_ parts UNRESOLVED
  }
}
```

### Pattern 2: Assembly-level single-call height enrichment

```typescript
// ONE call, resolves cross-document references server-side (mirrors
// 02-MASS-PROPERTIES-CONTRACT.md F4's assembly-level mass finding) --
// avoids the N-calls-per-part scaling problem for whole-robot height (D-05).
try {
  const box = await client.getAssemblyBoundingBoxes(assemblyDocumentId, "w", workspaceId, elementId);
  // VERIFY LIVE: assembly-scoped call, no per-occurrence transform parameter
  // exists -- inferred to already be in the assembly's own (== world) frame,
  // consistent with Onshape's documented "top-level assembly's coordinate
  // system" == world model. If confirmed, highZ needs NO further transform.
  if (box.highZ !== undefined) {
    enrichedFacts.forEach((f) => { f.robotMaxZWorld = box.highZ; });
  }
} catch {
  // leave robotMaxZWorld undefined on all facts -- height check gates UNKNOWN
}
```

### Pattern 3: Pure perimeter CheckFn (floor projection + hull + unit conversion)

```typescript
// Source: d3-polygon README (https://d3js.org/d3-polygon) + source read directly
// (github.com/d3/d3-polygon/blob/main/src/hull.js, .../length.js).
import { polygonHull, polygonLength } from "d3-polygon";

const M_TO_IN = 39.37007874; // single documented conversion boundary, mirrors KG_TO_LB

export const framePerimeterCheck: CheckFn = (facts, config) => {
  const entry = config.rules.find((r) => r.rule === "R101"); // see Pitfall 5 re: R101 vs R104
  const frameFacts = facts.filter((f) => f.name.startsWith("FRAME_"));

  if (frameFacts.length === 0) {
    return { ...base(entry), status: "UNKNOWN", caveats: ["not yet checkable — no FRAME_ parts tagged"] };
  }

  const unresolved = frameFacts.filter((f) => f.bboxCornersWorld === undefined);
  if (unresolved.length > 0) {
    // A dropped FRAME_ part SHRINKS the hull -- silently computing here risks
    // a false PASS, the opposite of the project's "prefer false FAIL" bias.
    return { ...base(entry), status: "UNKNOWN", affectedPartCount: unresolved.length,
      affectedParts: unresolved.map((f) => ({ name: f.name, path: f.path })),
      caveats: ["perimeter geometry could not be read for N part(s) — see affected parts"] };
  }

  // Floor projection: drop Z (D-04), points as [x, y] pairs in METERS.
  const floorPoints = frameFacts.flatMap((f) => f.bboxCornersWorld!.map(([x, y]) => [x, y]));
  const hull = polygonHull(floorPoints); // null if < 3 unique points (Pitfall 7)
  if (!hull) {
    return { ...base(entry), status: "UNKNOWN", caveats: ["insufficient frame geometry to compute a hull"] };
  }

  const perimeterMeters = polygonLength(hull); // closes the loop automatically -- verified in source
  const perimeterInches = perimeterMeters * M_TO_IN;

  return {
    rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
    status: passesOperator(entry, perimeterInches) ? "PASS" : "FAIL",
    measuredCount: perimeterInches, // reuses the EXISTING renderMeasured() "N in" path -- no Verdict schema change needed
    geometry: { hullVertices: hull, framePartFootprints: /* optional, per D-07 */ undefined },
    caveats: [
      "perimeter measured from part bounding boxes and may read slightly high; a FAIL just over the limit warrants a manual re-check.",
      "assumes the robot is modeled with +Z up.",
      "measured the Default configuration — verify this is your starting configuration.",
    ],
  };
};
```

### Anti-Patterns to Avoid

- **Using `getAssemblyBoundingBoxes` for the perimeter check:** returns one whole-entity box, not per-part corners — explicitly the "raw bounding box" Success Criterion 1 forbids.
- **Silently treating an UNRESOLVED FRAME_ part's bbox as "just skip it and hull the rest":** shrinks the hull and risks a false PASS. Gate to UNKNOWN instead (mirrors WGHT-02).
- **Computing geometry client-side in the panel:** violates the established "panel duplicates no business logic" pattern (`src/panel/api.ts` doc comment) — the SVG component must be a pure renderer of server-supplied vertex arrays.
- **Reaching for a full matrix library (`gl-matrix` etc.) for the point transform:** unnecessary weight for one operation (apply a flat 16-element affine transform to a 3-vector) — see Don't Hand-Roll for the correct call here.
- **Forgetting the meters→inches conversion:** Onshape bounding-box/transform values are SI (meters), confirmed by precedent (`02-MASS-PROPERTIES-CONTRACT.md` rule 2: volume in m³ regardless of document display units; forum-confirmed translation components are also in meters) — comparing raw meters against a `unit: "in"` limit produces silently wrong verdicts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 2D convex hull of floor-projected points | A hand-rolled Graham scan / Jarvis march | `d3-polygon` `polygonHull()` | Edge cases (collinear points, duplicate points, `<3` points) are the classic source of hull bugs; d3-polygon's implementation (read directly from source) already handles `<3 → null` and collinear pruning via `cross() <= 0`, and is 10-year battle-tested at 14.4M weekly downloads. |
| Closed-polygon perimeter length | A manual `reduce` with a wraparound `(i+1) % n` index | `d3-polygon` `polygonLength()` | Confirmed via source read (`length.js`): it initializes `b = polygon[n-1]` before the loop, so it **automatically closes the loop** — calling it directly on the hull array gives the correct closed perimeter with no manual wraparound code (a common off-by-one source). |

**Key insight:** The one thing this phase genuinely SHOULD hand-roll is the point-transform (`transformPoint(m, [x,y,z])`) — it's a ~6-line function applying a single documented affine formula (see Code Examples), and pulling in a general-purpose matrix library for one operation would be the over-engineering equivalent of hand-rolling a hull. Hand-roll the trivial, tightly-scoped math; use a library for the algorithmically subtle part (hull correctness).

## Common Pitfalls

### Pitfall 1: Assuming the per-part bounding-box endpoint is already world-space
**What goes wrong:** Corners come back already offset by the occurrence's true position, but the check applies `Fact.transform` anyway (or vice versa — assumes local and never transforms), producing a hull that's either doubly-transformed (wildly wrong) or never transformed (parts appear stacked at the Part Studio origin instead of their assembly position).
**Why it happens:** Neither the OpenAPI spec (`onshape.d.ts` — no `description` field on `getBoundingBoxes`) nor the public docs explicitly state the coordinate frame for this specific endpoint.
**How to avoid:** Ship a throwaway `scripts/spike-bounding-boxes.ts` (mirroring `spike-mass-properties.ts`) as an early planning task: fetch a known FRAME_ part's bbox, apply the inferred transform, and cross-check the result against Onshape's UI-reported position (or a part known to sit off-origin). Current best inference (endpoint parameter shapes + Onshape's documented "occurrence transform represents the location of the owning Part Studio's coordinate system relative to the top-level assembly's coordinate system" model): per-part = LOCAL (transform it); assembly-level = already WORLD (don't transform it again).
**Warning signs:** A computed perimeter that's off by roughly the magnitude of the robot's overall displacement from the assembly origin, or a hull whose shape looks right but is translated to the wrong place in the SVG render.

### Pitfall 2: Fetching per-part bboxes for ALL occurrences to compute height
**What goes wrong:** D-05 requires the whole-robot max Z, which naively suggests fetching every occurrence's bbox — but Team 1678's real public robot has 201 parts across 40+ referenced (other-owner) documents; that's 200+ serial/parallel API calls plus re-triggering Phase 2's F3 cross-document-403 problem for every referenced-library part.
**Why it happens:** Reusing the per-part fetch pattern from the perimeter check feels consistent, but height's requirement ("whole robot," a single scalar) doesn't actually need per-part granularity.
**How to avoid:** Use `getAssemblyBoundingBoxes` (ONE call) for height instead — it resolves references server-side, exactly like Phase 2's F4 finding for assembly-level mass.
**Warning signs:** `/api/check` response times scaling with part count; repeated 403s on referenced-document parts for a check (height) that shouldn't even need per-part data.

### Pitfall 3: Unit mismatch (meters vs inches)
**What goes wrong:** Onshape geometry APIs return SI values (meters) regardless of the document's display units — confirmed precedent from `02-MASS-PROPERTIES-CONTRACT.md` rule 2 (volume in m³) and corroborated by a forum-documented transform layout where translation components are in meters. `rules/2026.json`'s R101/R104 entries are `unit: "in"`. Comparing a raw-meters perimeter against a 110 (inches) limit produces either a nonsense huge "FAIL" or, if the arithmetic direction is flipped, a silently-wrong PASS.
**Why it happens:** Easy to copy the `KG_TO_LB`-style single-conversion pattern but forget to apply it, or apply it in the wrong direction.
**How to avoid:** One documented `M_TO_IN = 39.37007874` constant (mirroring `KG_TO_LB`), applied once at the same architectural boundary (inside the check, right before comparing against `entry.limit`).
**Warning signs:** Every perimeter/height verdict reads as a wildly-out-of-range FAIL (or an implausible always-PASS) regardless of the actual robot geometry.

### Pitfall 4: Silently dropping UNRESOLVED FRAME_ parts shrinks the hull
**What goes wrong:** If a `FRAME_` part lives in a referenced (other-owner) document that 403s on the bbox fetch (same failure mode as Phase 2's F3), silently excluding its corners from the hull produces a SMALLER measured perimeter than reality — the opposite of the project's explicit "prefer false FAIL over false PASS" philosophy (D-02), and could tell a team they pass when the real robot (including the unreadable part) would fail inspection.
**Why it happens:** The existing weight-check UNRESOLVED pattern (`massKg: undefined`) is "safe" because omitting a part's mass just *undercounts* weight — which is ALSO a false-PASS risk, and Phase 2 handles it correctly via UNKNOWN gating (WGHT-02). Geometry needs the identical treatment, but it's easy to reach for "just skip the point" since hull algorithms tolerate missing points without crashing.
**How to avoid:** Gate the perimeter verdict to UNKNOWN (with an affected-parts caveat) if ANY `FRAME_` part's bbox is unresolved — do not silently compute a partial hull. This exactly mirrors `robotWeightCheck`'s `untrusted.length > 0` gate.
**Warning signs:** A perimeter verdict that reads PASS on a document known to have referenced-document FRAME_ parts (cross-check against the material-audit / mass-enrichment logs for the same run).

### Pitfall 5: `rules/2026.json`'s rule-string schema can't express "R104 twice"
**What goes wrong:** The Game Manual research below confirms BOTH the perimeter number (110in) and the height number (30in) technically live under the SAME rule, R104 ("STARTING CONFIGURATION – max size"). But `RuleEntrySchema.rule` is zod-validated with `regex(/^R\d+$/)` (`src/server/config/schema.ts`), and every existing check does `config.rules.find((r) => r.rule === "R104")` — a bare string match. Two config entries both literally `"R104"` would collide (`.find` returns only the first match), and a suffixed key like `"R104-HEIGHT"` would fail the regex.
**Why it happens:** The season-config shape (`{ rule, title, limit, unit, operator }`, one rule ⇒ one limit) was designed in Phase 1 before Phase 3's dual-limit-under-one-rule situation was known.
**How to avoid:** Keep the pragmatic split ALREADY SHIPPED in Phase 1's `rules/2026.json` — a config entry keyed `"R101"` for perimeter (110, title "Frame Perimeter") and a separate entry keyed `"R104"` for height (30, title "Starting Configuration Height") — rather than trying to force both under one literal `"R104"` key. This is schema-compliant today and requires zero migration. Clarify in each verdict's title/caveat text that R101 is technically the *definitional* rule (taut-string method + minor-protrusion exception) while the numeric 110in limit is stated in R104 — cite R101 as the check's `rule` field (existing convention) but consider adding a caveat like "limit value per R104" for full accuracy. This is a naming/citation nuance, not a blocking decision — flag it for planner/user confirmation.
**Warning signs:** None at runtime (this is a documentation-accuracy concern, not a functional bug) — but a technically-precise inspector or mentor could flag "R101 has no number" if the citation isn't clarified.

### Pitfall 6: SVG y-axis flip
**What goes wrong:** World floor-plane Y and SVG viewBox Y point in opposite visual directions (SVG Y increases downward) — rendering hull points directly as SVG `x,y` without negating Y produces a mirrored/upside-down footprint.
**Why it happens:** Easy to forget when mapping a `[x, y]` array straight into an SVG `<polygon points="...">` string.
**How to avoid:** Negate (and offset for the viewBox) the Y coordinate specifically at the SVG-mapping boundary; document the flip inline in the render component.
**Warning signs:** The rendered hull looks correctly shaped but is vertically mirrored versus the robot's actual top-down layout.

### Pitfall 7: `polygonHull` returns `null` for degenerate input
**What goes wrong:** Exactly 1 or 2 `FRAME_`-tagged parts (or fewer than 3 unique projected corner points after floor-projection, e.g. a single point repeated) causes `d3-polygon`'s `polygonHull()` to return `null` (confirmed via source: `if ((n = points.length) < 3) return null;`). Code that does `hull.length` or iterates `hull` without a null-check will throw at runtime.
**Why it happens:** Easy to assume "at least one FRAME_ part" (already handled by the SC4 empty-state) is sufficient, forgetting a single tagged part still only contributes up to 8 corner points, which CAN legitimately produce `<3` unique points after floor-projection in edge cases (e.g. a part whose bbox degenerates to a line when viewed from above).
**How to avoid:** Explicit `if (!hull)` branch returning UNKNOWN with an "insufficient frame geometry" caveat, distinct from the SC4 "no FRAME_ parts tagged" empty state.
**Warning signs:** A 500 error / crash specifically on documents with very few tagged frame parts.

### Pitfall 8 (SC4 short-circuit): Don't fetch bboxes before checking for FRAME_ parts
**What goes wrong:** If the geometry enrichment step (5c) runs its per-part bbox fetch unconditionally, a document with zero `FRAME_` parts still pays for the group-iteration overhead (harmless but wasteful) — more importantly, the perimeter CHECK function must short-circuit to UNKNOWN with the explicit "not yet checkable — no frame parts tagged" caveat (Success Criterion 4) BEFORE attempting any hull math, not after a hull computation happens to fail.
**Why it happens:** Natural to write the empty-check as "if hull is null" (Pitfall 7's branch) and conflate it with the "no FRAME_ parts at all" case — they need distinct caveat wording per Success Criterion 4's exact phrasing.
**How to avoid:** Filter to `frameFacts` first; if `frameFacts.length === 0`, return UNKNOWN immediately with the SC4-exact wording, before any bbox/hull logic runs.

## Code Examples

### Applying the occurrence transform to a bounding-box corner

```typescript
// Source: forum.onshape.com/discussion/19505 (community-documented transform
// array layout, MEDIUM confidence — not an official-docs citation, VERIFY
// against the live spike before trusting in production) + onshape-public.github.io
// api-adv/assemblies (official docs, HIGH confidence: transforms are absolute/
// world, not relative to parent).
//
// Row-major 4x4 affine matrix, 16 flat elements:
//   [ r11 r12 r13 tx ]     indices [ 0  1  2  3 ]
//   [ r21 r22 r23 ty ]  =  indices [ 4  5  6  7 ]
//   [ r31 r32 r33 tz ]     indices [ 8  9 10 11 ]
//   [  0   0   0  1 ]      indices [12 13 14 15 ]
//
// world = M * [x, y, z, 1]^T  (translation lives in column 3 of each row)
function transformPoint(m: number[], [x, y, z]: [number, number, number]): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ];
}
```

### Enumerating the 8 corners of a `BTBoundingBoxInfo`

```typescript
// Source: src/server/onshape-client/types/onshape.d.ts line 3206 —
// BTBoundingBoxInfo = { lowX?, lowY?, lowZ?, highX?, highY?, highZ? } (all
// optional numbers — an absent field, not just a missing box, is possible
// and must be treated as UNRESOLVED, never defaulted to 0).
function cornersOf(box: { lowX?: number; lowY?: number; lowZ?: number; highX?: number; highY?: number; highZ?: number }): Array<[number, number, number]> | undefined {
  const { lowX, lowY, lowZ, highX, highY, highZ } = box;
  if ([lowX, lowY, lowZ, highX, highY, highZ].some((v) => v === undefined)) return undefined;
  const xs = [lowX!, highX!], ys = [lowY!, highY!], zs = [lowZ!, highZ!];
  const corners: Array<[number, number, number]> = [];
  for (const x of xs) for (const y of ys) for (const z of zs) corners.push([x, y, z]);
  return corners; // 8 corners
}
```

## State of the Art

| Old Understanding (STATE.md / ROADMAP flag) | Corrected Understanding (this research) | Confirmed | Impact |
|--------------|------------------|--------------|--------|
| "R104 vs R107" — ambiguous which rule governs starting height | **R104** governs starting-configuration height (30in); **R107** is a separate "vertical extension limit" rule (also 30in numerically, but scoped to any-time extension, not the as-modeled starting configuration) | Official 2026 Game Manual PDF, TU22, page 81 | `rules/2026.json`'s existing R104 entry (title "Starting Configuration Height") is the correct citation — no config change needed, just flip `limitStatus` to VERIFIED. |
| "R101 = Frame Perimeter, limit 110" (rules/2026.json) | R101 **defines** ROBOT PERIMETER (taut-string method, minor-protrusion exception) but states **no number**; the 110.0in limit is actually stated under **R104** ("STARTING CONFIGURATION — max size") | Official 2026 Game Manual PDF, TU22, pages 78-79 | Config schema (`^R\d+$` regex, single-rule-string lookup) can't cleanly express "both numbers under R104" — recommend keeping the existing R101/R104 split (Pitfall 5) rather than a schema migration. |
| Minor-protrusion exception — "PDF parse failed," existence/wording unconfirmed | Confirmed to exist, exact text: *"Minor protrusions no greater than 0.25in (0.64cm) such as bolt heads, fastener ends, weld beads, and rivets are not considered part of the ROBOT PERIMETER"* (R101) | Official 2026 Game Manual PDF, TU22, page 78 | Confirms the deferral decision was correct for the RIGHT reason: the text is simple, but bounding-box-corner geometry has no concept of "this corner is a bolt head" — implementing requires sub-part feature-level geometry (tessellation upgrade path, D-03), not a v1 change. |
| R101/R103/R104/R408 limits marked `limitStatus: PLACEHOLDER` | All four numbers (110in, 115lb, 30in, 135lb) match the verified 2026 Game Manual exactly | Official 2026 Game Manual PDF, TU22, pages 78-79 | `rules/2026.json` can flip `limitStatus` from `PLACEHOLDER` to `VERIFIED` for these four entries — recommend as a Phase 3 data task, not asserted as done by this research document itself. |

**Deprecated/outdated:** None — this is a first-implementation domain, not a library-upgrade one.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The per-part `getBoundingBoxes` endpoint (Parts API, `/api/parts/.../partid/{partid}/boundingboxes`) returns corners in the Part Studio's LOCAL coordinate system, requiring `Fact.transform` to be applied | Pattern 1, Pitfall 1, Code Examples | If actually already world-space, applying the transform anyway double-transforms every point, producing a wildly wrong (likely huge or NaN-adjacent) hull. **MUST be confirmed by a live spike before this endpoint is used in a check.** |
| A2 | The assembly-level `getAssemblyBoundingBoxes` endpoint returns its box already in world (== the top-level assembly's own) coordinate space, needing no further transform | Pattern 2, Pitfall 1 | If actually relative to some other frame, the height figure would be systematically wrong (though likely still internally consistent, so a FAIL/PASS threshold could still be roughly right by luck — risk is moderate, not catastrophic, but still must be verified). |
| A3 | The `transform` array is row-major with translation in column 3 of each row (`world = m[0..2]·[x,y,z] + m[3]`, etc.) — sourced from a 2026-era Onshape community forum thread, not official docs | Code Examples ("Applying the occurrence transform") | If the layout is actually the transposed (column-major) convention, translation would be misapplied and every world-space point would be wrong by the translation offset (rotation might still look roughly right for axis-aligned parts, masking the bug on simple test cases). |
| A4 | Onshape bounding-box coordinate values are SI meters (same convention as mass-properties' kg/m³) | Standard Stack, Pitfall 3 | If actually in the document's display units (which vary per-document), the M_TO_IN conversion would be wrong and every verdict's measured value would be off by whatever the display-unit/meter ratio is. |
| A5 | `rules/frcmanual.com` community mirror text (used for an initial cross-check before the official PDF extraction) is faithful to the official manual | Sources | Low risk — this was only used as a preliminary cross-check; the load-bearing citation in this document is the direct PyPDF2 extraction of the official `firstfrc.blob.core.windows.net` PDF, not the mirror. |

**Live-verification priority:** A1, A2, and A3 should all be resolved by the SAME `scripts/spike-bounding-boxes.ts` task (fetch one FRAME_ part's per-part bbox, fetch the assembly-level bbox, apply the transform per A3, and cross-check both against Onshape's UI-reported position/dimensions for a real document) before any check logic is written — this is the single highest-leverage verification task for this phase, exactly as CONTEXT.md anticipated ("If ambiguous, the plan must include an early live-verification task").

## Open Questions

1. **Bounding-box coordinate frame (the phase's primary unknown)**
   - What we know: Neither endpoint's OpenAPI spec entry nor Onshape's public docs state the coordinate frame explicitly. Onshape's general transform model (occurrence transforms are absolute, world = the top-level assembly's own coordinate system) strongly supports the inference in A1/A2 above.
   - What's unclear: Whether the inference holds empirically for these two SPECIFIC endpoints (as opposed to the general assembly-transform model, which is well-documented but describes a different API surface — `getAssemblyDefinition`'s `occurrences[].transform`, not the bounding-box endpoints).
   - Recommendation: First planning/execution task is `scripts/spike-bounding-boxes.ts` (mirrors `spike-mass-properties.ts`'s already-proven pattern), run against a real document with at least one `FRAME_`-tagged part positioned off the assembly origin (so a coordinate-frame mistake is visually/numerically obvious, not masked by coincidental symmetry).

2. **Does `getAssemblyBoundingBoxes` include hidden/suppressed occurrences by default for the height figure?**
   - What we know: The endpoint has an `includeHidden` query parameter (boolean), implying the default behavior excludes hidden parts.
   - What's unclear: Whether "hidden" here means Onshape-UI-hidden (a display-only toggle unrelated to the actual robot) or something else, and whether a team's default-configuration state could have physically-relevant parts hidden.
   - Recommendation: Leave `includeHidden` unset (default false, matching how a team would normally view their model) for v1; note as a caveat-worthy nuance if the spike reveals surprising exclusions, but not a blocker.

3. **Should the perimeter check cite `R101`, `R104`, or both, given the rule-number nuance (Pitfall 5)?**
   - What we know: `rules/2026.json` already ships a schema-compliant split (R101 entry for perimeter, R104 entry for height) that requires no migration.
   - What's unclear: Whether the user/planner wants the citation nuance (R101 = definition, R104 = number) surfaced in the UI (e.g., via a caveat) or left as-is (R101 as the informal-but-conventional perimeter citation, matching how many FRC teams colloquially refer to "the R101 limit").
   - Recommendation: Keep the existing config split (zero migration cost); planner should decide whether to add a one-line caveat clarifying the R104 number-source for full accuracy — low-stakes either way since both rule numbers are real and relevant.

## Environment Availability

No new external tools, services, or runtimes are introduced by this phase — it extends the existing Node 22 / Express 5 / TypeScript backend and adds one new npm dependency pair (`d3-polygon` + `@types/d3-polygon`, both verified available on the npm registry, see Package Legitimacy Audit). Onshape API access (OAuth session, `callWithRefresh`) is already proven end-to-end by Phases 1-2.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `d3-polygon` (npm) | GEOM-01 hull computation | ✓ (verified via `npm view`) | 3.0.1 | Hand-rolled monotone chain (not recommended, see Don't Hand-Roll) |
| `@types/d3-polygon` (npm) | TS typecheck of hull code | ✓ (verified via `npm view`) | 3.0.2 | `// @ts-expect-error` + a local `.d.ts` shim (not recommended — real types exist) |
| Onshape bounding-box API endpoints | GEOM-01/GEOM-03 geometry fetch | ✓ (present in the already-vendored `onshape.d.ts` OpenAPI spec, lines 469, 1565, 1816, 3201-3219, 10064-10094, 12219-12248) | — | None needed — endpoints exist in the current spec. |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — both new packages are confirmed available.

## Security Domain

`security_enforcement` is enabled (`security_asvs_level: 1`) per `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (unchanged) | Reuses Phase 1's OAuth2 + `callWithRefresh` session model — no new auth surface. |
| V3 Session Management | No (unchanged) | Reuses Phase 1's `express-session` MemoryStore — no new session logic. |
| V4 Access Control | No (unchanged) | Single-user, session-scoped; no new roles/permissions introduced. |
| V5 Input Validation | Yes (reused, no new surface) | The route's `CheckRequestSchema` (zod) already validates `documentId`/`workspaceId` shape; the NEW bounding-box calls use `documentId`/`elementId`/`partId` values that are **all server-derived from the already-fetched `definition.parts[]`** (same T-01-11/CONN-02 discipline as the existing mass/material enrichment — never `req.body`). No new zod schema is needed for this phase's request surface. |
| V6 Cryptography | No | No new crypto introduced. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Trusting client-supplied element/part identifiers for a new Onshape API call | Tampering / Elevation of Privilege | Continue the established discipline: every id passed into `getBoundingBoxes`/`getAssemblyBoundingBoxes` must originate from the server-fetched `definition`/`groupPartsByElement()` output, never from `req.body` — identical to the existing 5b mass/material block and directly auditable by grepping for any new `req.body.*` reference near the bounding-box calls. |
| Over-broad error surfacing on 403 (leaking which referenced documents exist/are inaccessible) | Information Disclosure | Continue the existing per-group swallow-and-UNRESOLVED pattern (never propagate raw Onshape error bodies/document ids from referenced-document 403s into the client-facing response) — the caveat text should describe the COUNT of unresolved parts, not the specific referenced document identifiers. |
| Denial of service via a document with an extreme number of `FRAME_`-tagged parts (each triggering its own bbox API call) | Denial of Service | Not newly introduced by this phase (the existing per-group mass/material fetch has the same shape), but worth noting: since `FRAME_` tagging is a deliberate, small, human-curated subset (unlike "all parts," which is why height uses the single assembly-level call instead — see Pitfall 2), this risk is bounded by design rather than needing a new rate limit for v1. |

## Sources

### Primary (HIGH confidence)
- `src/server/onshape-client/types/onshape.d.ts` (repo, generated from Onshape's official OpenAPI spec) — confirmed `BTBoundingBoxInfo` shape (`lowX/lowY/lowZ/highX/highY/highZ`, all optional numbers), confirmed `getAssemblyBoundingBoxes`/`getBoundingBoxes`/`getPartStudioBoundingBoxes` query parameters (none include a coordinate-system/transform/occurrence option), confirmed none of the three declare a `partId[]` bulk filter (only the per-part endpoint's `partid` PATH param, singular).
- `https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf` (official 2026 FRC Game Manual, Team Update 22) — directly downloaded and text-extracted via PyPDF2 in this research session; source of the verbatim R101/R102/R103/R104/R105/R106/R107 rule text quoted throughout this document (pages 78-81).
- `https://onshape-public.github.io/docs/api-adv/assemblies/` — official Onshape Developer Documentation; confirmed occurrence transforms are absolute (not relative to parent) and defined with regard to the top-level assembly's own coordinate system.
- `https://github.com/d3/d3-polygon/blob/main/src/hull.js` and `.../src/length.js` — source code read directly; confirmed `polygonHull` returns `null` for `<3` points and prunes collinear points via `cross() <= 0`; confirmed `polygonLength` auto-closes the loop (`b = polygon[n-1]` initialized before the loop).
- `https://d3js.org/d3-polygon` — official D3 documentation; confirmed `polygonHull` returns counterclockwise order in standard (y-up) Cartesian coordinates.
- npm registry, queried directly via `npm view` / `api.npmjs.org` — `d3-polygon@3.0.1` (created 2015-07-07, 14.4M weekly downloads, no postinstall script), `@types/d3-polygon@3.0.2` (13.3M weekly downloads, DefinitelyTyped, no postinstall script).
- `.planning/phases/02-trustworthy-weight/02-MASS-PROPERTIES-CONTRACT.md` (repo, live-verified in Phase 2) — source of the SI-units precedent (rule 2) and the assembly-level-resolves-references-server-side precedent (F4) that this research extends to bounding boxes.
- `slopcheck scan --pkg npm <name>` (local tool) — `[OK]` verdict for both `d3-polygon` and `@types/d3-polygon`.

### Secondary (MEDIUM confidence)
- `https://forum.onshape.com/discussion/19505/where-can-i-find-the-meaning-of-the-number-in-the-transform-property-from-the-api` — community-documented 16-element transform array layout (row-major, translation in column 3 of each row: `[r11,r12,r13,tx, r21,r22,r23,ty, r31,r32,r33,tz, 0,0,0,1]`). Not an official-docs citation — flagged as Assumption A3, recommended for live-spike confirmation.
- `https://forum.onshape.com/discussion/10943/what-is-the-transform-field-in-the-occurrence-field-when-i-query-the-assembly-api-doing` — corroborating community discussion of the general transform model (absolute, world-frame).
- `https://www.frcmanual.com/2026/robot-construction-rules-(r)` — community HTML mirror of the Game Manual, used only as a preliminary cross-check before the official PDF was directly extracted; the official PDF extraction (Primary sources) is the load-bearing citation, this mirror agreed with it on every point checked.

### Tertiary (LOW confidence)
- None — every claim in this document either traces to a Primary source, a Secondary source with an explicit confidence caveat and Assumptions Log entry, or is marked `[ASSUMED]`/flagged for live verification.

## Metadata

**Confidence breakdown:**
- Standard stack (d3-polygon + types): HIGH — directly verified via npm registry, GitHub source read, and slopcheck.
- Architecture / bounding-box coordinate frame: MEDIUM — strong inference from documented Onshape transform model + endpoint parameter shapes, but not empirically confirmed against a live document in this research session (requires the recommended spike task).
- Game Manual rule numbers/limits/minor-protrusion exception: HIGH — directly extracted from the official 2026 Game Manual PDF via PyPDF2 in this session, not a training-data recall.
- Pitfalls (UNRESOLVED-gating false-PASS risk, unit conversion, SVG y-flip, schema rule-key collision): HIGH — derived directly from the codebase's own established patterns (Phase 1/2 code) and the confirmed d3-polygon/Game-Manual findings, not speculative.

**Research date:** 2026-07-09
**Valid until:** ~30 days for the library/architecture findings (d3-polygon, transform model, config schema); the Game Manual findings are valid for the remainder of the 2026 season (Team Updates can revise the manual, so re-check the manual's Team-Update number before relying on these exact figures if planning happens significantly later in the season).

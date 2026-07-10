# 03 Bounding-Box Contract (live-verified)

**Status:** CONFIRMED against a live Onshape document on 2026-07-10.
**Verified with:** the throwaway `scripts/spike-bounding-boxes.ts` driving the real `OnshapeClient` methods added in 03-01 (`getBoundingBoxes`, `getAssemblyBoundingBoxes`), run against:
- the **user-owned** robot `finalindex` (assembly element `9d435858fd3373662db0fe67`) — a self-contained imported assembly (30 in-document parts, 97 occurrences, 81 indexed instances). Same document used to live-verify the Phase 2 mass contract.

This file is ground truth for 03-02 (frame-perimeter check) and 03-03 (starting-height check). Where it corrects the research, the correction wins.

> **Test-document caveat:** `finalindex` has **no `FRAME_`-tagged parts**, so the spike selected the first **off-origin** Part occurrence (`partId=JF/`) to confirm the coordinate frame. The coordinate-frame conclusions below are fully valid (they don't depend on the tag); the `FRAME_`-tag *selection* path in Plan 02 still needs an end-to-end test against a properly tagged document before the perimeter check is trusted in production.

---

## The four locked contract answers

### A1 — Per-part `getBoundingBoxes` returns LOCAL coordinates → **apply the occurrence transform** ✅
The per-part endpoint returns box corners in the **Part Studio's LOCAL frame**. To reach the part's true assembly (world) position, `Fact.transform` (the occurrence transform) **MUST** be applied. Confirmed by round-trip on off-origin `partId=JF/`:
- **Raw box** was origin-symmetric: `X,Y ∈ ±0.0155575, Z ∈ [0, 0.00792734]` — i.e. centred on the part's own origin. The assembly world envelope does **not** contain the origin (it needs `Y ≥ 0.0859` and `X ≤ −0.0094`), so the raw corners are **outside** the robot.
- **After applying the transform**, corners landed at `X ∈ [−0.5858, −0.5778]`, `Y ∈ [0.3793, 0.4109]`, `Z ∈ [0.4287, 0.4603]` — **inside** the assembly envelope `X[−0.695, −0.009] Y[0.086, 0.436] Z[−0.203, 0.655]`.
- Raw = outside, transformed = inside ⇒ endpoint is **LOCAL, transform required**. (If it were already world-space the raw corners would have matched — they didn't.)

### A2 — Assembly `getAssemblyBoundingBoxes` is already WORLD-space → **no transform** ✅
`getAssemblyBoundingBoxes` returns a single whole-robot box already in the assembly/world frame. No per-part or occurrence transform is applied to it.
- Observed: `lowX −0.6952, lowY 0.0859, lowZ −0.2028, highX −0.0094, highY 0.4362, highZ 0.6545` — an offset (non-origin-centred) box in world coordinates.
- The transformed per-part corners (A1) fall **inside** this box, confirming both live in the same frame.

### A3 — Transform is **row-major, 4×4, translation in column 3 (indices 3, 7, 11)** → inferred formula is CORRECT, use as-is ✅
The 16-element occurrence transform is row-major; each row is `[r0 r1 r2 Tx | r3 r4 r5 Ty | r6 r7 r8 Tz | 0 0 0 1]` with translation at indices **3, 7, 11**. The research-inferred `transformPoint` formula is confirmed **unchanged** — Plan 02's `transform-point.ts` implements it verbatim.

**Confirmed formula (world = R·local + T):**
```
worldX = m[0]*x + m[1]*y + m[2]*z + m[3]
worldY = m[4]*x + m[5]*y + m[6]*z + m[7]
worldZ = m[8]*x + m[9]*y + m[10]*z + m[11]
```
- Observed transform for `JF/`: `[−4.7e-16, 2.0e-16, −1, −0.5778 | 0.9999, −0.0156, −4.7e-16, 0.3951 | −0.0156, −0.9999, −1.9e-16, 0.4445 | 0, 0, 0, 1]`.
- **Rotation matters, not just translation:** this part is genuinely rotated (~90° — note the `−1` / `0.9999` rotation entries). Applying the full R+T (not translation-only) is what landed the corners correctly. Plan 02 must apply the whole 3×4, not just the translation column.

### A4 — Box values are **SI meters** → `× 39.37007874` to inches ✅
Raw REST JSON is SI meters regardless of the document's display units (same convention as the Phase 2 mass contract's kg/m³).
- Off-origin part extent: `1.225 in × 1.225 in × 0.312 in` (a small plate/spacer) — sane in inches after `×39.37`.
- Assembly `highZ = 0.6545 m → 25.77 in` — a plausible whole-robot starting height.
- Convert via a single `M_TO_IN = 39.37007874` constant (mirror Phase 2's `KG_TO_LB` single-constant pattern).

---

## Design guidance (read before executing 03-02 / 03-03)

### G1 — Occurrence ↔ part join goes through INSTANCES, not partId-in-path
`rootAssembly.occurrences[].path[]` holds **instance ids**, NOT part ids. To get a part's world transform:
1. Build an instance map from `rootAssembly.instances[]` **and** every `subAssemblies[].instances[]` (`id → {partId, elementId, documentId, configuration, type}`). On `finalindex`: 81 instances indexed across root + sub-assemblies.
2. For each occurrence, resolve `path[path.length − 1]` (the leaf instance id) via that map to recover its `partId`.
3. `occurrences[].transform` is the **absolute/world** transform of that leaf occurrence — apply it directly to the part's LOCAL box corners.

This is the same many-occurrences-per-part shape as the Phase 2 mass join (one CAD `partId`, many placed instances). A `FRAME_` part placed N times yields N occurrences, each with its own transform — the perimeter hull must include the transformed corners of **every** occurrence, not just one.

### G2 — Perimeter (03-02): floor-project transformed FRAME_ corners → 2D convex hull
For each `FRAME_`-tagged part occurrence: fetch its per-part box (A1), enumerate 8 corners, apply the occurrence transform (A3), drop Z (floor-project to XY), collect all XY points across all FRAME_ occurrences, run `d3-polygon` `polygonHull()`, and measure perimeter. Convert meters→inches (A4) before comparing to the 110 in limit (R101/R104).

### G3 — Starting height (03-03): prefer the assembly-level box highZ
The whole-robot starting-configuration height is `getAssemblyBoundingBoxes(...).highZ` directly (A2 — already world-space, no transform, no per-part enumeration). Convert `×39.37` (A4) and compare to the 30 in limit (R104). This is simpler and more robust than summing per-part boxes, and it resolves referenced parts server-side (same advantage the Phase 2 assembly-total call had — see 02 contract F4).

### G4 — Absent-field discipline
`BTBoundingBoxInfo` fields are all optional. Treat any absent `lowX..highZ` as **UNRESOLVED**, never default to 0 (a 0 would silently corrupt the hull / height). `cornersOf()` in the spike already returns `undefined` on any missing field — mirror that in production enrichment.

---

## Endpoints exercised (via the 03-01 `callWithRefresh`-wrapped methods)
| Call | Path | Result |
|------|------|--------|
| Assembly definition | `/api/assemblies/d/{d}/w/{w}/e/{e}` | `instances[]` + `occurrences[]` join (G1) ✓ |
| Per-part bounding box | `/api/parts/d/{d}/w/{w}/e/{e}/partid/{partId}/boundingboxes` | LOCAL box, transform required (A1) ✓ |
| Assembly-level bounding box | `/api/assemblies/d/{d}/w/{w}/e/{e}/boundingboxes` | world-space whole-robot box (A2, height source for 03-03) ✓ |

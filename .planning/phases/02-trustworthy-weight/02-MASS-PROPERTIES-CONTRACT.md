# 02 Mass-Properties Contract (live-verified)

**Status:** CONFIRMED against live Onshape documents on 2026-07-09.
**Verified with:** the throwaway `scripts/spike-mass-properties.ts` driving the real `OnshapeClient` methods added in 02-01, run against:
- Team 1678 Citrus Circuits' **public** robot `1678-19-A-0100` (`60eb73d…`) — a real multi-document assembly (201 parts across 40+ referenced documents), and
- a **user-owned** robot `finalindex` (`78cf1f53…`) — a self-contained imported assembly (30 in-document parts), used to observe a real materialized-part mass.

This file is ground truth for 02-02 (enrichment merge) and 02-03 (weight verdicts). Where it corrects the research, the correction wins.

---

## The four locked contract rules

### 1. Nominal mass index → `mass[0]`
`getPartStudioMassProperties` returns `bodies[partId].mass` as a **3-element array** `[nominal, lowerBound, upperBound]`. The three values are near-identical (tolerance band is tiny). **Use `mass[0]`.**
- Observed (aluminum part): `mass = [2.9028915732…, 2.9028915455…, 2.9028916009…]` → `mass[0] = 2.9028915732…`.
- Confirms research **A1** (Open Question 1).

### 2. Unit → **SI kilograms** (canonical)
Raw REST JSON is SI regardless of the document's display units.
- The 2.90 value above is a large aluminum plate ≈ **6.4 lb** — a sane kg reading (pounds would be a 1.3 kg plate; grams absurd).
- Corroborated by `volume` being reported in **m³** (`0.0057 m³` ≈ 5,700 cm³) in the same responses.
- Render pounds via the single `KG_TO_LB = 2.2046226218` constant (D-01/D-02). Confirms **A2** (Open Question 2).

### 3. Occurrence → part join key → `definition.parts[] → partId`
`BTAssemblyDefinitionInfo.parts[]` is a flat array; each entry carries:
`partId, documentId, elementId, configuration, fullConfiguration, bodyType, isStandardContent, documentVersion, documentMicroversion`.
Join a traversal occurrence (`Fact`) to its mass/material by **`partId`** within the same `documentId:elementId:configuration` context. `parts[]` is **deduplicated to one entry per unique CAD part**, so MANY occurrences map to ONE `parts[]`/mass entry via shared `partId` (the expected, simpler case). Confirms **A3-join** (Open Question 3).

### 4. Material-absence detection → `getPartsMetadata(...).material` present vs absent
- Material **assigned** → metadata entry has `material` populated (`material.displayName` e.g. `"Aluminum"`).
- Material **unassigned** → `material` is **absent / null**.
- Observed: materialized part → `materialPresent=true material="Aluminum"`; every unmaterialized part → `material=null`. Confirms **Pitfall 1** (absence, not a substituted default density, is the signal).

---

## Additional live findings (impact 02-02 / 02-03 — read before executing them)

### F1 — Unmaterialized parts are OMITTED from mass, and Onshape flags the count
- When queried **with** a `partId` filter, an unmaterialized part is simply **absent from `bodies`** (its `mass` is `undefined`), it is **not** returned as `mass: 0`.
- Onshape also exposes `hasMass` (boolean) and `massMissingCount` (int) at both part-studio and assembly level. Observed the counter track precisely: materializing exactly one part changed `massMissingCount` 30 → 29 and `hasMass` false → true.
- **Design:** the WGHT-01/02 material audit should key off `getPartsMetadata` (`material == null`) as the authoritative "which parts are unmaterialized" list; `hasMass`/`massMissingCount` are a cheap **cross-check** on "how many".

### F2 — CORRECTION to research A3: no `partId` filter returns an AGGREGATE, not per-part
Calling `getPartStudioMassProperties` **without** `partId`s returns a **single aggregate body keyed `-all-`** (the summed mass of all mass-bearing bodies), NOT one entry per part.
- Observed: no-filter call → `bodies = { "-all-": { mass:[…], hasMass, massMissingCount } }`.
- **Design:** 02-02's merge MUST pass the explicit `partId[]` (derived from `parts[]`) to get a per-part breakdown. (Research A3 said no-filter returns "ALL parts" individually — that is wrong; it returns one `-all-` aggregate.)

### F3 — Cross-document parts need version/microversion context; may still be unreadable
Referenced parts (whose `documentId` ≠ the assembly's) **cannot** be read via the assembly's workspace (`w/{workspaceId}`) → **HTTP 403**. `parts[]` provides `documentVersion` and `documentMicroversion` for `v/{…}` / `m/{…}` addressing.
- On **Team 1678's public robot**, even version-addressed reads 403'd — the referenced part libraries belong to another team and aren't readable by this token. 40 of 42 part-studio elements were cross-document.
- On the **user's own** `finalindex` (imported/self-contained), **all 30 parts were in-document** → no 403.
- **Design/limitation:** per-part-studio mass works cleanly for **self-contained / owned** robots. Robots that link external (other-owner) libraries will have parts whose per-part mass/material the token cannot introspect. Real teams checking their *own* design are the primary case and are fine; record this as a known limitation (and a reason to prefer the assembly-level total for the *sum* — see F4).

### F4 — Assembly-level total resolves references server-side (and demonstrates the whole problem)
`GET /api/assemblies/d/{did}/w/{wid}/e/{eid}/massproperties` returns the **whole-assembly total** with the same `mass[]` / `hasMass` / `massMissingCount` shape; Onshape resolves references **server-side** (no per-document 403 dance).
- On `finalindex` (30 parts, all but one unmaterialized): it returned `mass=[0,0,0], hasMass=false, massMissingCount=84` **even though `volume` was non-zero** — i.e. Onshape's own reported "total mass" silently EXCLUDES every unmaterialized part. **This is precisely the failure CADChecker exists to surface.**
- **Design consideration for 02-03:** the per-occurrence `Fact` sum (02-02/02-03) remains the source of the trustworthy verdict, but the assembly-level `massMissingCount` is a strong, cheap corroborating signal that parts are being silently dropped.

---

## Endpoints exercised (all via the 02-01 `callWithRefresh`-wrapped methods, except F4 raw fetch)
| Call | Path | Result |
|------|------|--------|
| Assembly definition | `/api/assemblies/d/{d}/w/{w}/e/{e}` | `parts[]` join key ✓ |
| Part-studio mass (same-doc) | `/api/partstudios/d/{d}/w/{w}/e/{e}/massproperties?partId=…` | per-part `bodies[partId]` ✓ |
| Part-studio mass (referenced) | same, `v/{documentVersion}` | 403 on other-owner docs (F3) |
| Parts metadata | `/api/parts/d/{d}/w/{w}/e/{e}` | `material` present/absent ✓ |
| Assembly-level total | `/api/assemblies/d/{d}/w/{w}/e/{e}/massproperties` | whole-robot total (F4) |

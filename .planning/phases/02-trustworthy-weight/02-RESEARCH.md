# Phase 2: Trustworthy Weight - Research

**Researched:** 2026-07-02
**Domain:** Onshape mass-properties API surface, material-assignment metadata, occurrence-to-part-studio joins for FRC weight verdicts
**Confidence:** MEDIUM (mass-properties response *shape* is HIGH-confidence, schema-verified; the "no material -> excluded from calc" behavior is HIGH-confidence per official docs; the exact live JSON for `hasMass`/`massMissingCount` on a real document is still unverified live and flagged below)

## Summary

Phase 1 never called mass properties. The single most important finding of this research is structural, not cosmetic: **there is no assembly-level mass-properties endpoint in the Onshape API at all.** The only mass-properties operations are `getMassProperties` (single part, scoped to `partid` in the path) and `getPartStudioMassProperties` (a Part Studio, with an optional `partId[]` query filter and `massAsGroup` flag) — both schema-confirmed in `src/server/onshape-client/types/onshape.d.ts` (`operations.getMassProperties`, `operations.getPartStudioMassProperties`). This means R103/R408's occurrence-filtered subtraction math (D-05) cannot be done with one assembly-scoped call; it must be done by (a) getting the assembly definition's flat `parts[]` list (already-available `BTAssemblyDefinitionInfo.parts: BTAssemblyPartsInfo[]`, each with `documentId`/`elementId`/`partId`/`configuration`), (b) grouping those parts by their owning Part Studio element, and (c) calling `getPartStudioMassProperties` once per distinct Part Studio element with `partId` repeated as a query param to get a per-part mass breakdown (`BTMassPropertiesBulkInfo.bodies`, keyed by part id). Occurrence-level filtering (subtracting `BUMPER_`/`BATTERY_` *occurrences*) then happens in application code by matching each `Fact`'s `partId` (already carried through `flatten-assembly.ts`) to its corresponding per-part mass entry in that bulk response — not by any Onshape-side occurrence-scoped mass query, because none exists.

The second major finding directly changes the material-audit detection rule from what the phase description hypothesized. Onshape's own official help documentation states plainly that a part with no material assigned is **excluded from the mass calculation entirely** — it does not get a default/substitute density. This was corroborated independently via the API schema: `BTMassPropertiesInfo-null.massMissingCount` is described (Java client docs, forum) as the count of bodies without mass in that response, and `BTPartMetadataInfo.material?: BTPartMaterialInfo` is an optional field that is absent/undefined when no material is assigned. This means "default material" is a slight misnomer for this app's purposes — the accurate framing for the audit and for CLAUDE.md/CONTEXT.md language is "**missing/unassigned material**" (which Onshape silently *drops* from mass, rather than a "default-density substitution" which would silently *distort* it). Either way the effect on trust is the same — the weight number quietly becomes wrong — but the detection rule is cleaner than hypothesized: check `BTPartMetadataInfo.material` for presence/absence per part, and cross-check `massMissingCount` on the corresponding mass-properties response as a second signal.

No new npm packages are required for this phase — the existing `openapi-fetch`/`openapi-typescript`-generated `onshape.d.ts` types already contain full schemas for `getMassProperties`, `getPartStudioMassProperties`, `getPartsWMVE` (bulk part-metadata-with-material for a Part Studio element), and `BTPartMaterialInfo`. All mass/material fetching should extend `src/server/onshape-client/client.ts` with 1-2 new typed methods following the existing `callWithRefresh` pattern, exactly as `getAssemblyDefinition` and `getElementsInDocument` already do.

**Primary recommendation:** Add `getPartStudioMassProperties(documentId, wvm, wvmid, elementId, partIds[])` and `getPartsMetadata(documentId, wvm, wvmid, elementId)` to `OnshapeClient`; in `check.routes.ts`, after `flattenAssembly()`, group facts by owning Part Studio element (derivable from `BTAssemblyDefinitionInfo.parts[]`), call both new methods once per distinct Part Studio element (not once per part), and merge `massKg` + `materialIsDefault` (rename recommendation: `materialAssigned: boolean`) onto each `Fact` before the engine runs — keeping check functions pure per D-11's Claude's-Discretion guidance. **Verify the live JSON shape (field names, especially whether `mass` is a 3-element tolerance array vs. a scalar) against a real Onshape document early in planning/execution — this is schema-confirmed but not live-response-confirmed.**

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Display verdicts with pounds as the primary value and kilograms in parentheses (e.g. `114.2 lb (51.8 kg)`).
- **D-02:** Kilograms remain the canonical internal value; convert kg->lb at the display/verdict boundary only. `Verdict` must carry both lb and kg figures.
- **D-03:** Fix `rules/2026.json` — R103/R408 currently say `unit: "kg"` but hold pound-denominated numbers (115, 135). Correct the unit field to `lb`. Limit *values* stay PLACEHOLDER.
- **D-04:** Identify the battery via a `BATTERY_` name prefix, extending the existing `FRAME_`/`BUMPER_`/`MECH_` convention. No Onshape custom properties.
- **D-05:** R103 measured = total mass - `BUMPER_` parts - `BATTERY_` parts. R408 measured = total mass - `BATTERY_` parts (bumpers included). These must be two independently-filtered occurrence queries, not one number relabeled.
- **D-06:** When the relevant tag is absent (no `BATTERY_`/`BUMPER_` part found), still compute the verdict but attach a visible caveat (e.g. "no `BATTERY_` part found — battery mass may be included in this total."). Requires a caveats/notes field on the check output.
- **D-07:** Audit only weight-contributing parts (the occurrences that feed a weight total), not every part in the assembly. Because R103 and R408 have different part sets, "weight-contributing" is per-verdict (see D-09).
- **D-08:** Surface the audit as a full list of offending part names (plus total count) — not a count alone. Include occurrence path/identity where available.
- **D-09:** Per-verdict gating. A part missing material marks only the verdict(s) it actually contributes to as UNKNOWN. The engine must track which parts feed which total.
- **D-10:** In the UNKNOWN state, suppress the weight number entirely — show `UNKNOWN` + affected-part count + offending-parts list, never a partial/floor number.
- **D-11:** The `Verdict`/check-result shape must be extended beyond Phase 1's `{ rule, title, limit, unit, measured, pass: boolean }` to express a tri-state `status (PASS | FAIL | UNKNOWN)`, an optional/suppressible `measured` value (absent when UNKNOWN), lb+kg dual figures (D-02), and a `caveats` list (D-06). The material audit itself is a first-class result, distinct from the two weight verdicts it gates.

### Claude's Discretion

- **Extending the shared facts path:** Preserve the pure-function `CheckFn = (facts, config) => Verdict` contract — the route fetches mass-properties + material assignment and merges them into an extended `Fact` (adding e.g. `massKg` and `material`/`materialIsDefault` fields to `src/server/traversal/facts.ts`). Do NOT make check functions async or let them call the Onshape client directly. Exact enriched-`Fact` field shape is the planner's to design. **Research recommendation: name the field `materialAssigned: boolean` (or `material: { assigned: boolean; id?: string }`) rather than `materialIsDefault`, because this research found Onshape does not substitute a "default material" — it omits unmaterialized parts from mass entirely. See Summary and Pitfall 1.**
- **Mass-query approach** (assembly-level mass-properties with occurrence filtering vs per-part summation) is the planner's call, informed by research. **Research finding: there is no assembly-level mass-properties endpoint — per-Part-Studio calls with `partId[]` filtering is the only available approach; see Standard Stack / Architecture Patterns below.** Verify the actual JSON response shape against a live document early in planning.
- **How "default/unset material" is detected:** planner + researcher determine the exact field/semantics. **Research finding: `BTPartMetadataInfo.material` (from `getPartsWMVE`) is `undefined`/absent when no material is assigned — this is the primary detection signal. `massMissingCount` on the mass-properties response is a secondary/corroborating count-level signal, not a per-part flag.**
- **Material-audit signal wiring:** whether the audit reads material state from the same mass-properties call or a separate parts-metadata query is the planner's call. **Research finding: these are two distinct endpoints with distinct schemas (`BTMassPropertiesBulkInfo` has no material field; `BTPartMetadataInfo` has no mass field) — a separate parts-metadata call (`getPartsWMVE`, one call per Part Studio element, returns ALL parts' metadata including material in one shot) is required regardless of the mass-query approach chosen.**

### Deferred Ideas (OUT OF SCOPE)

- Config limit-value verification (replacing PLACEHOLDER R103/R408 limits with exact current-season Game Manual values) — data/verification task, not a code decision for this phase.
- UI/styling pass for the panel remains deferred until checks compute real values.
- v2 items (webhook auto-refresh, FeatureScript, guided tagging, bumper coverage) — untouched, out of scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WGHT-01 | Audit every part for a default/unset material and flag any that would be silently omitted from the mass total | `getPartsWMVE` (bulk `BTPartMetadataInfo[]` per Part Studio element) is the detection source; `material` field absence is the rule. See Standard Stack + Pitfall 1. |
| WGHT-02 | Weight verdict gated on the material audit — UNKNOWN (with count) if parts missing material, never a confident pass/fail | Per-verdict weight-contributing part sets (R103 vs R408) must each be checked against the audit result before computing `measured`; see Architecture Pattern 2 and D-09/D-10. |
| WGHT-03 | Robot-weight check excluding bumpers and battery (R103), using an occurrence-filtered mass query | No assembly-scoped occurrence filter exists server-side; filtering is done in application code over per-part mass results joined to `Fact.partId`/`Fact.name` prefixes. See Architecture Pattern 1. |
| WGHT-04 | Robot+bumpers weight check (R408), using a separately-filtered mass query | Same per-part mass data, different subtraction set (`BATTERY_` only) — two independent filters over the same underlying per-part mass map, not the same number relabeled. See Architecture Pattern 1. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch mass-properties per Part Studio | API/Backend (`onshape-client/client.ts`) | — | Only the server holds the OAuth access token (T-01-10); all Onshape calls are server-side per Phase 1 pattern. |
| Fetch part material metadata | API/Backend (`onshape-client/client.ts`) | — | Same client, same token-holding constraint. |
| Join occurrence (`Fact`) -> part-studio-scoped mass/material | API/Backend (`check.routes.ts`, pre-engine enrichment step) | — | Requires both the assembly definition's `parts[]` list and the per-Part-Studio mass/material responses; this join is inherently a backend data-assembly step, not a check's job. |
| R103/R408 subtraction math (occurrence filtering by name prefix) | API/Backend (pure `CheckFn`s in `checks/`) | — | Pure function over enriched `Fact[]`, per Phase 1's established CheckFn contract — no network, no traversal, just filter + sum. |
| Material-default audit | API/Backend (pure `CheckFn`, first-class result) | — | Same purity contract; consumes the same enriched `Fact[].materialAssigned`. |
| Unit conversion (kg -> lb) and dual-figure display | API/Backend (verdict-shaping boundary) + Frontend (render) | Frontend/Panel | D-02 locks kg as canonical/computed and conversion as "single documented conversion" at the verdict boundary — recommend doing the conversion once when the `Verdict` is constructed (backend), so the panel only ever renders pre-converted numbers, never re-derives them. |
| Report rendering (audit rows + two weight verdicts + caveats + UNKNOWN state) | Frontend/Panel (`ReportTable.tsx`) | — | Presentation only; no computation, per the deferred-UI-polish note in project memory. |

## Standard Stack

### Core

No new libraries. This phase is 100% additive use of the already-locked stack (see `CLAUDE.md`):

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openapi-fetch` | 0.17.0 | Typed REST calls to the two new mass/material endpoints | Already used for `getElementsInDocument`; same pattern extends cleanly. `[VERIFIED: npm registry — package.json + npm view]` |
| `openapi-typescript` (generated `onshape.d.ts`) | 7.13.0 (generator); types file already committed at `src/server/onshape-client/types/onshape.d.ts`, 14,540 lines | Already contains full schemas for `getMassProperties`, `getPartStudioMassProperties`, `getPartsWMVE`, `BTMassPropertiesBulkInfo`, `BTPartMetadataInfo`, `BTPartMaterialInfo` | `[VERIFIED: codebase grep — confirmed operation + schema names present in the committed generated file]` |
| `zod` | 4.4.3 | Extend `Verdict`/`Fact` schemas if the planner chooses to validate the enriched Fact shape (optional; Phase 1 didn't zod-validate `Fact`, only `SeasonConfig`) | `[VERIFIED: npm registry]` |

### Supporting

No new supporting libraries needed. `vitest` (4.1.9, already installed) covers the new pure-function tests for the audit + two weight checks, following the exact pattern in `checks/engine.test.ts`.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-Part-Studio `getPartStudioMassProperties` with `partId[]` filter | N individual `getMassProperties` calls (one per part, path-scoped `partid`) | Functionally equivalent per-part data, but O(N) HTTP round-trips instead of O(distinct Part Studios) — strictly worse for any assembly with more than a couple parts. Only use per-part calls if a specific part's mass needs re-fetching after a targeted material fix (not the general audit path). |
| `getPartsWMVE` (bulk metadata per element) for material detection | `getPartMetadata` (single part, path-scoped `partid`) | Same O(N) vs O(distinct elements) tradeoff as above — `getPartsWMVE` returns `BTPartMetadataInfo[]` for every part in one Part Studio element in a single call. |
| Deriving Part-Studio groupings from `BTAssemblyDefinitionInfo.parts[]` | Deriving them from `rootAssembly.instances[].elementId` / `BTAssemblyInstanceInfo` | `BTAssemblyInstanceInfo` (the schema backing `rootAssembly.instances`) does NOT carry a `partId` field — only `id`, `elementId`, `documentId`, `type`. The flat `parts[]` array (`BTAssemblyPartsInfo`) is the only structure in `BTAssemblyDefinitionInfo` that carries `documentId`+`elementId`+`partId` together, making it the correct join key source. `flatten-assembly.ts`'s current minimal local types do not surface `parts[]` at all — this is a required extension, not a bug fix. |

**Installation:** None required — no new packages.

**Version verification:** All packages already installed and version-pinned in `package.json`; confirmed current via `npm view <pkg> version` on 2026-07-02:
- `openapi-fetch@0.17.0` — matches installed
- `openapi-typescript@7.13.0` — matches installed
- `zod@4.4.3` — matches installed

## Package Legitimacy Audit

Not applicable — this phase introduces **zero new external packages**. All work extends existing, already-audited dependencies (`openapi-fetch`, the committed generated `onshape.d.ts`, `zod`, `vitest`). No `slopcheck`/registry verification needed.

## Architecture Patterns

### System Architecture Diagram

```
POST /api/check
      |
      v
[1] getElementsInDocument (existing, Phase 1)
      |  finds ASSEMBLY element + (new) enumerates PART STUDIO elements
      v
[2] getAssemblyDefinition (existing, Phase 1)
      |  rootAssembly.occurrences[] --> flattenAssembly() --> Fact[] (partId, name, path)
      |  ALSO: definition.parts[] (BTAssemblyPartsInfo[]) --> {documentId, elementId, partId, configuration}
      |        used to group Facts by their owning Part Studio element
      v
[3] Group distinct (documentId, elementId, configuration) tuples from parts[]
      |
      +--> [3a] getPartStudioMassProperties(did, wvm, wvmid, eid, partId=[...]) per Part Studio
      |          --> BTMassPropertiesBulkInfo.bodies: { [partId]: { mass, hasMass, massMissingCount, ... } }
      |
      +--> [3b] getPartsWMVE(did, wvm, wvmid, eid) per Part Studio
                 --> BTPartMetadataInfo[] (one per part) --> .material (present/absent)
      |
      v
[4] MERGE STEP (check.routes.ts, before engine.runAll):
      for each Fact:
        massKg = bodies[fact.partId].mass[0]           (verify index/shape live)
        materialAssigned = !!partsMetadata[fact.partId].material
      --> enriched Fact[] (superset of Phase 1's Fact)
      v
[5] CheckEngine.runAll(enrichedFacts, config)  (pure, unchanged contract)
      |
      +--> materialAuditCheck: filters weight-contributing facts missing material --> first-class Verdict/Result
      +--> r103Check: sum(massKg) over facts EXCLUDING BUMPER_/BATTERY_ prefixed names
      |                gated UNKNOWN if any excluded-set... no: if any INCLUDED-set fact.materialAssigned === false
      +--> r408Check: sum(massKg) over facts EXCLUDING BATTERY_ prefixed names (bumpers included)
      |                gated UNKNOWN if any of ITS included-set facts.materialAssigned === false
      v
[6] Verdict[] (extended shape, D-11) --> JSON response --> ReportTable.tsx (render only)
```

### Recommended Project Structure

```
src/server/
├── onshape-client/
│   └── client.ts              # ADD: getPartStudioMassProperties(), getPartsMetadata()
├── traversal/
│   ├── facts.ts                # EXTEND: Fact += massKg?: number, materialAssigned: boolean
│   └── flatten-assembly.ts     # EXTEND: also return/expose definition.parts[] grouping info
│                                #         (or a sibling helper, e.g. group-by-part-studio.ts)
├── checks/
│   ├── engine.ts                # EXTEND: Verdict -> tri-state status, optional measured, lb+kg, caveats
│   ├── material-audit.check.ts  # NEW: WGHT-01, first-class audit result
│   ├── robot-weight.check.ts    # NEW: WGHT-03 (R103), gated per D-09
│   └── robot-bumpers-weight.check.ts # NEW: WGHT-04 (R408), gated per D-09
└── routes/
    └── check.routes.ts          # EXTEND: buildEngine() registers 3 new checks;
                                  #         handler performs the mass/material fetch + merge (step 4 above)
```

### Pattern 1: Per-Part-Studio Mass Query, Joined by partId (not an assembly-scoped occurrence query)

**What:** Because no assembly-level mass-properties endpoint exists, fetch mass per distinct Part Studio element referenced by the assembly's `parts[]` list, then join the per-part results back onto occurrence-level `Fact`s using `partId`.

**When to use:** Any time R103/R408-style "total minus some occurrences" math is needed.

**Example (request shape, schema-confirmed):**
```typescript
// Source: src/server/onshape-client/types/onshape.d.ts, operations.getPartStudioMassProperties
// GET /api/partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/massproperties?partId=A&partId=B&massAsGroup=false
// Response: BTMassPropertiesBulkInfo { bodies: { [partId]: BTMassPropertiesInfo }, microversionId }
// BTMassPropertiesInfo: { mass?: number[], hasMass?: boolean, massMissingCount?: number, centroid?, inertia?, volume?, ... }
```
Note the `mass` field is typed `number[]` (not a scalar) in the generated schema — corroborated by forum/Java-client docs as "[nominal mass, +tolerance, -tolerance]" (a 3-element array). **Verify `mass[0]` is the correct nominal-value index against a live response before locking the implementation** — this is schema-typed but not live-response-confirmed in this research session.

### Pattern 2: Per-Verdict Gating Requires Per-Verdict Weight-Contributing Sets

**What:** R103's weight-contributing set is `all facts EXCLUDING BUMPER_/BATTERY_`; R408's is `all facts EXCLUDING BATTERY_ only`. D-09 requires each check to independently determine "does any fact IN MY OWN included set lack material" — not a single global audit gate shared by both verdicts.
**When to use:** Both weight checks, and the material-audit check itself (whose own "weight-contributing" set per D-07 is technically the union of both — audit surfaces every part relevant to *either* verdict, but each verdict's UNKNOWN gate only looks at its own subset).
**Example (pure-function pattern, matches existing `CheckFn` contract):**
```typescript
// Source: existing src/server/checks/frame-tag-presence.check.ts pattern, extended
export const robotWeightCheck: CheckFn = (facts, config) => {
  const entry = config.rules.find((r) => r.rule === "R103")!;
  const included = facts.filter(
    (f) => !f.name.startsWith("BUMPER_") && !f.name.startsWith("BATTERY_"),
  );
  const missingMaterial = included.filter((f) => !f.materialAssigned);
  if (missingMaterial.length > 0) {
    return {
      rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
      status: "UNKNOWN",
      measured: undefined,
      affectedPartCount: missingMaterial.length,
      affectedParts: missingMaterial.map((f) => ({ name: f.name, path: f.path })),
      caveats: [],
    };
  }
  const totalKg = included.reduce((sum, f) => sum + (f.massKg ?? 0), 0);
  // ... D-01/D-02 lb/kg dual conversion, D-06 caveats for missing BUMPER_/BATTERY_ tags ...
};
```

### Anti-Patterns to Avoid

- **Calling `getMassProperties` (single-part endpoint) once per part in a loop:** Works, but is O(N) HTTP calls for an assembly that may have 50-200+ parts. Use `getPartStudioMassProperties` with a repeated `partId` query param (or omit `partId` entirely to get all parts in that Part Studio in one call) grouped by distinct Part Studio element instead.
- **Treating "default material" as a substituted-density concept:** Per official Onshape docs, unmaterialized parts are *excluded* from mass entirely, not assigned a fallback density. Don't build detection logic that looks for a suspicious/placeholder density value — check for the *absence* of the `material` field instead.
- **Deriving Part-Studio groupings from `rootAssembly.instances`:** `BTAssemblyInstanceInfo` lacks a `partId` field. Use `BTAssemblyDefinitionInfo.parts[]` (a sibling array on the same response, already fetched) as the join source instead of trying to extend `flatten-assembly.ts`'s traversal of `instances`/`occurrences` to carry part-studio-linkage info it currently doesn't have.
- **Re-deriving lb from kg in the panel:** D-02 requires a single documented conversion point. Do it once when constructing the `Verdict` server-side; the panel should render pre-computed `measuredLb`/`measuredKg`, never recompute.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-part mass lookup | A custom geometry/density estimator | Onshape's `getPartStudioMassProperties` (uses the part's actual assigned material density from Onshape's material library) | Onshape already computes this correctly from CAD geometry + material density; re-deriving it would be redundant and error-prone, and would defeat the entire "trust Onshape's number" premise of the app. |
| Material-assignment detection | Scanning for suspicious/known "default" density values (e.g. density == 1000 kg/m^3) | Checking `BTPartMetadataInfo.material` field presence/absence | Onshape's own behavior is to omit unmaterialized parts from mass, not substitute a detectable placeholder density — a density-sniffing heuristic would be guessing at an API behavior that official docs explicitly rule out. |
| kg<->lb conversion | A hand-rolled conversion constant scattered across files | One conversion function/constant (e.g. `KG_TO_LB = 2.2046226218` or `2.20462`) at a single verdict-construction boundary | D-02 explicitly requires "a single documented conversion" — scattering the constant risks drift between display locations. |

**Key insight:** The temptation in this domain is to over-engineer around perceived API gaps (no assembly mass endpoint, no default-material flag) with custom geometry/heuristic code. In every case researched, the correct answer was "call one more existing, schema-confirmed Onshape endpoint and join in application code" — not building new computation.

## Common Pitfalls

### Pitfall 1: Treating "default material" and "missing material" as the same detectable signal

**What goes wrong:** The phase description hypothesizes Onshape "substitutes a default density and sets a flag" for materialless parts. Building detection logic around a default-density flag that doesn't exist will silently under-detect (or never trigger) the material audit.
**Why it happens:** Onshape's UI does have a generic "Default Material" library entry users can *explicitly* assign (a real material with a real density) — this is different from a part having *no* material assigned at all. It's easy to conflate "user picked the material named 'Default Material'" (an assigned material like any other, has a `material` object, contributes real mass) with "user assigned nothing" (`material` field absent, contributes ZERO mass, silently).
**How to avoid:** Detection rule is presence/absence of `BTPartMetadataInfo.material`, full stop — not name-matching against a material called "Default" and not density-value heuristics. If a part legitimately has the Onshape library's "Default Material" *assigned*, that's a normal assigned material, not a WGHT-01 audit hit.
**Warning signs:** If a live test document shows all parts passing the audit even though some were never touched by the user, check whether the test document happens to have every part explicitly assigned some material (even a generic one) — that's expected, correct behavior, not a bug in the check.

### Pitfall 2: Assuming per-part mass data is directly available from the assembly definition response

**What goes wrong:** Reading only `getAssemblyDefinition`'s `rootAssembly`/`subAssemblies`/`instances`/`occurrences` (what `flatten-assembly.ts` currently consumes) and expecting a mass or material field somewhere in there. None of those schemas (`BTAssemblyInstanceInfo`, `BTAssemblyOccurrenceInfo`) carry mass or material — only `BTAssemblyPartsInfo` (the separate `parts[]` array) carries the `documentId`/`elementId`/`partId` triple needed to go fetch mass/material from the owning Part Studio.
**Why it happens:** It's natural to assume the assembly-definition call is a "complete" per-part snapshot since it already returns a `parts[]` array — but that array is a lightweight index (ids + revision info), not mass/material data itself.
**How to avoid:** Plan a second and third network round: (assembly def) -> (group parts[] by element) -> (mass-properties + parts-metadata per distinct element). This is an inherent 3-step fetch chain, not a single call.
**Warning signs:** If the planner's task breakdown has "fetch mass" as a single task touching only `getAssemblyDefinition`, that's a sign this pitfall wasn't accounted for.

### Pitfall 3: Configuration-string mismatches between assembly context and Part Studio mass query

**What goes wrong:** `BTAssemblyPartsInfo.configuration` may differ from the Part Studio's default/root configuration if the assembly references a specific configured instance of that Part Studio. Calling `getPartStudioMassProperties` without passing that `configuration` string could return mass properties for the WRONG configured variant of the part.
**Why it happens:** Onshape configurations are easy to overlook when an assembly only ever references the default configuration (the common case for FRC teams that don't heavily use configurations) — the bug only surfaces for documents that do.
**How to avoid:** Always pass through `parts[i].configuration` (or `fullConfiguration`) as the `configuration` query param on both the mass-properties and parts-metadata calls, mirroring what `BTAssemblyPartsInfo` carries per part.
**Warning signs:** Mass totals that look plausible but are subtly wrong only on documents using Part Studio configurations — hard to catch without a configured test document.

### Pitfall 4: `mass` array vs scalar confusion

**What goes wrong:** `BTMassPropertiesInfo.mass` is typed as `number[]` in the generated schema (matches the pattern for `volume`, `inertia`, `principalInertia` — Onshape returns these as tolerance-bounded arrays: nominal + upper + lower). Code that does `fact.massKg = response.mass` (treating it as a plain number) will produce `NaN` or a type error at the sum step.
**Why it happens:** Most other Onshape numeric fields in this codebase so far (e.g., `transform: number[]` for a 16-element matrix) are also arrays but for a different reason (matrix flattening) — it's easy to assume `mass` follows a similar "just take the whole array" pattern rather than "take index 0."
**How to avoid:** Explicitly document `massKg = bodies[partId].mass?.[0] ?? 0` (nominal value, first element) when writing the enrichment step, and add a unit test asserting this against a fixture shaped like the real bulk-info schema.
**Warning signs:** Weight verdicts computing to obviously-wrong orders of magnitude, or `NaN` propagating into the sum.

## Code Examples

### Extending OnshapeClient with the two new methods (matches existing callWithRefresh pattern)

```typescript
// Source: pattern from existing src/server/onshape-client/client.ts getAssemblyDefinition
// (same file, same callWithRefresh wrapper, same OnshapeApiError-on-non-2xx convention)

async getPartStudioMassProperties(
  documentId: string, wvm: string, wvmid: string, elementId: string,
  partIds?: string[], configuration?: string,
): Promise<components["schemas"]["BTMassPropertiesBulkInfo"]> {
  return callWithRefresh(session, async () => {
    const client = buildFetchClient(session);
    const result = await client.GET(
      "/api/partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/massproperties",
      { params: {
          path: { did: documentId, wvm, wvmid, eid: elementId },
          query: { partId: partIds, configuration },
      }},
    );
    if (!result.data) {
      const status = (result as { response: Response }).response.status;
      throw new OnshapeApiError(status, "Failed to fetch part studio mass properties");
    }
    return result.data;
  }, refreshFn);
}

async getPartsMetadata(
  documentId: string, wvm: string, wvmid: string, elementId: string,
): Promise<components["schemas"]["BTPartMetadataInfo"][]> {
  return callWithRefresh(session, async () => {
    const client = buildFetchClient(session);
    const result = await client.GET(
      "/api/parts/d/{did}/{wvm}/{wvmid}/e/{eid}",
      { params: { path: { did: documentId, wvm, wvmid, eid: elementId } } },
    );
    if (!result.data) {
      const status = (result as { response: Response }).response.status;
      throw new OnshapeApiError(status, "Failed to fetch parts metadata");
    }
    return result.data;
  }, refreshFn);
}
```
Note: as with `getAssemblyDefinition` in the existing client, both of these operations declare only a `default` response (not an explicit `200`) in the OpenAPI spec — confirm at implementation time whether `openapi-fetch`'s typed `.GET()` narrows `data` usably or whether the same raw-`fetch()`-plus-cast pattern used for `getAssemblyDefinition` is needed instead.

### Extended Verdict shape (D-11)

```typescript
// Source: derived from CONTEXT.md D-11 requirements, extending existing engine.ts Verdict
export interface Verdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;              // D-03: corrected to "lb" for R103/R408
  status: "PASS" | "FAIL" | "UNKNOWN";
  measured?: { lb: number; kg: number };   // D-02/D-10: absent entirely when UNKNOWN
  affectedPartCount?: number;              // populated only when status === "UNKNOWN"
  affectedParts?: Array<{ name: string; path: string[] }>; // D-08
  caveats: string[];         // D-06, always present (possibly empty array)
}
```

## State of the Art

| Old Approach (hypothesized in phase description) | Actual Onshape Behavior (verified) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| "Default density substituted + flag set" for unmaterialized parts | Unmaterialized parts are excluded from mass calculation entirely (no substitute density) | N/A — this was a hypothesis correction, not a version change | Detection rule simplifies to material-field presence/absence rather than density-value sniffing (Pitfall 1) |
| Assembly-scoped, occurrence-filterable mass-properties endpoint assumed to exist | No such endpoint exists; only part-level and part-studio-level mass endpoints | N/A — API has been this shape; not a recent deprecation | Occurrence filtering must happen in application code post-fetch, joined via `partId` (Architecture Pattern 1) |

**Deprecated/outdated:** None identified — the mass-properties/parts-metadata API surface researched here shows no deprecation notices in the current OpenAPI spec (mirrored in the committed `onshape.d.ts`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `BTMassPropertiesInfo.mass[0]` is the nominal mass value (index 0 of a 3-element [nominal, +tol, -tol] array) | Pattern 1, Pitfall 4 | If wrong index/shape, weight verdicts silently compute wrong numbers (possibly by a small tolerance-band amount, not catastrophically wrong, but still incorrect) — must verify against a live document response before trusting in production. |
| A2 | Onshape REST API JSON numeric values are always SI (meters, kilograms) regardless of document display-unit settings | Summary, D-02 corroboration | If a document's workspace units affect raw JSON values (not just FeatureScript's internal representation), the kg-canonical assumption (D-02) could be wrong and would require a unit-conversion step keyed to the document's unit settings rather than a fixed SI assumption. MEDIUM confidence — corroborated by FeatureScript SI convention and general community consensus, but not by a directly-fetched official spec statement pinning REST JSON (as opposed to FeatureScript) to SI. |
| A3 | `getPartStudioMassProperties` called without a `partId` filter returns ALL parts in that Part Studio in one call (rather than requiring explicit enumeration) | Architecture Pattern 1 / Anti-Patterns | If wrong, the "one call per Part Studio" efficiency claim is inaccurate and the planner may need to pass explicit `partId` arrays derived from `parts[]` regardless — this doesn't break correctness, only the "avoid enumerating partId" simplification. |
| A4 | The Onshape forum content describing `hasMass`/`massMissingCount` semantics (fetched via WebSearch snippet, not directly loaded due to SSO-gated forum pages) accurately reflects current API behavior | Summary, Pitfall 1 | These forum threads are community/staff answers, not the OpenAPI spec text itself; if Onshape has changed this behavior since those threads were posted, the detection rule could be stale. Schema field names (`hasMass`, `massMissingCount`) ARE independently confirmed via the committed generated types, which raises confidence, but their *semantic meaning* rests on the forum/help-doc text, not the spec's (sparse) inline descriptions. |

## Open Questions

1. **Exact live JSON shape of `getPartStudioMassProperties` and `getPartsWMVE` responses** *(RESOLVED via 02-01 checkpoint — see 02-MASS-PROPERTIES-CONTRACT.md. `mass[0]` nominal + `hasMass`/`massMissingCount` semantics confirmed live. CORRECTION: a no-`partId` call returns a single `-all-` AGGREGATE body, not per-part entries — pass explicit partIds.)*
   - What we know: Full TypeScript schema (field names, optionality, array types) confirmed via the committed `onshape.d.ts` generated types.
   - What's unclear: Real numeric ranges/precision, whether `hasMass`/`massMissingCount` are populated the way forum posts describe on a genuinely unmaterialized part, and confirmation of the `mass[0]` nominal-value index.
   - Recommendation: First planning/execution task should be a `checkpoint:human-verify` or scripted spike hitting both endpoints against a real (or throwaway test) Onshape document containing at least one part with no material assigned, before writing the merge-step production code.

2. **Onshape's REST API unit convention for mass in the raw JSON (SI-fixed vs. document-unit-dependent)** *(RESOLVED via 02-01 checkpoint — see 02-MASS-PROPERTIES-CONTRACT.md. SI kg confirmed: a real aluminum part read 2.90 kg (≈6.4 lb), and `volume` came back in m³.)*
   - What we know: FeatureScript's internal representation is described as SI by community sources; general community consensus is the REST API returns SI regardless of document display units.
   - What's unclear: No official spec text was directly located (during this session) stating explicitly "mass-properties REST responses are always kg regardless of document unit settings."
   - Recommendation: Treat as MEDIUM confidence per A2 above; the live-document verification spike (Open Question 1) should also sanity-check the returned mass value against the document's known real-world weight in kg to confirm no unit surprises.

3. **Whether `parts[]` reliably enumerates every part reachable through nested subassemblies, including patterned/mirrored instances** *(RESOLVED via 02-01 checkpoint — see 02-MASS-PROPERTIES-CONTRACT.md. `parts[]` is a flat, per-unique-part deduplicated list carrying partId + documentId + elementId + configuration (+documentVersion/microversion/isStandardContent); many occurrences → one entry via shared partId. NEW LIMITATION: referenced (other-owner) documents can 403 even version-addressed — see contract F3.)*
   - What we know: `BTAssemblyDefinitionInfo.parts` is documented as a flat list on the same response as `rootAssembly`/`subAssemblies`.
   - What's unclear: Whether flattened/patterned occurrences (which `flatten-assembly.ts`'s existing traversal already handles for `Fact.path`) map 1:1 to entries in `parts[]`, or whether `parts[]` is deduplicated by underlying part-studio-part (i.e., one entry per unique CAD part, not one per occurrence) — which is actually expected and fine for mass-per-partId lookup, but should be explicitly confirmed so the merge step doesn't assume a 1:1 occurrence:parts[] cardinality.
   - Recommendation: Confirm during the same live-document spike; if `parts[]` is deduplicated (likely, since mass is a property of the underlying part, not the occurrence), the merge step correctly maps MANY occurrences (`Fact`s) to ONE `parts[]`/mass entry via shared `partId` — this is actually the expected, simpler case, not a problem, but worth confirming explicitly rather than assuming.

## Environment Availability

No new external tool/service dependencies — this phase only adds new calls against the already-integrated Onshape REST API using the already-configured OAuth session and already-generated types. No environment audit needed beyond what Phase 1 already established (network reachability to `cad.onshape.com`, valid OAuth app registration).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (new code) | Already satisfied by Phase 1's OAuth/session layer; this phase adds no new auth surface. |
| V3 Session Management | No (new code) | Same — reuses existing `req.session.accessToken` check and `callWithRefresh`, no new session logic. |
| V4 Access Control | Yes | New Onshape API calls (mass-properties, parts-metadata) must go through the same server-side, session-scoped `callWithRefresh` client as existing calls — never accept a client-supplied access token or bypass the session check already enforced at the top of `check.routes.ts`. |
| V5 Input Validation | Yes | Any new request parameters this phase introduces (if the route is extended to accept e.g. a season override) must be `zod`-validated the same way `CheckRequestSchema` already validates `documentId`/`workspaceId`. If no new client-supplied inputs are introduced (likely — mass/material fetching is server-derived from the already-validated `documentId`/`workspaceId`/`elementId`), this is a non-issue; confirm no new unvalidated request fields are added. |
| V6 Cryptography | No | No new crypto surface. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Trusting a client-supplied part/element id to scope the mass-properties fetch (mirrors Phase 1's T-01-11 threat for elementId) | Tampering | Continue Phase 1's established pattern: derive the Part Studio element ids and part ids server-side from the already-server-derived `getAssemblyDefinition` response (`parts[]`), never from any client-supplied value. No client input should ever reach the new mass-properties/parts-metadata calls' path parameters directly. |
| Overly chatty per-part API calls creating a denial-of-service or rate-limit exhaustion vector against the user's own Onshape account | Denial of Service | Use the bulk `getPartStudioMassProperties`/`getPartsWMVE` calls (grouped per Part Studio element) rather than N-per-part calls, both for correctness of the "occurrence-filtered query" requirement and to avoid unnecessary API load — see Anti-Patterns above. No specific documented Onshape rate-limit number was found in this research session; treat call-minimization as good practice regardless. |

## Sources

### Primary (HIGH confidence)
- `src/server/onshape-client/types/onshape.d.ts` (committed, generated from live Onshape OpenAPI spec via `openapi-typescript`) — confirmed operation shapes for `getMassProperties`, `getPartStudioMassProperties`, `getPartsWMVE`, `getPartMetadata`, `getAssemblyDefinition`, `getAssemblyBoundingBoxes`; confirmed schemas `BTMassPropertiesBulkInfo`, `BTMassPropertiesInfo-null`, `BTPartMetadataInfo`, `BTPartMaterialInfo`, `BTAssemblyDefinitionInfo`, `BTAssemblyPartsInfo`, `BTAssemblyInstanceInfo`, `BTAssemblyOccurrenceInfo`.
- [Onshape Help — Mass Properties Tool](https://cad.onshape.com/help/Content/View/mass_properties_tool.htm) — official doc confirming unmaterialized parts are excluded from mass calculation, not defaulted.
- Existing repo code: `src/server/checks/engine.ts`, `src/server/traversal/facts.ts`, `src/server/traversal/flatten-assembly.ts`, `src/server/routes/check.routes.ts`, `src/server/onshape-client/client.ts`, `rules/2026.json`, `src/server/config/schema.ts` — read directly for the existing contracts this phase extends.
- `npm view openapi-fetch/openapi-typescript/zod version` — confirmed installed versions match `package.json` exactly (0.17.0 / 7.13.0 / 4.4.3), 2026-07-02.

### Secondary (MEDIUM confidence)
- WebSearch aggregation of Onshape forum threads (`api-partstudio-mass-properties`, `default-material-properties`) — corroborates `hasMass`/`massMissingCount` field semantics and "no material assigned -> excluded from calc" behavior; underlying forum pages themselves are SSO-gated and could not be directly loaded in this session (see Assumption A4).
- WebSearch on Onshape REST API unit conventions — general community consensus that raw API JSON is SI (kg/m) regardless of document display units; no single authoritative spec statement was directly located pinning this for mass-properties specifically (see Assumption A2).

### Tertiary (LOW confidence)
- None flagged as LOW-confidence-only; all findings above were cross-verified by at least the generated-schema source plus one external corroborating source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all extensions of already-installed, already-schema-confirmed tooling.
- Architecture (mass/material fetch + join pattern): HIGH for the *shape* (schema-confirmed via committed generated types), MEDIUM for exact live-response semantics (mass array indexing, hasMass/massMissingCount real-world values) — flagged for live-document verification.
- Pitfalls: MEDIUM-HIGH — the "no default density, exclusion instead" finding is corroborated by an official Onshape help-doc fetch (not just forum/WebSearch aggregation), which is the strongest source obtained this session.

**Research date:** 2026-07-02
**Valid until:** ~30 days (Onshape's REST API surface is stable/slow-moving; the generated types file itself should be periodically regenerated per `CLAUDE.md`'s version-compatibility notes, independent of this research's validity window).

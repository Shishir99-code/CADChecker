# Phase 3: Frame Perimeter & Height - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/onshape-client/client.ts` (extend: `getBoundingBoxes`, `getAssemblyBoundingBoxes`) | service (API client method) | request-response | same file — `getAssemblyDefinition`/`getPartStudioMassProperties` methods (lines 135-196) | exact |
| `src/server/traversal/facts.ts` (extend `Fact`) | model | transform | same file — existing `massKg?`/`materialAssigned?` fields (lines 12-28) | exact |
| `src/server/checks/frame-perimeter.check.ts` (new) | service (pure CheckFn) | transform (CRUD-like: read facts, compute, return) | `src/server/checks/robot-weight.check.ts` | exact (gated-UNKNOWN pure CheckFn pattern) |
| `src/server/checks/starting-height.check.ts` (new) | service (pure CheckFn) | transform | `src/server/checks/frame-tag-presence.check.ts` (simple measuredCount shape) + `robot-weight.check.ts` (gating) | role-match |
| `src/server/geometry/transform-point.ts` (new) | utility | transform | none (genuinely new pure-math module; no existing geometry utility) | no analog |
| `src/server/geometry/convex-hull.ts` (new) | utility | transform | none (wraps new `d3-polygon` dep; no existing geometry utility) | no analog |
| `src/server/routes/check.routes.ts` (extend: 5c enrichment block + 2 registrations) | route (enrichment + engine wiring) | request-response, event-driven (per-group fetch loop) | same file — existing 5b mass/material enrichment block (lines 97-186) | exact |
| `src/panel/components/HullRender.tsx` (new) | component | transform (pure render of server data) | `src/panel/components/ReportTable.tsx` | role-match |
| `src/panel/api.ts` (extend `CheckReportVerdict`) | model/types | request-response | same file — existing `CheckReportVerdict` interface (lines 28-39) | exact |
| `scripts/spike-bounding-boxes.ts` (new, throwaway) | utility (spike script) | request-response | `scripts/spike-mass-properties.ts` | exact |

## Pattern Assignments

### `src/server/onshape-client/client.ts` (service, request-response)

**Analog:** same file, `getAssemblyDefinition` and `getPartStudioMassProperties` methods

**Pattern — raw-fetch-then-cast idiom** (lines 135-163, `getAssemblyDefinition`):
```typescript
async getAssemblyDefinition(documentId, wvm, wvmid, elementId) {
  return callWithRefresh(
    session,
    async () => {
      // getAssemblyDefinition's OpenAPI spec declares only a `default`
      // response (not an explicit 200) ... call fetch directly and cast
      // through the generated schema type instead.
      const url = new URL(
        `/api/assemblies/d/${documentId}/${wvm}/${wvmid}/e/${elementId}`,
        ONSHAPE_API_BASE_URL,
      );
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.accessToken ?? ""}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new OnshapeApiError(res.status, "Failed to fetch assembly definition");
      }
      return (await res.json()) as AssemblyDefinitionResponse;
    },
    refreshFn,
  );
},
```

**Apply to both new methods identically** — RESEARCH confirms both `getBoundingBoxes` (per-part) and `getAssemblyBoundingBoxes` (assembly-level) declare only a `default` response in the OpenAPI spec (same as `getAssemblyDefinition`/`getPartStudioMassProperties`), so use the SAME raw-`fetch`-then-cast pattern, not `client.GET()`. Add corresponding `export type BoundingBoxResponse = components["schemas"]["BTBoundingBoxInfo"];` near the top type-alias block (line 8-11), and extend the `OnshapeClient` interface (lines 82-104) with two new method signatures mirroring `getPartStudioMassProperties`'s parameter shape (`documentId, wvm, wvmid, elementId, partId?, configuration?`).

URL paths per RESEARCH: `/api/parts/d/{did}/{wvm}/{wvmid}/e/{eid}/partid/{partid}/boundingboxes` and `/api/assemblies/d/{did}/{wvm}/{wvmid}/e/{eid}/boundingboxes`.

---

### `src/server/traversal/facts.ts` (model, transform)

**Analog:** same file, existing optional-field doc-comment convention

**Pattern** (lines 12-28):
```typescript
/**
 * Nominal mass in kg (02-MASS-PROPERTIES-CONTRACT.md rule 1: index 0 of the
 * 3-element [nominal, -tol, +tol] mass array). `undefined` means UNRESOLVED
 * -- the part was unmaterialized (omitted from `bodies`, contract F1) or
 * lived in a document/group the token could not read (contract F3). NEVER
 * treat `undefined` as `0`.
 */
massKg?: number;
```

**Apply:** add `bboxCornersWorld?: Array<[number, number, number]>` (8 world-space corners, `FRAME_` parts only) and `robotMaxZWorld?: number` (whole-robot max Z, copied onto every Fact) using the identical doc-comment convention — explicitly state "undefined means UNRESOLVED, never a substituted 0/zero-size footprint," mirroring the `massKg`/`materialAssigned` wording exactly (per RESEARCH Pitfall 4).

---

### `src/server/checks/frame-perimeter.check.ts` (service, pure CheckFn)

**Analog:** `src/server/checks/robot-weight.check.ts`

**Imports pattern** (lines 1-3):
```typescript
import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator, KG_TO_LB } from "./engine.ts";
```
(swap `KG_TO_LB` for the new `M_TO_IN` constant, and import `polygonHull`/`polygonLength` from `d3-polygon`)

**Core gated-UNKNOWN pattern** (lines 25-56, `robotWeightCheck`):
```typescript
export const robotWeightCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R103");
  if (!entry) {
    throw new Error("robotWeightCheck requires an R103 entry in the season config");
  }

  const included = facts.filter(/* prefix filter */);
  const caveats: string[] = [];
  // ... presence-caveats ...

  const untrusted = included.filter((f) => f.materialAssigned === false || f.massKg === undefined);

  if (untrusted.length > 0) {
    return {
      rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
      status: "UNKNOWN",
      affectedPartCount: untrusted.length,
      affectedParts: untrusted.map((f) => ({ name: f.name, path: f.path })),
      caveats,
    };
  }

  const totalKg = included.reduce((sum, f) => sum + (f.massKg as number), 0);
  // ...
  return { rule, title, limit, unit, status: passesOperator(entry, totalLb) ? "PASS" : "FAIL", measured: {...}, caveats };
};
```

**Apply directly to `frame-perimeter.check.ts`:**
1. Filter `frameFacts = facts.filter(f => f.name.startsWith("FRAME_"))`.
2. SC4 empty-state short-circuit (before any hull math, per RESEARCH Pitfall 8): `if (frameFacts.length === 0) return { ...UNKNOWN, caveats: ["not yet checkable — no frame parts tagged"] }`.
3. Gate on `bboxCornersWorld === undefined` exactly like `untrusted.length > 0` above (RESEARCH Pitfall 4 — never silently shrink the hull).
4. Compute hull via `polygonHull()`, handle `null` (RESEARCH Pitfall 7) as a distinct UNKNOWN branch ("insufficient frame geometry to compute a hull").
5. Convert `polygonLength(hull)` meters → inches via a new `M_TO_IN = 39.37007874` constant (mirrors `KG_TO_LB`'s placement/doc-comment in `engine.ts` lines 34-38) — add to `engine.ts` alongside `KG_TO_LB`.
6. Return `measuredCount` for the inches figure (reuses existing `ReportTable.tsx` `renderMeasured()` path — no Verdict schema change needed for the number itself) plus a NEW `geometry` field on `Verdict` for the hull vertices (see engine.ts extension below).
7. Always attach the three D-02/D-04/D-06 caveats (bbox overestimate, +Z assumption, default-config disclosure) — same array-literal style as `robotWeightCheck`'s bumper/battery caveats.

---

### `src/server/checks/starting-height.check.ts` (service, pure CheckFn)

**Analog:** `src/server/checks/frame-tag-presence.check.ts` (simple shape) + `robot-weight.check.ts` (gating discipline)

**Simple measuredCount pattern** (frame-tag-presence.check.ts, lines 12-29):
```typescript
export const frameTagPresenceCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules[1];
  if (!entry) { throw new Error(...); }
  const measured = facts.filter((f) => f.name.startsWith(FRAME_PREFIX)).length;
  return {
    rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
    status: passesOperator(entry, measured) ? "PASS" : "FAIL",
    measuredCount: measured,
    caveats: [],
  };
};
```

**Apply:** `startingHeightCheck` looks up `config.rules.find(r => r.rule === "R104")`, gates UNKNOWN if `facts.every(f => f.robotMaxZWorld === undefined)` (mirror `robot-weight.check.ts`'s `untrusted.length > 0` gate, adapted to a whole-robot scalar rather than a per-part filter), converts `robotMaxZWorld` meters→inches via `M_TO_IN`, and returns `measuredCount` + `passesOperator(entry, heightInches)`. Always attach the D-04 (+Z assumption) and D-06 (default-config disclosure) caveats.

---

### `src/server/geometry/transform-point.ts` and `convex-hull.ts` (utility, transform)

**No direct analog** — first pure-geometry utility modules in the codebase. Follow the general project conventions observed elsewhere (explicit typed function signatures, no classes, doc-comment citing the source of the formula/algorithm — same documentation discipline as `engine.ts`'s `KG_TO_LB` and `passesOperator`). Use RESEARCH's supplied code directly:

```typescript
// transform-point.ts — Source: forum.onshape.com/discussion/19505 (row-major,
// translation in column 3 of each row). VERIFY against spike-bounding-boxes.ts
// before trusting in production (RESEARCH Assumption A3).
export function transformPoint(m: number[], [x, y, z]: [number, number, number]): [number, number, number] {
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ];
}
```

```typescript
// convex-hull.ts — thin wrapper over d3-polygon, keeps floor-projection +
// unit-conversion boundary in one pure, independently unit-testable module.
import { polygonHull, polygonLength } from "d3-polygon";
```

Both modules should have a sibling `*.test.ts` following the existing `engine.test.ts` / `material-audit.check.test.ts` vitest convention (pure, network-free, deterministic — the highest-value test target per CLAUDE.md).

---

### `src/server/routes/check.routes.ts` (route, request-response + event-driven per-group fetch)

**Analog:** same file, the existing 5b mass/material enrichment block

**Per-group fetch/merge/error-discipline pattern** (lines 97-186):
```typescript
for (const parts of groups.values()) {
  const first = parts[0];
  if (!first) continue;
  const { elementId: groupElementId, configuration } = first;
  const groupDocumentId = first.documentId;
  const partIds = parts.map((p) => p.partId);

  let wvm: string; let wvmid: string;
  if (groupDocumentId === assemblyDocumentId) { wvm = "w"; wvmid = workspaceId; }
  else if (first.documentVersion) { wvm = "v"; wvmid = first.documentVersion; }
  else if (first.documentMicroversion) { wvm = "m"; wvmid = first.documentMicroversion; }
  else { continue; }

  try {
    const [massInfo, metadata] = await Promise.all([
      client.getPartStudioMassProperties(groupDocumentId, wvm, wvmid, groupElementId, partIds, configuration),
      client.getPartsMetadata(groupDocumentId, wvm, wvmid, groupElementId),
    ]);
    // ... merge onto Map<partId, value>, undefined never coerced ...
  } catch (err) {
    if (err instanceof ReconnectRequiredError) { throw err; }
    if (err instanceof OnshapeApiError && err.status === 401) { throw err; }
    continue; // 403 etc — leave this group's parts UNRESOLVED
  }
}

const enrichedFacts = facts.map((f) => ({
  ...f,
  massKg: massByPartId.get(f.partId),
  materialAssigned: materialByPartId.get(f.partId),
}));
```

**Apply as a NEW "5c" block directly below 5b, before "(6) Config + engine":**
1. Build `frameFactsById` filtered to `FRAME_`-prefixed facts (RESEARCH Pattern 1).
2. Reuse the SAME `groups` map (from `groupPartsByElement`) and the SAME wvm/wvmid derivation `if/else if/else` chain verbatim — do not re-derive.
3. Inside each group's try block, additionally fetch `client.getBoundingBoxes(...)` per `FRAME_` partId in that group via `Promise.all`, apply `transformPoint(fact.transform, corner)` to each of the 8 corners, and set on a `bboxByPartId` Map — SAME catch/rethrow/continue discipline (401 and `ReconnectRequiredError` rethrown, everything else swallowed).
4. Add ONE separate top-level try/catch (outside the per-group loop) for the single `client.getAssemblyBoundingBoxes(...)` call (RESEARCH Pattern 2) — on success set `robotMaxZWorld` on every fact; on failure leave it `undefined` (no rethrow needed here since it's a single call, not per-group — but still rethrow 401/`ReconnectRequiredError` for consistency).
5. Extend `enrichedFacts` mapping (line 182-186) with `bboxCornersWorld: bboxByPartId.get(f.partId)` and `robotMaxZWorld`.
6. Register the two new checks in `buildEngine()` (lines 32-40) alongside the existing five: `engine.register(framePerimeterCheck); engine.register(startingHeightCheck);` and add the corresponding imports at the top (lines 8-12 pattern).

---

### `src/panel/components/HullRender.tsx` (component, transform/pure-render)

**Analog:** `src/panel/components/ReportTable.tsx`

**Pure-render-of-server-data pattern** (whole file, esp. lines 1-27):
```typescript
import type { CheckReportVerdict } from "../api.ts";

export interface ReportTableProps {
  verdicts: CheckReportVerdict[];
}

function renderMeasured(verdict: CheckReportVerdict): string {
  if (verdict.status === "UNKNOWN") { return `UNKNOWN — ...`; }
  if (verdict.measured) { return `...`; }
  if (verdict.measuredCount !== undefined) { return `${verdict.measuredCount} ${verdict.unit}`; }
  return "";
}
```

**Apply:** `HullRender` takes `{ geometry: CheckReportVerdict["geometry"] }` (or the whole perimeter verdict) as props, renders an inline `<svg>` mapping `geometry.hullVertices` to a `<polygon points="...">` string — no `dangerouslySetInnerHTML`, same "server-controlled data, safe by construction" comment style (ReportTable.tsx lines 33-38). Apply RESEARCH Pitfall 6 (negate/offset Y at the SVG-mapping boundary, documented inline) as its own small pure helper function, same "kept unstyled, inline-style idiom, no CSS framework" convention as `ReportTable.tsx`'s badge styling (lines 58-69). Render as a sibling component next to `ReportTable` in the panel's top-level view (wherever `ReportTable` is currently mounted).

---

### `src/panel/api.ts` (model/types, request-response)

**Analog:** same file, existing `CheckReportVerdict` interface

**Pattern** (lines 28-39):
```typescript
export interface CheckReportVerdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  measured?: { lb: number; kg: number };
  measuredCount?: number;
  affectedPartCount?: number;
  affectedParts?: Array<{ name: string; path: string[] }>;
  caveats: string[];
}
```

**Apply:** add `geometry?: { hullVertices: Array<[number, number]>; framePartFootprints?: Array<[number, number]>[] }` as a new optional field, keeping the doc-comment convention at the top of the file ("Mirrors src/server/checks/engine.ts's Verdict shape... panel renders whatever JSON the backend returns and duplicates no business logic client-side," lines 22-27) — this new field must mirror the SAME field added to `Verdict` in `engine.ts` exactly, field-for-field, same as every other field in this interface already does.

---

### `scripts/spike-bounding-boxes.ts` (utility, spike script)

**Analog:** `scripts/spike-mass-properties.ts`

**Pattern** (lines 1-80, full header + `main()` setup):
```typescript
/**
 * THROWAWAY SPIKE — Phase 0X Plan 0Y, Task Z (checkpoint:human-verify).
 * DELETE THIS FILE after ... is confirmed. It lives under scripts/ (NOT src/)
 * intentionally: it is not part of the server build (tsconfig.server.json
 * includes only src/server) and never ships.
 *
 * Purpose: drive [the new client methods] against a REAL Onshape document so
 * a human can confirm the live-unverified assumptions ...
 */
import "dotenv/config";
import { createOnshapeClient, type OnshapeClientEnv } from "../src/server/onshape-client/client.ts";
import type { RefreshableSession } from "../src/server/auth/refresh.ts";

function requireEnv(name: string): string { /* ... */ }

async function main(): Promise<void> {
  const accessToken = requireEnv("ONSHAPE_ACCESS_TOKEN");
  const documentId = requireEnv("SPIKE_DOCUMENT_ID");
  const workspaceId = requireEnv("SPIKE_WORKSPACE_ID");
  // ... session object, client factory reuse ...
}
```

**Apply directly, renaming env-var prefixes as needed** (e.g. keep `SPIKE_DOCUMENT_ID`/`SPIKE_WORKSPACE_ID`, add `SPIKE_ELEMENT_ID`/`SPIKE_FRAME_PART_ID` if needed to target a specific `FRAME_` part). Purpose section should reference RESEARCH's Open Questions 1/2 and Assumptions A1/A2/A3 (bounding-box coordinate frame, transform layout) exactly as the Phase-2 spike references its own contract questions. Run instructions (lines 24-44) copy verbatim with updated script filename.

## Shared Patterns

### Enrichment-in-route (fetch geometry server-side, keep checks pure)
**Source:** `src/server/routes/check.routes.ts` lines 97-186 (5b block)
**Apply to:** `check.routes.ts`'s new 5c block, both new `CheckFn`s
Fetch happens once in the route; checks (`frame-perimeter.check.ts`, `starting-height.check.ts`) only ever read `Fact[]` synchronously — never call the client, never `await`.

### UNRESOLVED-never-becomes-a-default gating
**Source:** `src/server/checks/robot-weight.check.ts` lines 43-56 (`untrusted.length > 0` branch)
**Apply to:** both new checks — `bboxCornersWorld === undefined` / `robotMaxZWorld === undefined` must gate to UNKNOWN with an affected-parts/caveat explanation, never silently drop a point or treat a missing corner as `[0,0,0]`.

### callWithRefresh / 401 / ReconnectRequiredError discipline
**Source:** `src/server/onshape-client/client.ts` (every method) + `check.routes.ts` lines 164-175
**Apply to:** the two new client methods (automatic via `callWithRefresh` wrapper) and the new 5c per-group/assembly-level try/catch blocks (401 and `ReconnectRequiredError` always rethrown, everything else swallowed per-group).

### Config-driven rule citation (never hardcode limits)
**Source:** `src/server/checks/robot-weight.check.ts` line 26 (`config.rules.find((r) => r.rule === "R103")`)
**Apply to:** `frame-perimeter.check.ts` (`R101`) and `starting-height.check.ts` (`R104`) — both already exist as entries in `rules/2026.json` per CONTEXT.md/RESEARCH, no schema migration needed (RESEARCH Pitfall 5).

### Panel duplicates no business logic
**Source:** `src/panel/api.ts` lines 22-27 doc comment; `ReportTable.tsx` renders only server-supplied fields
**Apply to:** `HullRender.tsx` — must be a pure renderer of `geometry.hullVertices`/`framePartFootprints`; no client-side hull/transform recomputation.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/server/geometry/transform-point.ts` | utility | transform | First pure-geometry math module in the codebase; use RESEARCH's supplied code directly (see Pattern Assignments above), follow general doc-comment/typing conventions from `engine.ts`. |
| `src/server/geometry/convex-hull.ts` | utility | transform | Same — first wrapper around a new dependency (`d3-polygon`); no existing analog, use RESEARCH Pattern 3 code directly. |

## Metadata

**Analog search scope:** `src/server/`, `src/panel/`, `scripts/` (entire repo — small codebase, exhaustive read)
**Files scanned:** `engine.ts`, `engine.test.ts`, `facts.ts`, `client.ts`, `check.routes.ts`, `robot-weight.check.ts`, `robot-bumpers-weight.check.ts`, `material-audit.check.ts`, `frame-tag-presence.check.ts`, `occurrence-count.check.ts`, `ReportTable.tsx`, `api.ts`, `spike-mass-properties.ts`
**Pattern extraction date:** 2026-07-09

# Phase 2: Trustworthy Weight - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 8 (5 new, 5 extended — `facts.ts`, `flatten-assembly.ts`, `client.ts`, `engine.ts` extended AND new material-audit/weight check files created)
**Analogs found:** 8 / 8 — every file has a strong same-repo, Phase-1-established analog (this phase is purely additive over Phase 1's contract).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/server/traversal/facts.ts` (extend) | model | transform | itself (Phase 1) | exact — additive field extension of an existing interface |
| `src/server/traversal/flatten-assembly.ts` (extend) | transform/utility | transform | itself (Phase 1) | exact — same file, add a `parts[]`-grouping export alongside existing `flattenAssembly()` |
| `src/server/onshape-client/client.ts` (extend: 2 new methods) | service | request-response | `getAssemblyDefinition` method in the same file | exact — same client, same `callWithRefresh` wrapper, same raw-fetch-then-cast idiom for `default`-only-response operations |
| `src/server/checks/engine.ts` (extend `Verdict`) | model/service | transform | itself (Phase 1) | exact — additive/breaking type extension of an existing interface + comparator reused as-is |
| `src/server/checks/material-audit.check.ts` (new) | service (pure check) | transform | `src/server/checks/frame-tag-presence.check.ts` | exact — same `CheckFn` shape, same name-prefix-filter idiom, extended to emit a list instead of a count |
| `src/server/checks/robot-weight.check.ts` (R103, new) | service (pure check) | transform | `src/server/checks/occurrence-count.check.ts` + `frame-tag-presence.check.ts` | exact — same `CheckFn` shape, sum instead of count/filter-length |
| `src/server/checks/robot-bumpers-weight.check.ts` (R408, new) | service (pure check) | transform | `robot-weight.check.ts` (sibling, once written) else `frame-tag-presence.check.ts` | exact — near-duplicate of R103 with a narrower exclusion set |
| `src/server/routes/check.routes.ts` (extend `buildEngine()` + handler) | controller/route | request-response | itself (Phase 1) | exact — same file, add 2 more client calls + a merge step before `engine.runAll` |
| `rules/2026.json` (edit) | config | transform | itself (Phase 1) | exact — same file, fix `unit` field only |
| `src/panel/components/ReportTable.tsx` (extend) | component | request-response (render) | itself (Phase 1) | exact — same file, same JSX-table idiom, add tri-state status branch |
| `src/panel/api.ts` (extend `CheckReportVerdict`) | model/utility (client-side types) | transform | itself (Phase 1) | exact — mirrors backend `Verdict` shape 1:1, per its own doc comment |

## Pattern Assignments

### `src/server/traversal/facts.ts` (model, transform)

**Analog:** itself — Phase 1's `Fact` interface (full file, 13 lines, already read in full above).

**Current shape to extend** (all lines):
```typescript
export interface Fact {
  partId: string;
  name: string;
  transform: number[];
  path: string[];
}
```

**Pattern to follow:** Add fields additively, keep the doc comment's "single shared shape" framing intact, and name fields per RESEARCH's explicit recommendation (avoid "materialIsDefault" — Onshape omits, doesn't substitute):
```typescript
export interface Fact {
  partId: string;
  name: string;
  transform: number[];
  path: string[];
  /** Nominal mass in kg (RESEARCH Pitfall 4: index 0 of the 3-element
   *  [nominal, +tol, -tol] mass array), undefined if not yet enriched. */
  massKg?: number;
  /** true when BTPartMetadataInfo.material is present for this part;
   *  false = no material assigned (RESEARCH Pitfall 1: absence, not a
   *  substituted default density, is the correct signal). */
  materialAssigned?: boolean;
}
```
Keep new fields optional (`?`) so any pre-enrichment `Fact[]` (if ever produced without mass/material merge) remains structurally valid — mirrors how `flattenAssembly()` alone still produces valid Facts today.

---

### `src/server/traversal/flatten-assembly.ts` (transform/utility, transform)

**Analog:** itself — Phase 1's `flattenAssembly()` + local `AssemblyDefinition` structural types (full file, 75 lines, already read above).

**Local-minimal-types pattern** (lines 9-35): this file deliberately declares its own minimal structural interfaces rather than importing the generated `onshape.d.ts` types, to stay network-free and dependency-free. Follow the same idiom when adding `parts[]`:
```typescript
// ADD alongside existing InstanceInfo/OccurrenceInfo/RootAssemblyInfo:
interface AssemblyPartInfo {
  documentId: string;
  elementId: string;
  partId: string;
  configuration?: string;
}

export interface AssemblyDefinition {
  rootAssembly: RootAssemblyInfo;
  subAssemblies?: SubAssemblyInfo[];
  parts?: AssemblyPartInfo[]; // ADD — RESEARCH: only source of documentId+elementId+partId together
}
```

**Grouping helper pattern:** Follow the existing `buildInstanceMap()` idiom (lines 40-53: builds a `Map` keyed by id, exported implicitly via the main function) — add a sibling pure function, NOT a method on `flattenAssembly()` itself, keeping single-responsibility:
```typescript
/** Groups AssemblyDefinition.parts[] by owning Part Studio element, for the
 *  route's mass/material enrichment step (RESEARCH Architecture Pattern 1). */
export function groupPartsByElement(
  def: AssemblyDefinition,
): Map<string, AssemblyPartInfo[]> {
  const byElement = new Map<string, AssemblyPartInfo[]>();
  for (const part of def.parts ?? []) {
    const key = `${part.documentId}:${part.elementId}`;
    const list = byElement.get(key) ?? [];
    list.push(part);
    byElement.set(key, list);
  }
  return byElement;
}
```
Keep this function pure and network-free, matching `flattenAssembly()`'s existing constraint (no client import in this file).

---

### `src/server/onshape-client/client.ts` (service, request-response)

**Analog:** `getAssemblyDefinition` in the same file (lines 119-147, already read above) — chosen over `getElementsInDocument` because both new endpoints, like `getAssemblyDefinition`, declare only a `default` response in the OpenAPI spec per RESEARCH (line 300), requiring the same raw-`fetch()`-plus-cast idiom rather than `openapi-fetch`'s typed `.GET()`.

**Imports pattern** (lines 1-3, unchanged — reuse the same imports):
```typescript
import createClient from "openapi-fetch";
import type { paths, components } from "./types/onshape.d.ts";
import { callWithRefresh, type RefreshableSession, type RefreshedTokens } from "../auth/refresh.ts";
```

**Core pattern to copy verbatim-structure** (from `getAssemblyDefinition`, lines 119-147):
```typescript
async getPartStudioMassProperties(documentId, wvm, wvmid, elementId, partIds, configuration) {
  return callWithRefresh(
    session,
    async () => {
      const url = new URL(
        `/api/partstudios/d/${documentId}/${wvm}/${wvmid}/e/${elementId}/massproperties`,
        ONSHAPE_API_BASE_URL,
      );
      for (const id of partIds ?? []) url.searchParams.append("partId", id);
      if (configuration) url.searchParams.set("configuration", configuration);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken ?? ""}`, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new OnshapeApiError(res.status, "Failed to fetch part studio mass properties");
      }
      return (await res.json()) as components["schemas"]["BTMassPropertiesBulkInfo"];
    },
    refreshFn,
  );
},
```
Add `getPartsMetadata` as a sibling method with the identical wrapper shape (target `/api/parts/d/{did}/{wvm}/{wvmid}/e/{eid}`), and extend the `OnshapeClient` interface (lines 80-88) with both new method signatures, matching the existing style exactly (one line per method, no default params in the interface).

**Error handling pattern** (line 141, reused verbatim): `if (!res.ok) throw new OnshapeApiError(res.status, "...")`. Same `OnshapeApiError` class (lines 13-20) — do not create a new error type.

**Note (RESEARCH Pitfall 3):** thread `configuration` through from `AssemblyPartInfo.configuration` on both new calls — the analog (`getAssemblyDefinition`) has no configuration param today, so this is a genuinely new parameter, not a copy-paste from the analog; add it deliberately.

---

### `src/server/checks/engine.ts` (model/service, transform)

**Analog:** itself — Phase 1's `Verdict` interface + `passesOperator` (full file, 47 lines, already read above).

**Reused as-is (no changes):**
```typescript
export function passesOperator(entry: Pick<RuleEntry, "operator" | "limit">, measured: number): boolean {
  return entry.operator === "max" ? measured <= entry.limit : measured >= entry.limit;
}
export class CheckEngine { register(fn) {...} runAll(facts, config) {...} }
```

**`Verdict` extension per D-11** (RESEARCH Code Examples, matches CONTEXT.md D-11 verbatim):
```typescript
export interface Verdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  measured?: { lb: number; kg: number };
  affectedPartCount?: number;
  affectedParts?: Array<{ name: string; path: string[] }>;
  caveats: string[];
}
```
This is a **breaking change** to the existing `Verdict` shape (Phase 1 had `measured: number; pass: boolean`) — `occurrenceCountCheck` and `frameTagPresenceCheck` (Phase 1's proof-of-plumbing checks) must be updated to the new shape too (`status: pass ? "PASS" : "FAIL"`, `measured: { lb: ..., kg: ... }` only if they're weight-flavored, otherwise reuse a simpler numeric `measured` variant — planner's call whether to keep a non-weight `measured: number` variant via a union, or normalize everything to the dual-figure shape). Flag this cross-file ripple explicitly for the planner.

**Conversion constant (D-02, RESEARCH "Don't Hand-Roll" table):** add one exported constant near `Verdict`, e.g.:
```typescript
export const KG_TO_LB = 2.20462;
```
Single documented location — no other file should hardcode this ratio.

---

### `src/server/checks/material-audit.check.ts` (new — service/pure check, transform)

**Analog:** `src/server/checks/frame-tag-presence.check.ts` (full file, 28 lines, already read above) — same prefix-filter-over-Fact[] idiom, extended from a count to a list per D-08.

**Imports pattern** (lines 1-3 of analog, copy verbatim):
```typescript
import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
```

**Core pattern** (adapted from analog lines 12-28):
```typescript
export const materialAuditCheck: CheckFn = (facts: Fact[], config) => {
  const entry = config.rules.find((r) => r.rule === "R-AUDIT")!; // or however audit is keyed
  const weightContributing = facts; // D-07: union of both verdicts' sets, or all facts if audit is unconditional
  const missing = weightContributing.filter((f) => f.materialAssigned === false);

  return {
    rule: entry.rule,
    title: entry.title,
    unit: entry.unit,
    limit: entry.limit,
    status: missing.length > 0 ? "FAIL" : "PASS", // audit is itself a first-class pass/fail per D-11
    affectedPartCount: missing.length,
    affectedParts: missing.map((f) => ({ name: f.name, path: f.path })),
    caveats: [],
  };
};
```
Note: unlike `frameTagPresenceCheck`'s `config.rules[1]` fixed-index lookup, prefer `config.rules.find(r => r.rule === "...")` for the audit and the two weight checks — fixed-index lookup is fragile once `rules/2026.json` has 4+ entries; flag this as a small improvement over the literal Phase-1 idiom, not a deviation from established convention.

---

### `src/server/checks/robot-weight.check.ts` (R103, new — service/pure check, transform)

**Analog:** `src/server/checks/occurrence-count.check.ts` (structural CheckFn shape) blended with the RESEARCH-provided worked example (Architecture Pattern 2, lines 184-205 of RESEARCH.md, already reproduced in full above) — this is the strongest and most literal analog available since RESEARCH already wrote the exact pattern this file should follow.

**Imports pattern** (copy from `frame-tag-presence.check.ts` lines 1-3, add `passesOperator`):
```typescript
import type { Fact } from "../traversal/facts.ts";
import type { CheckFn } from "./engine.ts";
import { passesOperator, KG_TO_LB } from "./engine.ts";
```

**Core pattern (from RESEARCH, verbatim structure):**
```typescript
export const robotWeightCheck: CheckFn = (facts, config) => {
  const entry = config.rules.find((r) => r.rule === "R103")!;
  const included = facts.filter(
    (f) => !f.name.startsWith("BUMPER_") && !f.name.startsWith("BATTERY_"),
  );
  const missingMaterial = included.filter((f) => f.materialAssigned === false);
  const caveats: string[] = [];
  if (!facts.some((f) => f.name.startsWith("BUMPER_"))) {
    caveats.push("no BUMPER_ part found — bumper mass may be included in this total.");
  }
  if (!facts.some((f) => f.name.startsWith("BATTERY_"))) {
    caveats.push("no BATTERY_ part found — battery mass may be included in this total.");
  }

  if (missingMaterial.length > 0) {
    return {
      rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
      status: "UNKNOWN",
      affectedPartCount: missingMaterial.length,
      affectedParts: missingMaterial.map((f) => ({ name: f.name, path: f.path })),
      caveats,
    };
  }

  const totalKg = included.reduce((sum, f) => sum + (f.massKg ?? 0), 0);
  const totalLb = totalKg * KG_TO_LB;
  return {
    rule: entry.rule, title: entry.title, limit: entry.limit, unit: entry.unit,
    status: passesOperator(entry, totalLb) ? "PASS" : "FAIL",
    measured: { lb: totalLb, kg: totalKg },
    caveats,
  };
};
```

**Error handling pattern:** same non-null-assertion-on-config-lookup idiom as `frameTagPresenceCheck`'s explicit throw (lines 13-16) — prefer throwing a descriptive `Error` if `config.rules.find(...)` returns undefined, rather than a silent `!` assertion, matching the analog's defensive style:
```typescript
const entry = config.rules.find((r) => r.rule === "R103");
if (!entry) throw new Error("robotWeightCheck requires an R103 entry in the season config");
```

---

### `src/server/checks/robot-bumpers-weight.check.ts` (R408, new — service/pure check, transform)

**Analog:** `robot-weight.check.ts` (once written, above) — near-identical structure, narrower exclusion set per D-05.

**Only diffs from R103's pattern:**
```typescript
const entry = config.rules.find((r) => r.rule === "R408");
const included = facts.filter((f) => !f.name.startsWith("BATTERY_")); // bumpers INCLUDED
// only emit the BATTERY_ caveat, not the BUMPER_ one (bumpers are intentionally included here)
```
Everything else (UNKNOWN gating shape, lb/kg conversion, caveats array, error-throw-on-missing-entry) is copied identically from `robot-weight.check.ts` — this is intentionally a near-duplicate per D-05's "two independently-filtered occurrence queries, not one number relabeled."

---

### `src/server/routes/check.routes.ts` (controller/route, request-response)

**Analog:** itself — Phase 1's full handler (111 lines, already read above).

**Imports pattern** (lines 1-9, extend):
```typescript
import { Router } from "express";
import { z } from "zod";
import { createOnshapeClient, type OnshapeClient, type OnshapeClientEnv } from "../onshape-client/client.ts";
import { ReconnectRequiredError } from "../auth/refresh.ts";
import { flattenAssembly, groupPartsByElement } from "../traversal/flatten-assembly.ts"; // ADD groupPartsByElement
import { loadSeasonConfig } from "../config/load-season.ts";
import { CheckEngine } from "../checks/engine.ts";
import { occurrenceCountCheck } from "../checks/occurrence-count.check.ts";
import { frameTagPresenceCheck } from "../checks/frame-tag-presence.check.ts";
import { materialAuditCheck } from "../checks/material-audit.check.ts"; // NEW
import { robotWeightCheck } from "../checks/robot-weight.check.ts"; // NEW
import { robotBumpersWeightCheck } from "../checks/robot-bumpers-weight.check.ts"; // NEW
```

**`buildEngine()` extension pattern** (lines 29-34, copy-extend):
```typescript
function buildEngine(): CheckEngine {
  const engine = new CheckEngine();
  engine.register(occurrenceCountCheck);
  engine.register(frameTagPresenceCheck);
  engine.register(materialAuditCheck); // NEW
  engine.register(robotWeightCheck);   // NEW
  engine.register(robotBumpersWeightCheck); // NEW
  return engine;
}
```

**Handler extension pattern** — insert the merge step between the existing steps (5) and (6) (lines 83-92), preserving the exact "(N) comment" documentation convention already used throughout this file:
```typescript
// (5) Shared traversal (unchanged, Plan 02).
const facts = flattenAssembly(definition as unknown as Parameters<typeof flattenAssembly>[0]);

// (5b, NEW) Group parts[] by owning Part Studio element, fetch mass +
// material per distinct element (RESEARCH Architecture Pattern 1), and merge
// onto facts BEFORE the engine runs -- checks stay pure/sync per D-11 discretion.
const groups = groupPartsByElement(definition as unknown as Parameters<typeof groupPartsByElement>[0]);
const massByPartId = new Map<string, number>();
const materialByPartId = new Map<string, boolean>();
for (const [key, parts] of groups) {
  const [did, eid] = key.split(":");
  const partIds = parts.map((p) => p.partId);
  const massInfo = await client.getPartStudioMassProperties(did, "w", workspaceId, eid, partIds);
  const metadata = await client.getPartsMetadata(did, "w", workspaceId, eid);
  for (const partId of partIds) {
    massByPartId.set(partId, massInfo.bodies?.[partId]?.mass?.[0] ?? 0); // RESEARCH Pitfall 4
    materialByPartId.set(partId, !!metadata.find((m) => m.partId === partId)?.material);
  }
}
const enrichedFacts = facts.map((f) => ({
  ...f,
  massKg: massByPartId.get(f.partId),
  materialAssigned: materialByPartId.get(f.partId),
}));

// (6) Config + engine (Plan 02 core, reused as-is) -- now over enrichedFacts.
const config = loadSeasonConfig(CURRENT_SEASON);
const engine = buildEngine();
const verdicts = engine.runAll(enrichedFacts, config);
```

**Error handling pattern:** identical try/catch/`ReconnectRequiredError` structure (lines 63-107) — no changes needed to the catch block; new client calls are already inside the existing `try`, so 401s on the new endpoints get the same transparent-refresh treatment via `callWithRefresh` inside the client methods themselves.

**Security note (RESEARCH V4 Access Control):** `did`/`eid`/`partIds` above are all derived server-side from `definition.parts[]` (itself fetched using the already-validated `documentId`/`workspaceId`), never from `req.body` — continues the T-01-11/CONN-02 discipline already in this file.

---

### `rules/2026.json` (config, transform)

**Analog:** itself — fix only, no structural pattern needed.

**Change (D-03):** on the `R103` and `R408` entries, change `"unit": "kg"` to `"unit": "lb"`. Leave `limit` values (115, 135) and `"limitStatus": "PLACEHOLDER"` untouched — those are pound-denominated numbers already per CONTEXT.md D-03.

---

### `src/panel/components/ReportTable.tsx` (component, render)

**Analog:** itself — Phase 1's full component (52 lines, already read above).

**Core render pattern to extend** (lines 26-47) — add a tri-state branch before the existing pass/fail badge rendering:
```tsx
{verdicts.map((verdict) => (
  <tr key={verdict.rule}>
    <td>{verdict.rule}</td>
    <td>{verdict.title}</td>
    <td>
      {verdict.status === "UNKNOWN"
        ? `UNKNOWN — ${verdict.affectedPartCount} parts missing material`
        : `${verdict.measured?.lb.toFixed(1)} lb (${verdict.measured?.kg.toFixed(1)} kg)`}
    </td>
    <td>
      <span style={{
        color: verdict.status === "PASS" ? "#0f5132" : verdict.status === "FAIL" ? "#842029" : "#664d03",
        background: verdict.status === "PASS" ? "#d1e7dd" : verdict.status === "FAIL" ? "#f8d7da" : "#fff3cd",
        borderRadius: 4, padding: "2px 8px", fontWeight: 600,
      }}>
        {verdict.status}
      </span>
    </td>
  </tr>
))}
{/* D-08: render affectedParts list rows for any UNKNOWN verdict, and caveats inline */}
```
Keep it unstyled beyond the existing inline pass/fail color convention already present (per project memory: "don't style the panel until checks compute real values"). Do not introduce a CSS framework or new styling system — extend the same inline-style idiom already used.

---

### `src/panel/api.ts` (model/utility, transform)

**Analog:** itself — Phase 1's `CheckReportVerdict` interface (lines 28-35, already read above), which the doc comment explicitly states "Mirrors src/server/checks/engine.ts's Verdict shape."

**Pattern:** mirror the extended `Verdict` shape 1:1, exactly as Phase 1 did:
```typescript
export interface CheckReportVerdict {
  rule: string;
  title: string;
  limit: number;
  unit: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  measured?: { lb: number; kg: number };
  affectedPartCount?: number;
  affectedParts?: Array<{ name: string; path: string[] }>;
  caveats: string[];
}
```
Preserve the existing doc-comment convention noting that this client-side type duplicates the backend `Verdict` shape and no business logic should be re-derived client-side.

---

## Shared Patterns

### CheckFn purity contract
**Source:** `src/server/checks/engine.ts` lines 16-21 (`CheckFn` type + doc comment), `src/server/checks/occurrence-count.check.ts`, `src/server/checks/frame-tag-presence.check.ts`
**Apply to:** `material-audit.check.ts`, `robot-weight.check.ts`, `robot-bumpers-weight.check.ts`
```typescript
export type CheckFn = (facts: Fact[], config: SeasonConfig) => Verdict;
```
All three new check files must remain synchronous, pure functions over `(facts, config)` — no network calls, no async, no direct `OnshapeClient` usage. Enrichment (mass/material) happens exclusively in `check.routes.ts` before `engine.runAll()` is called.

### callWithRefresh wrapper for all new Onshape API calls
**Source:** `src/server/onshape-client/client.ts` lines 90-147 (both existing methods)
**Apply to:** `getPartStudioMassProperties`, `getPartsMetadata`
```typescript
return callWithRefresh(session, async () => { /* fetch + OnshapeApiError on !res.ok */ }, refreshFn);
```
Every new Onshape-facing method must route through this exact wrapper — no direct unwrapped `fetch()` calls anywhere else in the codebase, preserving D-04 (401-reactive refresh) uniformly.

### Server-side re-derivation / no client-trusted ids
**Source:** `src/server/routes/check.routes.ts` lines 52-56, 66-77 (comments (3) and (4))
**Apply to:** the new mass/material merge step in the same file
All `documentId`/`elementId`/`partId` values used in the new `getPartStudioMassProperties`/`getPartsMetadata` calls must be derived from the server-fetched `definition.parts[]`, never from `req.body` — continues T-01-11/CONN-02.

### Config-driven verdicts, never hardcoded limits
**Source:** `src/server/config/schema.ts` (full file), `src/server/config/load-season.ts` (full file), `rules/2026.json`
**Apply to:** `material-audit.check.ts`, `robot-weight.check.ts`, `robot-bumpers-weight.check.ts`
All three new checks pull `rule`/`title`/`limit`/`unit`/`operator` from `config.rules` (via `loadSeasonConfig`), never inline a numeric limit. Prefer `config.rules.find(r => r.rule === "R103")` over Phase 1's fixed-index `config.rules[N]` lookup now that the rules array has 4+ entries (see `robot-weight.check.ts` pattern assignment above).

### Single kg→lb conversion point
**Source:** RESEARCH "Don't Hand-Roll" table + D-02
**Apply to:** `src/server/checks/engine.ts` (new `KG_TO_LB` export), consumed only by `robot-weight.check.ts` and `robot-bumpers-weight.check.ts`
No other file (including `ReportTable.tsx`) should perform or re-derive the kg↔lb conversion — the panel renders pre-converted `measured.lb`/`measured.kg` only.

## No Analog Found

None. Every file in this phase extends a Phase-1-established file or has a near-exact same-role/same-data-flow analog already in the repo (Phase 1's proof-of-plumbing checks were explicitly designed to be templates for future checks).

## Metadata

**Analog search scope:** `src/server/` (traversal, checks, config, onshape-client, routes), `src/panel/` (components, api.ts), `rules/2026.json` — entire relevant source tree, no directories excluded.
**Files scanned:** 22 (full file listing via `find`), 12 read in full for pattern extraction.
**Pattern extraction date:** 2026-07-02

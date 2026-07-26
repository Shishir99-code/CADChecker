# Phase 4: Trust-Bar Results Panel - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 10 (all modifications of existing files; zero net-new files strictly required, one optional new component)
**Analogs found:** 10 / 10 (every file IS its own best analog — this phase extends idioms already present in the same file)

## File Classification

| File to Modify | Role | Data Flow | Closest Analog (self) | Match Quality |
|---|---|---|---|---|
| `src/server/routes/check.routes.ts` | route/controller | request-response | itself (existing `buildEngine()` + response-assembly + try/catch enrichment idioms) | exact |
| `src/server/onshape-client/client.ts` | service (typed API client) | request-response | itself (`getElementsInDocument`, the "clean-200" idiom) | exact |
| `src/panel/api.ts` | type/contract module | request-response (client-side fetch wrapper) | itself (`CheckReportContext`/`CheckReportVerdict` interfaces) | exact |
| `src/panel/components/ReportTable.tsx` | component | transform (render) | itself (`renderMeasured()`, status-badge, caveats-row idioms) | exact |
| `src/panel/main.tsx` | component/orchestrator | event-driven (click → state → render) | itself (`checkState` discriminated union) | exact |
| `src/server/checks/robot-weight.check.ts` | service (pure check fn) | transform | `src/server/checks/frame-perimeter.check.ts` (the `caveats[0]`-as-reason idiom to adopt) | role-match |
| `src/server/checks/robot-bumpers-weight.check.ts` | service (pure check fn) | transform | `src/server/checks/robot-weight.check.ts` (near-duplicate sibling, same fix shape) | exact |
| `src/server/routes/check.routes.test.ts` | test | request-response (integration test) | itself (`stubElements()`/`stubGetPartStudioMassProperties()` stub-factory idiom) | exact |
| `src/panel/main.tsx` (PlumbingBanner disposition) | component | — | `src/panel/components/PlumbingBanner.tsx` (file being removed/repurposed) | exact |
| `src/panel/components/DisclosureHeader.tsx` (NEW, optional) | component | transform (render) | `src/panel/components/ReportTable.tsx` (inline-style/no-framework idiom to copy) | role-match |

## Pattern Assignments

### `src/server/routes/check.routes.ts` (route, request-response)

**Analog:** itself — extend three existing idioms in place, do not invent new ones.

**1. `buildEngine()` registration idiom (lines 35-45)** — D-01 unregister target:
```typescript
function buildEngine(): CheckEngine {
  const engine = new CheckEngine();
  engine.register(occurrenceCountCheck);      // DELETE this line (D-01)
  engine.register(frameTagPresenceCheck);     // DELETE this line (D-01)
  engine.register(materialAuditCheck);
  engine.register(robotWeightCheck);
  engine.register(robotBumpersWeightCheck);
  engine.register(framePerimeterCheck);
  engine.register(startingHeightCheck);
  return engine;
}
```
Also remove the now-unused imports at lines 8-9 (`occurrenceCountCheck`, `frameTagPresenceCheck`) if the files are deleted (Open Question 2 — RESEARCH recommends delete).

**2. Best-effort try/catch enrichment idiom (lines 304-317, the 5d block)** — copy this EXACT shape for the new `getDocument` call:
```typescript
let robotMaxZWorld: number | undefined;
try {
  const assemblyBox = await client.getAssemblyBoundingBoxes(assemblyDocumentId, "w", workspaceId, elementId);
  robotMaxZWorld = assemblyBox.highZ;
} catch (err) {
  if (err instanceof ReconnectRequiredError) {
    throw err;
  }
  if (err instanceof OnshapeApiError && err.status === 401) {
    throw err;
  }
  // Any other error -- swallow it and leave the field undefined.
}
```
New code mirrors this exactly:
```typescript
let documentName: string | undefined;
try {
  const doc = await client.getDocument(documentId);
  documentName = doc.name;
} catch (err) {
  if (err instanceof ReconnectRequiredError) throw err;
  if (err instanceof OnshapeApiError && err.status === 401) throw err;
  // any other failure: leave documentName undefined, never block the response
}
```
Place it after the `elements`/`assembly` derivation (after line 85, where `documentId`/`elementId` are already in scope) — order doesn't matter relative to the mass/bbox blocks since it's independent, but grouping it near the "(3) Live context re-derivation" comment block keeps all name/id resolution together.

**3. Response-builder literal (lines 342-345)** — the single-object-literal atomicity idiom to extend:
```typescript
// CURRENT (lines 342-345):
res.status(200).json({
  measuredContext: { documentId, workspaceId, elementId },
  verdicts,
});

// GROWN (add 4 fields, same single object literal — atomicity preserved
// because there is no `await` between field assembly and res.json):
res.status(200).json({
  measuredContext: {
    documentId,
    workspaceId,
    elementId,
    documentName,                                   // may be undefined
    tabName: assembly.name,                          // FREE — already resolved at line 80
    configurationName: DEFAULT_CONFIGURATION_NAME,   // "Default" constant
    checkedAt: new Date().toISOString(),              // stamped once, here
  },
  verdicts,
});
```
Add `const DEFAULT_CONFIGURATION_NAME = "Default";` near the top of the file, alongside `const CURRENT_SEASON = "2026";` (line 17) — same "single named constant near the top" convention.

---

### `src/server/onshape-client/client.ts` (service, request-response)

**Analog:** itself — `getElementsInDocument` (lines 125-148) is the exact idiom to copy for `getDocument`, NOT the raw-fetch-cast idiom used by the other 4 methods. `operations["getDocument"]` in `onshape.d.ts` (10909-10930) declares an explicit `200` response like `getElementsInDocument` does — use `client.GET(...)` typed access, not `fetch()` + cast.

**Exact idiom to copy (lines 125-148):**
```typescript
async getElementsInDocument(documentId, workspaceId) {
  return callWithRefresh(
    session,
    async () => {
      const client = buildFetchClient(session);
      const result = await client.GET("/api/documents/d/{did}/{wvm}/{wvmid}/elements", {
        params: { path: { did: documentId, wvm: "w", wvmid: workspaceId } },
      });
      if (!result.data) {
        const status = (result as { response: Response }).response.status;
        throw new OnshapeApiError(status, "Failed to fetch elements in document");
      }
      return result.data;
    },
    refreshFn,
  );
},
```

**New method (same file, add to the returned object and to the `OnshapeClient` interface at lines 83-119):**
```typescript
export type DocumentInfo = components["schemas"]["BTDocumentInfo"]; // add near other type aliases, lines 8-12

// interface addition:
getDocument(documentId: string): Promise<DocumentInfo>;

// implementation, same shape as getElementsInDocument:
async getDocument(documentId) {
  return callWithRefresh(
    session,
    async () => {
      const client = buildFetchClient(session);
      const result = await client.GET("/api/documents/{did}", {
        params: { path: { did: documentId } },
      });
      if (!result.data) {
        const status = (result as { response: Response }).response.status;
        throw new OnshapeApiError(status, "Failed to fetch document");
      }
      return result.data;
    },
    refreshFn,
  );
},
```

---

### `src/panel/api.ts` (type/contract module)

**Analog:** itself — `CheckReportContext` (lines 51-55) is the type to grow; `CheckReportVerdict` (lines 28-49) is the sibling type that must NOT change (D-04 requires zero schema change, only panel-render fix).

**Current shape to extend:**
```typescript
export interface CheckReportContext {
  documentId: string;
  workspaceId: string;
  elementId: string;
}
```
**Grown shape (add 4 optional/typed fields, keep the 3 existing ones for back-compat per RESEARCH Code Examples):**
```typescript
export interface CheckReportContext {
  documentId: string;
  workspaceId: string;
  elementId: string;
  documentName?: string;
  tabName?: string;
  configurationName: string;
  checkedAt: string;
}
```
Follow the existing comment-block convention above `CheckReportVerdict` (lines 22-27) — a short doc comment explaining "mirrors server X, never recomputed client-side" is the established idiom in this file.

---

### `src/panel/components/ReportTable.tsx` (component, transform/render)

**Analog:** itself — `renderMeasured()` (lines 16-27) is the function to fix per D-04; the status-badge idiom (`STATUS_COLORS`, lines 7-11, and its use at lines 52/59-69) is the idiom the "NOT YET CHECKABLE" relabel must preserve (only the displayed text changes, not the color-key structure); the caveats-row idiom (lines 74-104) is the existing render-target for reasons — do NOT build a new row type, reuse this one.

**Current buggy code (lines 16-18) — replace:**
```typescript
function renderMeasured(verdict: CheckReportVerdict): string {
  if (verdict.status === "UNKNOWN") {
    return `UNKNOWN — ${verdict.affectedPartCount ?? 0} parts missing material`;
  }
  ...
```

**Fix idiom (from RESEARCH Code Examples, matches file's existing small-pure-function style):**
```typescript
function renderReason(verdict: CheckReportVerdict): string {
  if (verdict.caveats.length > 0) return verdict.caveats[0];
  // Defensive fallback only -- should not fire once check-side fixes ship.
  return `not yet checkable${verdict.affectedPartCount ? ` -- ${verdict.affectedPartCount} part(s) affected` : ""}`;
}
```
Wire it into `renderMeasured()`'s UNKNOWN branch, or call it directly where the caveats row already renders (lines 94-99) — the caveats row ALREADY iterates `verdict.caveats.map(...)`, so the simplest fix consistent with existing code is: keep `renderMeasured()` returning something UNKNOWN-appropriate but non-misleading (e.g. `"NOT YET CHECKABLE"`) in the Measured column, and let the pre-existing caveats-row block (unchanged) surface `caveats[0]` as the reason — avoiding duplicate reason text in two places.

**Badge relabel (`STATUS_COLORS` + render, lines 7-11 and 68):**
```typescript
// Keep the color mapping keyed by the SAME "UNKNOWN" status literal
// (no Verdict schema change, D-04) — only change the DISPLAYED label text:
const STATUS_COLORS: Record<CheckReportVerdict["status"], { color: string; background: string }> = {
  PASS: { color: "#0f5132", background: "#d1e7dd" },
  FAIL: { color: "#842029", background: "#f8d7da" },
  UNKNOWN: { color: "#664d03", background: "#fff3cd" },  // keep yellow, unchanged
};
// ...
<span style={{ color: badge.color, background: badge.background, borderRadius: 4, padding: "2px 8px", fontWeight: 600 }}>
  {verdict.status === "UNKNOWN" ? "NOT YET CHECKABLE" : verdict.status}
</span>
```

**Disclosure header target:** Add as a sibling render inside `main.tsx`'s existing `report` branch (see below) OR as a small new `DisclosureHeader.tsx` component using the SAME inline-style-object idiom as this file (no CSS framework, `style={{...}}` literal objects) — that is the one consistent styling convention across every panel component in this repo (`ReportTable.tsx`, `PlumbingBanner.tsx` both use it).

---

### `src/panel/main.tsx` (orchestrator, event-driven)

**Analog:** itself — the `checkState` discriminated union (lines 10-16) already implements D-03 clear-then-show-fresh; RESEARCH confirms **no restructuring needed**, only additive JSX inside the existing `report` branch (lines 85-101).

**Current `report` branch (lines 85-101) — extend, do not restructure:**
```typescript
{checkState.status === "report" && (
  <>
    <PlumbingBanner />                                   {/* Pitfall 5: remove or repurpose */}
    <ReportTable verdicts={checkState.report.verdicts} />
    {(() => {
      const perimeterVerdict = checkState.report.verdicts.find((v) => v.geometry);
      return perimeterVerdict ? <HullRender verdict={perimeterVerdict} /> : null;
    })()}
  </>
)}
```
**Extended shape** (disclosure header rendered from `checkState.report.measuredContext`, sibling of `<ReportTable>`, still gated inside the same atomic `report` branch — this IS the D-03 guarantee, no new state needed):
```typescript
{checkState.status === "report" && (
  <>
    {/* PlumbingBanner removed/repurposed per Open Question 1 */}
    <DisclosureHeader context={checkState.report.measuredContext} />
    <ReportTable verdicts={checkState.report.verdicts} />
    {(() => { /* unchanged HullRender selection */ })()}
  </>
)}
```
The `checkState.status === "loading"` branch (line 75, `<p>Checking...</p>`) already unmounts the old report entirely — this is the exact mechanism that makes atomicity structural (RESEARCH: "already fully implemented"). Do not add any dimming/partial-update logic.

**Import to remove/change (line 5):** `import { PlumbingBanner } from "./components/PlumbingBanner.tsx";` — resolve per the planner's disposition of Open Question 1 (RESEARCH recommends explicit decision, not silent leave-as-is).

---

### `src/server/checks/robot-weight.check.ts` / `robot-bumpers-weight.check.ts` (pure check fn, transform)

**Analog:** `src/server/checks/frame-perimeter.check.ts`'s UNKNOWN-branch idiom (lines 51-59, 62-75) — a single, self-contained, plain-language sentence pushed into `caveats` at the point the UNKNOWN is decided, e.g.:
```typescript
// frame-perimeter.check.ts:51-59 (the idiom to copy)
if (frameFacts.length === 0) {
  return {
    ...
    status: "UNKNOWN",
    caveats: ["not yet checkable — no frame parts tagged"],
  };
}
```

**Current buggy shape in BOTH weight checks (robot-weight.check.ts:45-56, robot-bumpers-weight.check.ts mirrors it):**
```typescript
const untrusted = included.filter((f) => f.materialAssigned === false || f.massKg === undefined);

if (untrusted.length > 0) {
  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: "UNKNOWN",
    affectedPartCount: untrusted.length,
    affectedParts: untrusted.map((f) => ({ name: f.name, path: f.path })),
    caveats,   // BUG: `caveats` here is only the pre-populated BUMPER_/BATTERY_
               // presence-note array from lines 35-41 -- can be [] and never
               // states WHY this verdict is UNKNOWN.
  };
}
```

**Fix (push an explicit reason as the FIRST caveat, keep existing BUMPER_/BATTERY_ notes appended after it so `caveats[0]` is always the reason, matching `renderReason()`'s `caveats[0]` contract):**
```typescript
if (untrusted.length > 0) {
  return {
    rule: entry.rule,
    title: entry.title,
    limit: entry.limit,
    unit: entry.unit,
    status: "UNKNOWN",
    affectedPartCount: untrusted.length,
    affectedParts: untrusted.map((f) => ({ name: f.name, path: f.path })),
    caveats: [
      `${untrusted.length} part(s) have missing material or unresolved mass — see affected parts`,
      ...caveats,
    ],
  };
}
```
Apply identically to `robot-bumpers-weight.check.ts` (its `untrusted`/return block is structurally the same, same line shape, `included` set differs only by the BUMPER_ exclusion, per its own file header comment "near-duplicate of robotWeightCheck").

**Do NOT touch:** `src/server/checks/material-audit.check.ts` — it never returns UNKNOWN (Pitfall 2); its FAIL reason is already fully surfaced via `affectedPartCount`/`affectedParts`, rendered separately by `ReportTable.tsx`'s existing "Missing material:" list (lines 84-93).

---

### `src/server/routes/check.routes.test.ts` (test, request-response)

**Analog:** itself — the `stubElements()`/`stubGetPartStudioMassProperties()`/`stubGetAssemblyBoundingBoxes()` factory-function idiom (lines 23-28, 110-122, 148-150) is the exact pattern for the new `stubGetDocument()` helper.

**Idiom to copy (lines 148-150, the simplest existing stub factory):**
```typescript
/** Fake getAssemblyBoundingBoxes -- the single whole-robot world-space box
 * (5d). highZ = 0.5m -> ~19.68in, comfortably under the 30in R104 limit. */
function stubGetAssemblyBoundingBoxes() {
  return vi.fn(async () => ({ lowX: -1, lowY: -1, lowZ: 0, highX: 1, highY: 1, highZ: 0.5 }));
}
```

**New helper, same shape:**
```typescript
/** Fake getDocument -- returns a display name for the disclosure header. */
function stubGetDocument() {
  return vi.fn(async () => ({ id: "doc-1", name: "Test Robot 2026" }));
}
```

**Threading idiom (`buildTestApp(...)` call-sites, e.g. lines 200-205):**
```typescript
const app = buildTestApp({
  getElementsInDocument,
  getAssemblyDefinition,
  getPartStudioMassProperties,
  getPartsMetadata,
  getDocument: stubGetDocument(),   // ADD to every call-site that reaches response assembly
});
```
Per Pitfall 3, this must be threaded into every one of the 9 `buildTestApp({...})` calls that reaches the `res.json(...)` step (grep confirms call-sites at lines 185, 200, 254, 323, 414, 492, 527, 539, plus the 401 no-session test at 185 does NOT need it since it returns before any client call). Since `getDocument` is called unconditionally once implemented in the route, any test whose fake client omits it will throw `TypeError: client.getDocument is not a function` — this is Pitfall 3's exact reproduction.

**Existing count assertion to update (line 216, 229-243):**
```typescript
// CURRENT:
expect(res.body.verdicts).toHaveLength(7);
...
expect(res.body.verdicts.filter((v: { rule: string }) => v.rule === "R101")).toHaveLength(2); // collision assertion — remove/rework
// NEW:
expect(res.body.verdicts).toHaveLength(5);
expect(res.body.verdicts.filter((v: { rule: string }) => v.rule === "R101")).toHaveLength(1); // collision resolved by D-01
```
And `measuredContext` assertion (line 217-221) grows to include the 4 new fields, matching the response-builder pattern above.

---

## Shared Patterns

### Best-effort enrichment (never fail the whole request for one optional field)
**Source:** `src/server/routes/check.routes.ts` lines 154-181 (5b), 230-274 (5c), 304-317 (5d) — three independent instances of the SAME try/catch shape.
**Apply to:** The new `getDocument` call (documentName resolution).
```typescript
try {
  // one optional/best-effort fetch
} catch (err) {
  if (err instanceof ReconnectRequiredError) throw err;
  if (err instanceof OnshapeApiError && err.status === 401) throw err;
  // swallow everything else, leave the field `undefined`
}
```

### Single-object-literal atomic response
**Source:** `src/server/routes/check.routes.ts` lines 342-345 (existing) → grown per above.
**Apply to:** All 4 new disclosure fields — no `await` may appear between object-literal construction and `res.json()`.

### No-schema-change panel fix (push domain reasons into `caveats[]`, not the panel)
**Source:** `src/server/checks/frame-perimeter.check.ts` lines 51-59, 62-75, 79-89; `src/server/checks/starting-height.check.ts` lines 40-51 — the correct existing idiom.
**Apply to:** `robot-weight.check.ts`, `robot-bumpers-weight.check.ts` (need the fix); `ReportTable.tsx`'s `renderReason()`/caveats-row rendering (reads `caveats[0]` generically for ALL checks, no per-rule branching).

### Inline-style-object, no-CSS-framework rendering
**Source:** `src/panel/components/ReportTable.tsx` (STATUS_COLORS + `style={{...}}` throughout), `src/panel/components/PlumbingBanner.tsx` (same idiom, simpler).
**Apply to:** Any new `DisclosureHeader.tsx` component (D-05 — light polish, no framework).

### Stub-factory idiom for test fixtures
**Source:** `src/server/routes/check.routes.test.ts` lines 23-28, 110-122, 125-138, 142-144, 148-150 — five existing small `function stubX() { return vi.fn(...) }` factories, each documented with a one-line doc comment explaining what it fakes and why.
**Apply to:** `stubGetDocument()`.

## No Analog Found

None — every file in scope is itself the analog (this is a modification-only phase); all cross-references above point to sibling idioms within the same file or a directly adjacent file in the same directory.

## Metadata

**Analog search scope:** `src/server/routes/`, `src/server/onshape-client/`, `src/server/checks/`, `src/panel/`, `src/panel/components/`
**Files scanned:** 10 (all read in full this session; all ≤ 360 lines, single-pass reads, no re-reads)
**Pattern extraction date:** 2026-07-11

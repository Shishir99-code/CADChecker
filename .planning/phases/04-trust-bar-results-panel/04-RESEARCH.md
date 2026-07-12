# Phase 4: Trust-Bar Results Panel - Research

**Researched:** 2026-07-11
**Domain:** Presentation/trust-layer polish over an existing Express + React (Onshape extension) codebase — no new libraries, no new Onshape API surface beyond one optional document-name lookup.
**Confidence:** HIGH (every claim below is grounded in code read directly from this repo, plus the Onshape OpenAPI spec already vendored at `src/server/onshape-client/types/onshape.d.ts`)

## Summary

This phase requires almost no new technology decisions — it is a integration/wiring exercise over code that already exists and already does most of the hard work. All four of CONTEXT.md's open research flags resolve cleanly by reading the code:

1. **Document name** needs exactly ONE new API call (`GET /api/documents/{did}`, operation `getDocument`, response `BTDocumentInfo.name`) — nothing already-fetched carries it. **Tab name is already free** (`elements.find(el => el.elementType === "ASSEMBLY").name`, already computed at `check.routes.ts:80`). **Configuration name needs ZERO API calls** — the app never selects or resolves a named Onshape "Configuration" anywhere in the codebase (that feature is explicitly deferred); the literal string `"Default"` is the correct, cheapest, and already-internally-consistent value (it matches the hardcoded caveat text `"measured the Default configuration — verify this is your starting configuration."` already shipped in two checks).
2. **Server timestamp + atomicity** is trivial: the response is already built as a single object literal in one `res.status(200).json({...})` call (`check.routes.ts:342-345`) — stamping `new Date().toISOString()` into that same object literal makes all four disclosure fields atomic by construction (single-threaded JS, no `await` between field assembly and send).
3. **"Not yet checkable" reason sourcing** has a real, previously-undocumented gap: of the 5 real UNKNOWN-producing branches across 3 check files, only `framePerimeterCheck`'s 3 branches and `startingHeightCheck`'s 1 branch already carry a complete, self-contained, correct plain-language reason in `caveats[0]`. `robotWeightCheck` and `robotBumpersWeightCheck`'s UNKNOWN branches do **not** — their `caveats[]` is populated only with unrelated BUMPER_/BATTERY_-tag-presence notes (and can be **empty** if both tags are present), so a panel-only fix (render `caveats[0]`) is **not sufficient** for those two checks; a small code change inside the check functions themselves is required to push an explicit reason caveat.
4. **Clear-then-show-fresh (D-03) is already implemented.** `main.tsx`'s `checkState` is already a discriminated union that renders nothing from the old report while `status === "loading"`, and only renders the full new report object once `status === "report"`. No restructuring is needed — the new disclosure header just needs to render as a sibling of `<ReportTable>` inside the same existing `report` branch.

**Primary recommendation:** Treat this phase as almost pure integration work: (a) add one `getDocument` client method + route call, (b) grow the `measuredContext` response object and its panel-side type, (c) fix two check functions' UNKNOWN caveats, (d) add a small `renderReason()` helper to `ReportTable.tsx`, (e) add the header block as a sibling of the existing table inside `main.tsx`'s already-atomic `report` branch, (f) unregister the two plumbing checks. Do not introduce any new npm package for this phase.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rule citation + measured-value rendering (RSLT-01) | Browser/Client (`ReportTable.tsx`) | API/Backend (`Verdict` shape, unchanged) | Panel renders whatever JSON the backend returns; no business logic duplicated client-side (existing architectural rule, `api.ts:23-27` comment). |
| "Not yet checkable" reason composition (RSLT-02) | API/Backend (check functions' `caveats[]`) | Browser/Client (`ReportTable.tsx` reads `caveats[0]`) | The REASON a check is UNKNOWN is domain knowledge that belongs in the check function, not invented in the panel; the panel's only job is to surface what the backend already knows, honestly. |
| Document/tab/config/timestamp name resolution (RSLT-03) | API/Backend (`check.routes.ts`, re-derived server-side, never client-trusted per CONN-02 precedent) | — | Continues the established pattern: every id used in the response is server-derived from Onshape API responses, never `req.body` (T-01-11/CONN-02 threat closure). |
| Re-check atomicity (SC4) | Browser/Client (`main.tsx` state machine) | API/Backend (single-object-literal response assembly) | Client-side: one `useState` swap gates render of the whole new report together. Server-side: one `res.json()` call assembles all 4 fields together — both tiers already satisfy atomicity independently; this phase just needs to not break either guarantee. |
| Retiring plumbing checks (D-01) | API/Backend (`buildEngine()` registry) | — | `CheckEngine.register()` is a pure list; removing 2 lines is the entire change. |

## Standard Stack

No new packages for this phase. All work uses libraries already installed and locked in `CLAUDE.md`'s Recommended Stack (`openapi-fetch` for the one new typed API call, React 19 + inline styles for the panel, `zod`/`vitest` unchanged). No `npm install` is required.

**Package Legitimacy Audit:** N/A — this phase installs zero new external packages. Section omitted per protocol (audit is required only "whenever this phase installs external packages").

## <phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RSLT-01 | Every check shows pass/fail + rule#/title/limit/measured for all Phase 1-3 checks | `Verdict`/`CheckReportVerdict` already carry all 5 fields (`engine.ts:18-43`, `api.ts:28-49`); `ReportTable.tsx` already renders rule/title/measured/status per row. After D-01 retires the 2 plumbing checks, the remaining 5 real checks (MAT-AUDIT, R103, R408, R101, R104) are exactly the "for all Phases 1-3" set — see Q3 audit below for exact caveat text per check. |
| RSLT-02 | Explicit "not yet checkable" state, never silent pass | See "Common Pitfalls" and "Q3 findings" below — 5 real UNKNOWN branches audited; 2 of them (R103/R408) need a check-function code fix, not just a panel fix. |
| RSLT-03 | Document/tab/configuration/timestamp disclosure | See "Code Examples" below — tab name free, document name needs 1 new call, configuration name needs 0 calls (hardcoded), timestamp is a `new Date().toISOString()` stamp inside the existing response-assembly object literal. |
</phase_requirements>

## Architecture Patterns

### System Architecture Diagram

```
Panel click "Check now"
  │
  ▼
main.tsx: setCheckState({status:"loading"})  ── render shows ONLY "Checking..." (old report unmounted)
  │
  ▼
POST /api/check  (api.ts runCheck)
  │
  ▼
check.routes.ts handler:
  1. getElementsInDocument(documentId, workspaceId)          ─┐
       → assembly = elements.find(ASSEMBLY)                   │  already fetched today
       → tabName = assembly.name  (FREE, no new call)         │
  2. [NEW] getDocument(documentId)                             │  ONE new call (getDocument op,
       → documentName = doc.name  (best-effort; swallow err)   │  GET /api/documents/{did})
  3. getAssemblyDefinition(...) → facts, groups               │  existing
  4. 5b/5c/5d enrichment (mass, material, bbox, height)        │  existing, unchanged
  5. engine.runAll(enrichedFacts, config) → verdicts           │  existing, now 5 checks not 7
  6. [NEW] configurationName = "Default" (hardcoded constant)  │  ZERO calls
  7. [NEW] checkedAt = new Date().toISOString()                │  stamped once, here
  8. res.json({ measuredContext: {..., documentName, tabName,  │  ONE response object,
                 configurationName, checkedAt}, verdicts })   ─┘  atomic by construction
  │
  ▼
main.tsx: setCheckState({status:"report", report: result})  ── render shows header + table TOGETHER
  │
  ▼
ReportTable.tsx: per-row status badge + renderMeasured() + [NEW] renderReason() for UNKNOWN rows
DisclosureHeader (NEW small component or inline JSX): documentName / tabName / configurationName / checkedAt
```

### Recommended Project Structure

No new directories. New/changed files only:

```
src/server/onshape-client/client.ts        # + getDocument() method
src/server/routes/check.routes.ts          # + getDocument call, grown measuredContext, buildEngine() -2 checks
src/server/checks/robot-weight.check.ts    # + explicit UNKNOWN reason caveat
src/server/checks/robot-bumpers-weight.check.ts  # + explicit UNKNOWN reason caveat
src/panel/api.ts                           # CheckReportContext grows 4 fields
src/panel/components/ReportTable.tsx       # renderMeasured() → renderReason() fix; badge relabel
src/panel/components/DisclosureHeader.tsx  # NEW (or inline in main.tsx — Claude's discretion, D-05)
src/panel/main.tsx                         # render header as sibling of <ReportTable> in "report" branch
src/server/checks/occurrence-count.check.ts       # unregistered (delete or leave dead — D-01b discretion)
src/server/checks/frame-tag-presence.check.ts     # unregistered (delete or leave dead — D-01b discretion)
```

### Pattern 1: One new typed client call, using the "clean 200" idiom (not the raw-fetch-cast idiom)

**What:** `client.ts` has TWO idioms today: (a) `getElementsInDocument` uses `openapi-fetch`'s typed `client.GET(...)` directly because its operation declares an explicit `200` response; (b) every other method (`getAssemblyDefinition`, `getPartStudioMassProperties`, `getPartsMetadata`, `getBoundingBoxes`, `getAssemblyBoundingBoxes`) uses raw `fetch` + manual cast because their operations declare only a `default` response (openapi-fetch narrows `data` to `never` on those).

**Verified:** `operations["getDocument"]` (onshape.d.ts:10909-10930) declares an explicit `200` response with `content: {"application/vnd.onshape.v1+json;...": components["schemas"]["BTDocumentInfo"]}` — same shape as `getElementsInDocument`'s operation. Use idiom (a), not (b).

**Example:**
```typescript
// Source: src/server/onshape-client/client.ts:125-148 (existing idiom, extend identically)
async getDocument(documentId: string) {
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
      return result.data; // BTDocumentInfo — .name is the display name
    },
    refreshFn,
  );
},
```

### Pattern 2: Best-effort name resolution — never fail the whole check for a naming lookup

**What:** Every existing enrichment block in `check.routes.ts` (5b mass/material, 5c bbox, 5d height) follows the SAME try/catch discipline: `ReconnectRequiredError` and 401 `OnshapeApiError` are re-thrown (a broken session must never be hidden); every other error is swallowed and the field is left `undefined`, never defaulted to a misleading value. The new `getDocument` call should follow this identical pattern — a failed document-name lookup must never turn a successful check run into an error response; `documentName` just stays `undefined` and the panel falls back to displaying the raw id.

**Example:**
```typescript
// Source: mirrors check.routes.ts:304-317 (5d's try/catch shape) applied to the new call
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

### Pattern 3: Configuration name is a hardcoded constant, not a resolved value

**What:** No code path anywhere in this repo resolves or applies a named Onshape "Configuration" to the assembly being checked. `AssemblyPartInfo.configuration` (`flatten-assembly.ts:58`, sourced from `BTAssemblyPartsInfo.configuration`/`fullConfiguration`, onshape.d.ts:3049-3061) is a **per-referenced-element** configuration-encoding field (used only for addressing a configurable Part Studio referenced *into* the assembly) — it is never populated by anything in the traversal fixtures or tests, and it is distinct from the "Configurations" feature (`getConfiguration` operation, `BTConfigurationInfo`, onshape.d.ts:11341-11365) which itself has **no display-name field at all** (only `isStandardContent` + `parameters[]`, i.e. configurable *parameter values*, not named variants). Since named-configuration selection is explicitly deferred (CONTEXT.md Deferred Ideas), and the app always calls the mass-properties/bounding-box endpoints WITHOUT a `configuration` query param (`if (configuration) url.searchParams.set(...)` never fires today), the app is always measuring Onshape's implicit default/as-modeled state — which the code already calls "Default" in two hardcoded caveat strings (`frame-perimeter.check.ts:18`, `starting-height.check.ts:13`).

**Recommendation:** `const DEFAULT_CONFIGURATION_NAME = "Default";` as a literal constant in `check.routes.ts` (or a shared constants module), disclosed as `configurationName` in the response. Zero API calls. This also keeps the header's disclosed name textually consistent with the existing caveat sentences already shown per-check.

### Anti-Patterns to Avoid

- **Don't call `getConfiguration`** expecting a display name — it returns configurable parameter values, not a name, and would be a wasted network call for this phase's scope.
- **Don't derive `documentName` from `elements[]`** — `BTDocumentElementInfo` (onshape.d.ts:3773-3791) has no document-level name field, only element-level `name`/`filename`. Confirmed by grep across every schema currently used by this route (`BTAssemblyDefinitionInfo`, `BTMassPropertiesBulkInfo`, `BTPartMetadataInfo`) — none carry it.
- **Don't restructure `main.tsx`'s state machine** for D-03 — it is already correct. Adding a restructuring task here would be wasted planning effort; the only change needed is additive JSX inside the existing `report` branch.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Document display name | A guess/derivation from existing responses | `GET /api/documents/{did}` (`getDocument` op) | No existing response carries it; verified by direct schema inspection (HIGH confidence, generated from Onshape's own OpenAPI spec). |
| "Reason" text for weight-check UNKNOWN states | A hardcoded panel-side string keyed off `verdict.rule` (brittle, breaks the moment a new UNKNOWN-producing check is added) | Push the reason into the check's own `caveats[]` at the source, then have the panel render `caveats[0]` generically for ALL checks | Matches the established pattern (`framePerimeterCheck`/`startingHeightCheck` already do this correctly) and keeps the panel's "duplicates no business logic" rule (`api.ts:23-27`) intact — the panel should not need to know WHY a specific check is UNKNOWN. |

**Key insight:** The panel-side fix alone (render `caveats[0]` instead of a hardcoded string) looks like it satisfies D-04 for 4 of 5 real UNKNOWN branches, but silently fails for R103/R408 (empty or unrelated caveats) unless those two check functions are also touched. Treat this as two coupled tasks, not one.

## Common Pitfalls

### Pitfall 1: `renderMeasured()`'s hardcoded UNKNOWN string is wrong for most branches today (the SC2 bug, precisely diagnosed)

**What goes wrong:** `ReportTable.tsx:16-18` renders `` `UNKNOWN — ${verdict.affectedPartCount ?? 0} parts missing material` `` for every UNKNOWN verdict regardless of check.

**Why it happens — exact per-branch audit (grounded in code, not assumption):**

| Check | Branch | `caveats[]` content | `affectedPartCount` set? | Current panel output | Correct fix |
|---|---|---|---|---|---|
| `framePerimeterCheck` (`frame-perimeter.check.ts:51-60`) | zero FRAME_ facts | `["not yet checkable — no frame parts tagged"]` | No (undefined→0) | "UNKNOWN — 0 parts missing material" ❌ wrong | Render `caveats[0]` — already correct text |
| `framePerimeterCheck` (`:62-76`) | unresolved bbox | `` [`perimeter geometry could not be read for ${n} part(s) — see affected parts`] `` | Yes, correct count | Text says "missing material" but it's a geometry-read failure ❌ misleading | Render `caveats[0]` — already correct text |
| `framePerimeterCheck` (`:79-89`) | hull returns null | `["insufficient frame geometry to compute a hull"]` | No (undefined→0) | "UNKNOWN — 0 parts missing material" ❌ wrong | Render `caveats[0]` — already correct text |
| `startingHeightCheck` (`starting-height.check.ts:40-51`) | `robotMaxZWorld` undefined on every fact | `["whole-robot height could not be measured — the assembly-level bounding box was unreadable."]` | No (undefined→0) | "UNKNOWN — 0 parts missing material" ❌ wrong (no parts involved at all) | Render `caveats[0]` — already correct text |
| `robotWeightCheck` (`robot-weight.check.ts:45-56`) | `untrusted.length > 0` | Only conditional BUMPER_/BATTERY_ presence notes — **can be `[]`** if both tags present | Yes, correct count | "UNKNOWN — N parts missing material" — coincidentally plausible-sounding but not sourced from a real reason string, and wrong when the cause is unresolved mass (not material) | **Code fix required**: check function must push an explicit reason caveat, e.g. `` `${untrusted.length} part(s) have missing material or unresolved mass — see affected parts` `` |
| `robotBumpersWeightCheck` (`robot-bumpers-weight.check.ts:36-47`) | same shape | Only conditional BATTERY_ note — can be `[]` | Yes | Same issue | Same code fix |

**Warning signs:** Any UNKNOWN row reading "0 parts missing material" in the current app is this bug, live, in the UNKNOWN branches that never set `affectedPartCount` (3 of the 5 branches audited above — this is not a hypothetical, it reproduces today with e.g. an untagged document, per `03-04` gap-closure history).

### Pitfall 2: `materialAuditCheck` is never UNKNOWN — don't build UNKNOWN-reason logic for it

**What goes wrong:** CONTEXT.md's D-04a wording ("materialAudit's count may need composing... into a human sentence") can be misread as "materialAuditCheck itself needs an UNKNOWN reason." It does not — `material-audit.check.ts:23-32` only ever returns `PASS` or `FAIL` (never `UNKNOWN`), `caveats` is always `[]`, and its FAIL reason is already fully surfaced via `affectedPartCount`/`affectedParts`, which `ReportTable.tsx:84-93` already renders as a distinct "Missing material:" bulleted list. D-04a's "material audit's count" language actually refers to how the material audit's *findings propagate downstream* into `robotWeightCheck`/`robotBumpersWeightCheck`'s `untrusted` count (see Pitfall 1's last two rows) — those are the checks needing the composed-sentence fix, not `materialAuditCheck` itself.

**How to avoid:** Scope the D-04a code fix to exactly `robot-weight.check.ts` and `robot-bumpers-weight.check.ts`. Leave `material-audit.check.ts` untouched.

### Pitfall 3: Adding `getDocument` to `OnshapeClient` will break every existing success-path test unless stubbed

**What goes wrong:** `check.routes.test.ts` builds a fresh `Partial<OnshapeClient>` per test via `buildTestApp({...})` and force-casts it to `OnshapeClient` (`check.routes.test.ts:176`: `clientFactory: () => fakeClient as OnshapeClient`). There are **9 separate `buildTestApp(...)` call-sites** in this file. If `client.getDocument(...)` is called unconditionally in the route and a given test's fake client doesn't define `getDocument`, the call throws `TypeError: client.getDocument is not a function` at runtime, failing that test — even tests that have nothing to do with the header feature.

**How to avoid:** Add a `stubGetDocument()` helper (matching the existing `stubElements()`/`stubGetPartStudioMassProperties()` pattern at the top of the test file) and thread it into every `buildTestApp({...})` call that reaches the response-assembly step (i.e. every test that currently asserts on `res.body.verdicts` or `res.body.measuredContext`). Budget this as real, mechanical Wave 0 work — it touches most of the file, not just the "7→5 verdicts" assertion.

**Warning signs:** A wall of unrelated-looking test failures immediately after adding `getDocument` to the `OnshapeClient` interface, all with the same `is not a function` message.

### Pitfall 4: `rules/2026.json` is no longer `PLACEHOLDER` — CONTEXT.md's canonical-refs note is stale

**What goes wrong:** `04-CONTEXT.md:84` says "note the `limitStatus: PLACEHOLDER` values (R101=110in, R104=30in) are still unverified against the live 2026 Game Manual." The live file (`rules/2026.json`, read directly) shows `"limitStatus": "VERIFIED"` on all 4 rules, with a note citing "Team Update 22" — this was apparently resolved after CONTEXT.md was written (STATE.md's "Blockers/Concerns" section still lists the old unverified warning too, also stale).

**How to avoid:** Do not re-open the rule-limit-verification blocker as a Phase 4 task — it appears already closed. Flag to the user/planner as a state-doc cleanup opportunity (not a Phase 4 code task) rather than re-doing verification work.

### Pitfall 5: `PlumbingBanner` will read as false/contradictory once D-01 ships

**What goes wrong:** `main.tsx:87` unconditionally renders `<PlumbingBanner />` ("Plumbing proof — verdicts not yet trusted") inside the same `report` branch that will now show the trust-bar header. Once the two plumbing checks are retired and the panel is explicitly positioned as trustworthy (Phase 4's whole goal), this banner directly contradicts the page it sits on. CONTEXT.md's file list does not mention `PlumbingBanner.tsx`, so this is a genuine gap the planner should decide on explicitly (remove it, or repurpose its slot for something else) rather than silently leaving self-contradictory copy live.

**How to avoid:** Add an explicit task/decision point for `PlumbingBanner.tsx`'s disposition; don't assume silence in CONTEXT.md means "leave as-is" here, since its content is now factually wrong.

## Code Examples

### Growing `CheckReportContext` (panel-side type, `api.ts:51-55`)

```typescript
// Source: src/panel/api.ts — grow in place, keep documentId/workspaceId/elementId
// for backward compat (used by other future features), add 4 disclosure fields.
export interface CheckReportContext {
  documentId: string;
  workspaceId: string;
  elementId: string;
  /** Best-effort; undefined if the document-name lookup failed (Pattern 2). */
  documentName?: string;
  /** Free from getElementsInDocument; undefined only if Onshape omits it. */
  tabName?: string;
  /** Always "Default" in v1 — no named-configuration selection exists yet. */
  configurationName: string;
  /** Server-stamped ISO 8601 timestamp, same response object as verdicts. */
  checkedAt: string;
}
```

### Growing the server response (`check.routes.ts:342-345`)

```typescript
// Source: src/server/routes/check.routes.ts — the existing single-object-literal
// response; growing it in place preserves SC4 atomicity (no `await` between
// field assembly and `res.json`).
res.status(200).json({
  measuredContext: {
    documentId,
    workspaceId,
    elementId,
    documentName,               // from Pattern 2, may be undefined
    tabName: assembly.name,     // FREE — assembly already resolved above (line 80)
    configurationName: DEFAULT_CONFIGURATION_NAME, // "Default", Pattern 3
    checkedAt: new Date().toISOString(),           // stamped here, once
  },
  verdicts,
});
```

### `ReportTable.tsx` reason rendering (replaces the hardcoded UNKNOWN string)

```typescript
// Source: src/panel/components/ReportTable.tsx — replaces the UNKNOWN branch
// of renderMeasured(); relies on Pitfall 1's fix having been applied to
// robot-weight.check.ts / robot-bumpers-weight.check.ts so caveats[0] is
// always populated for a real UNKNOWN verdict.
function renderReason(verdict: CheckReportVerdict): string {
  if (verdict.caveats.length > 0) return verdict.caveats[0];
  // Defensive fallback only — should not fire once check-side fixes ship.
  return `not yet checkable${verdict.affectedPartCount ? ` — ${verdict.affectedPartCount} part(s) affected` : ""}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `UNKNOWN — N parts missing material` hardcoded panel string | Per-check `caveats[0]` plain-language reason | This phase (D-04) | Fixes 4 of 5 real UNKNOWN branches immediately; the remaining 2 (R103/R408) need a paired check-function fix (Pitfall 1). |
| 7 verdicts incl. 2 plumbing checks with a citation collision | 5 real checks, no collision | This phase (D-01) | Simplifies `main.tsx`'s perimeter-verdict lookup comment (`geometry` field selection was already collision-proof by design — no change needed there) and `check.routes.test.ts`'s verdict-count/collision assertions. |

**Deprecated/outdated:** `occurrenceCountCheck`/`frameTagPresenceCheck` (Phase 1 proof-of-plumbing) — retiring per D-01; `PlumbingBanner.tsx`'s copy is now stale (Pitfall 5).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `"Default"` is the correct literal to disclose as `configurationName` (rather than, e.g., leaving it blank or computing it some other way) | Pattern 3 | Low — this is directly derived from reading the code (no configuration is ever threaded), not from external/training knowledge; tagged as an assumption only because "what Onshape calls the unconfigured state in its own UI" (the exact word "Default") is asserted from general product familiarity with Onshape rather than a fetched API string. If wrong, it's a one-line string change, no structural risk. |

**If this table is empty:** N/A — see A1 above; all other claims are `[VERIFIED: code read]` or `[VERIFIED: onshape.d.ts, Onshape's own OpenAPI spec]`.

## Open Questions

1. **Should `PlumbingBanner.tsx` be removed or repurposed?**
   - What we know: Its copy ("verdicts not yet trusted") contradicts Phase 4's goal once D-01 ships; CONTEXT.md's file list doesn't mention it.
   - What's unclear: Whether the user wants it deleted outright, replaced with something else (e.g. a "beta" note), or kept for a different reason not captured in CONTEXT.md.
   - Recommendation: Planner should add an explicit task/decision for this file rather than leaving it untouched by omission.

2. **Should the retired check files (`occurrence-count.check.ts`, `frame-tag-presence.check.ts`) be deleted or left as dead code?**
   - What we know: D-01b explicitly defers this to "the planner's call."
   - What's unclear: No strong signal either way from the codebase's existing conventions (no other retired-code pattern exists yet to match).
   - Recommendation: Delete — the files have zero remaining callers once unregistered, and both have existing unit-test siblings that would also become dead weight; keeping unused code+tests around adds maintenance surface with no offsetting benefit for a small hobbyist-scale repo.

## Environment Availability

Skipped — this phase has no new external dependencies (no new packages, no new external services; the one new API call reuses the already-configured Onshape OAuth session and client factory pattern).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 |
| Config file | `vitest.config.ts` — **`include: ["src/**/*.test.ts"]` only, NOT `.tsx`** |
| Quick run command | `npm test -- check.routes` (or `npx vitest run src/server/routes/check.routes.test.ts`) |
| Full suite command | `npm test` |

**Important gap:** No `.tsx` test files exist anywhere in this repo, and the vitest config's glob would not pick them up even if added (`*.test.ts`, not `*.test.{ts,tsx}`) — and no `jsdom`/`@testing-library/react` devDependency is installed. This is a pre-existing, consistent project pattern (no React component ever gets a rendering test here, including `HullRender.tsx` and `ReportTable.tsx` today) — not a Phase-4-specific gap to fill. **Recommendation:** keep new panel-side logic (e.g. `renderReason()`) as a small, pure, exported function so it CAN be unit-tested at the plain `.test.ts` level if desired, without needing new test tooling. Do not scope "add jsdom + React Testing Library" into this phase unless the user explicitly asks — it's out of proportion for a light-polish phase.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RSLT-01 | 5 verdicts returned (not 7), each with rule/title/limit/status/caveats | unit (route) | `npx vitest run src/server/routes/check.routes.test.ts` | ✅ exists, needs edits (verdict count 7→5, remove R101-collision assertion) |
| RSLT-02 | UNKNOWN branches carry a self-contained reason in `caveats[0]` | unit (check fn) | `npx vitest run src/server/checks/robot-weight.check.test.ts src/server/checks/robot-bumpers-weight.check.test.ts` | ✅ exist, need new assertions on `caveats` content for the UNKNOWN branch |
| RSLT-03 | `measuredContext` carries documentName/tabName/configurationName/checkedAt | unit (route) | `npx vitest run src/server/routes/check.routes.test.ts` | ✅ exists, needs new assertions + `stubGetDocument()` helper (Pitfall 3) |

### Sampling Rate

- **Per task commit:** `npx vitest run <touched-file>.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `stubGetDocument()` helper in `check.routes.test.ts`, threaded into all 9 `buildTestApp(...)` call-sites that reach response assembly (Pitfall 3) — this is the largest mechanical piece of Wave 0 work in this phase.
- [ ] Update the existing "returns 7 verdicts" test → 5 verdicts, remove/rework the R101-collision-specific assertion (`check.routes.test.ts:238`).
- [ ] Add `caveats` content assertions to `robot-weight.check.test.ts` / `robot-bumpers-weight.check.test.ts`'s existing UNKNOWN-branch tests (confirm the new explicit reason string is present).

*(No new test framework or config change needed — existing Vitest setup covers all of this phase's testable surface once the above gaps are closed.)*

## Sources

### Primary (HIGH confidence — direct code/schema inspection this session)
- `src/server/onshape-client/client.ts` — existing client method idioms (typed-200 vs raw-fetch-cast), confirms no document-name-carrying call exists today
- `src/server/routes/check.routes.ts` — exact response-assembly location (lines 342-345), exact tab-name-already-free location (line 80), exact enrichment try/catch pattern to mirror (lines 304-317)
- `src/server/onshape-client/types/onshape.d.ts` — Onshape's own vendored OpenAPI spec: `operations["getDocument"]` (10909-10930, explicit 200), `BTDocumentInfo` (3813-3876, has `name`), `BTDocumentElementInfo` (3773-3791, no document name), `BTAssemblyPartsInfo` (3049-3061, `configuration` is per-element not per-assembly), `BTConfigurationInfo`/`getConfiguration` (3453-3456, 11341-11365, no display-name field at all)
- `src/server/checks/*.check.ts` (all 7 files) — exact `caveats[]` content per UNKNOWN/FAIL branch, verified line-by-line
- `src/panel/{api.ts,main.tsx,components/*.tsx}` — exact current panel state machine and render tree
- `src/server/routes/check.routes.test.ts` — exact test-fixture shape and call-site count for the `getDocument` stubbing gap
- `vitest.config.ts`, `package.json` — confirms no jsdom/RTL, confirms `.tsx` tests aren't even globbed

### Secondary (MEDIUM confidence)
- None needed — this phase's scope was fully answerable from the repo itself.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack decisions, everything already locked in CLAUDE.md
- Architecture: HIGH — every pattern cited is read directly from this repo's existing code
- Pitfalls: HIGH — every pitfall is a specific, line-cited, reproducible finding, not a general/training-data caution

**Research date:** 2026-07-11
**Valid until:** Stable — this research is scoped to this repo's own code, which only changes when this phase's plan executes. Re-research not needed unless the plan diverges significantly from what's documented here.

## RESEARCH COMPLETE

**Phase:** 4 - Trust-Bar Results Panel
**Confidence:** HIGH

### Key Findings
- Tab name is already free (`assembly.name` at `check.routes.ts:80`); document name needs exactly one new call (`getDocument`, `GET /api/documents/{did}`, clean-200 idiom like `getElementsInDocument`); configuration name needs zero calls — hardcode `"Default"` (no code path anywhere resolves a named Onshape Configuration; the concept is explicitly deferred).
- Server response is already a single-object-literal `res.json()` call — growing it in place gives atomicity "for free"; client-side clear-then-show-fresh (D-03) is **already fully implemented** by `main.tsx`'s existing discriminated-union state machine — no restructuring needed, only additive JSX.
- The real D-04/RSLT-02 gap is narrower and more specific than CONTEXT.md implies: `framePerimeterCheck` (3 branches) and `startingHeightCheck` (1 branch) already have complete, correct `caveats[0]` text — panel-only fix suffices there. `robotWeightCheck`/`robotBumpersWeightCheck`'s UNKNOWN branches do NOT carry a real reason in `caveats[]` (can be empty) — these two check files need an actual code change, not just a panel change.
- Adding `getDocument` to `OnshapeClient` will break ~9 existing test call-sites unless a `stubGetDocument()` helper is threaded through `check.routes.test.ts` — budget this as real Wave 0 work.
- `PlumbingBanner.tsx`'s copy will become factually contradictory once D-01 ships; not mentioned in CONTEXT.md's file list — flagged as an open question for the planner to explicitly resolve.
- `rules/2026.json` is already `VERIFIED` (not `PLACEHOLDER` as CONTEXT.md/STATE.md currently state) — that blocker appears already closed; don't re-open it as Phase 4 work.

### File Created
`/Users/shishirraj/CADChecker/.planning/phases/04-trust-bar-results-panel/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | No new stack decisions; everything locked in CLAUDE.md already |
| Architecture | HIGH | Every pattern cited is read directly from this repo's current code, with line numbers |
| Pitfalls | HIGH | Each pitfall is a specific, reproducible, line-cited code finding, not general guidance |

### Open Questions
1. `PlumbingBanner.tsx` disposition (remove/repurpose) — not covered by CONTEXT.md, now factually stale once D-01 ships.
2. Delete vs. leave-dead the two retired check files — D-01b explicitly left as planner's call; this research recommends delete (see Open Questions section above for rationale).

### Ready for Planning
Research complete. Planner can now create PLAN.md files.

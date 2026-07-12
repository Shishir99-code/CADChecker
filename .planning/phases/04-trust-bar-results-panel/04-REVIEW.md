---
phase: 04-trust-bar-results-panel
reviewed: 2026-07-12T03:00:45Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/panel/api.ts
  - src/panel/components/DisclosureHeader.tsx
  - src/panel/components/ReportTable.tsx
  - src/panel/main.tsx
  - src/server/checks/engine.test.ts
  - src/server/checks/robot-bumpers-weight.check.ts
  - src/server/checks/robot-weight.check.ts
  - src/server/onshape-client/client.ts
  - src/server/routes/check.routes.test.ts
  - src/server/routes/check.routes.ts
findings:
  critical: 1
  warning: 4
  info: 2
  total: 7
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-07-12T03:00:45Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the Phase 4 trust-bar results panel: the panel-side API wrapper and rendering components (`api.ts`, `main.tsx`, `ReportTable.tsx`, `DisclosureHeader.tsx`), the two weight checks (R103/R408), the typed Onshape client, and the `/api/check` route (plus its tests). The check logic itself is sound — I verified the weight checks compare pounds against `lb`-unit limits and the height check converts meters→inches against an `in`-unit limit, so there is no unit mismatch. Cross-referencing the route against `rules/2026.json`, `engine.ts`, `refresh.ts`, and `facts.ts` did surface real defects.

The highest-severity issue is client-side: `runCheck` only special-cases HTTP 401 and blindly casts every other non-2xx JSON body into a `CheckReport`. On a completely normal path — opening the panel on a document that has no assembly (route returns `404 {error}`) — the panel treats the error body as a report, then dereferences `report.measuredContext` (which is `undefined`) and crashes the React tree with no error boundary. Two correctness/robustness concerns follow: the enrichment join is keyed on `partId` alone (which is only unique per Part Studio, not per assembly), and the client-supplied `documentId`/`workspaceId` are interpolated raw into Onshape API paths despite a code comment claiming they are validated for that purpose.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `runCheck` treats non-401 error responses as a valid report, crashing the panel

**File:** `src/panel/api.ts:111-122` (with `src/panel/main.tsx:85-88` and `src/server/routes/check.routes.ts:84-86,113-116`)
**Issue:** `runCheck` only branches on `res.status === 401`; for any other non-2xx response it executes `(await res.json()) as CheckResult` and returns it. The route legitimately returns `404 { error: "No assembly found..." }` (check.routes.ts:85), `502 { error: "...no rootAssembly." }` (check.routes.ts:114), and `400 { error: ... }` (check.routes.ts:72). None of these satisfy `isReconnectSignal` (there is no `needsReconnect` key), so `main.tsx` falls into the `else` branch and sets `{ status: "report", report: { error: ... } }`. Rendering then evaluates `<DisclosureHeader context={checkState.report.measuredContext} />` with `measuredContext === undefined`, and `DisclosureHeader` immediately reads `context.documentName` (DisclosureHeader.tsx:22) → `TypeError: Cannot read properties of undefined`. There is no error boundary in `main.tsx`, so the whole panel unmounts to a blank screen. The 404 path is reachable in normal use: a user opening the panel on a document that only contains a Part Studio (no assembly yet) will hit it.
**Fix:** Reject non-OK statuses in `runCheck` before parsing, so `main.tsx`'s existing `catch` maps them to the `error` state:
```ts
export async function runCheck(documentId: string, workspaceId: string): Promise<CheckResult> {
  const res = await apiFetch("/api/check", {
    method: "POST",
    body: JSON.stringify({ documentId, workspaceId }),
  });

  if (res.status === 401) {
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    // 400/404/502/etc. carry { error } bodies, not a CheckReport.
    let message = `Check failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON body; keep the status-based message */
    }
    throw new Error(message);
  }

  return (await res.json()) as CheckResult;
}
```
(Alternatively, defensively guard the report shape in `main.tsx` before setting `status: "report"`.)

## Warnings

### WR-01: Enrichment join keyed on `partId` alone can misattribute mass/material/geometry across Part Studios

**File:** `src/server/routes/check.routes.ts:149-150,183-192,285,351-357` (with `src/server/traversal/facts.ts:6-52`)
**Issue:** `massByPartId`, `materialByPartId`, and `localCornersByPartId` are single global maps keyed by the CAD `partId` string, and the final enrichment joins back to facts via `massByPartId.get(f.partId)` etc. Onshape assigns `partId`s per Part Studio starting from the same seed (e.g. `JHD`, `JID`, `JGD`...), so the *same* `partId` string routinely recurs across different Part Studio elements in one assembly. When two groups (different `elementId`/`documentId`) contain the same `partId`, the second `set()` overwrites the first, and every fact with that `partId` — regardless of which studio it came from — receives the last-written mass/material/box. `Fact` (facts.ts) carries no `elementId`, so the join cannot disambiguate. This can silently produce wrong weight totals and wrong PASS/FAIL verdicts on real multi-Part-Studio robots. The existing tests never exercise a collision — `stubAssemblyDefinition`/`stubTwoOccurrenceAssembly` deliberately use globally distinct partIds (`JHD`/`GBX`/`REF`/`BRK`), masking this.
**Fix:** Key the enrichment maps and the fact join on a compound identity (`documentId::elementId::partId`), and thread that same compound key onto the `Fact` during `flattenAssembly` so the join is unambiguous. At minimum, add a regression fixture where two groups share a `partId` and assert each fact gets its own group's mass.

### WR-02: `documentId`/`workspaceId` interpolated raw into Onshape API paths despite comment claiming validation

**File:** `src/server/onshape-client/client.ts:163-166,190-193,221-224,253-256,284-287` (with `src/server/routes/check.routes.ts:24-27,66-75`)
**Issue:** `check.routes.ts` validates the request body with `z.object({ documentId: z.string().min(1), workspaceId: z.string().min(1) })` and the inline comment (lines 66-69) states this validates the shape "before using them in Onshape API path interpolation (T-01-12)." But `min(1)` imposes no character constraints, and `client.ts` interpolates these values directly into template-string URLs via `new URL(\`/api/assemblies/d/${documentId}/${wvm}/${wvmid}/e/${elementId}\`, base)` with no `encodeURIComponent`. A `documentId` such as `abc/e/otherElement` or `abc?foo=bar` restructures the request path/query against `cad.onshape.com` using the caller's OAuth token, letting the panel reach unintended Onshape API endpoints. (Impact is bounded because the token is the user's own session, so this is API path-injection rather than cross-tenant SSRF — but the documented mitigation is not actually enforced.) Note the two `openapi-fetch`-based methods (`getElementsInDocument`, `getDocument`) *are* safe because `params.path` encodes them; only the five raw-`fetch` methods are affected.
**Fix:** Constrain the ids to the real Onshape format in the schema, e.g. `z.string().regex(/^[0-9a-f]{24}$/i)`, and/or wrap each interpolated segment in `encodeURIComponent(...)` in `client.ts`. Prefer both (validate at the boundary, encode at the sink).

### WR-03: `ReportTable` detaches note rows from their verdicts and mislabels every note block "Missing material:"

**File:** `src/panel/components/ReportTable.tsx:99-129`
**Issue:** The notes are rendered in a *second* `verdicts.map` after the first, so all five verdict rows render, then all note rows render below them — a note is no longer visually adjacent to the rule row it explains. Worse, the notes block hard-codes the heading `<strong>Missing material:</strong>` (line 111) for *any* verdict with `affectedParts`. But `affectedParts` is populated by three different checks with three different meanings: MAT-AUDIT (genuinely missing material), the weight checks R103/R408 ("missing material **or unresolved mass**", robot-weight.check.ts:53), and `framePerimeterCheck` ("perimeter geometry could not be read", frame-perimeter.check.ts:71). Labeling an unreadable-geometry or unresolved-mass list as "Missing material" is factually wrong and will mislead a mentor triaging the result.
**Fix:** Interleave each note row directly under its verdict row (single map producing a fragment of `<tr>` + optional note `<tr>`), and derive the heading from the verdict (e.g. use `renderReason(verdict)` / the check's own `caveats[0]` as the label) instead of a fixed "Missing material:" string.

### WR-04: Best-effort `getDocument` sits between element re-derivation and the assembly fetch, but a slow/failed lookup still adds a serial round-trip to every check

**File:** `src/server/routes/check.routes.ts:97-112`
**Issue:** The document-name lookup (3b) is awaited serially before `getAssemblyDefinition` (4). It is correctly wrapped so non-401/non-reconnect failures are swallowed, but because it is `await`ed inline it adds a full sequential Onshape round-trip to the critical path of every check even though its result is purely cosmetic (a display name). It could run concurrently with the assembly-definition fetch instead. (Flagged as robustness/latency-of-correctness, not raw perf: the more important point is that a *hang* here — Onshape slow, no timeout — blocks the entire check on a cosmetic call.)
**Fix:** Kick off `getDocument` and `getAssemblyDefinition` together with `Promise.all` (keeping the name lookup's failure swallowed), or move the name resolution to run in parallel with the 5b/5c enrichment. Consider an explicit timeout so a cosmetic lookup can never stall a check.

## Info

### IN-01: `DisclosureHeader` renders "Invalid Date" for an unparseable timestamp

**File:** `src/panel/components/DisclosureHeader.tsx:24,39`
**Issue:** `new Date(context.checkedAt).toLocaleString()` yields the literal string `"Invalid Date"` if `checkedAt` is ever malformed. The server always stamps a valid ISO string today, so this is defensive only.
**Fix:** Guard with `Number.isNaN(d.getTime())` and fall back to the raw `checkedAt` string.

### IN-02: `window.top!` non-null assertion can throw in the sandboxed iframe

**File:** `src/panel/main.tsx:32`
**Issue:** `window.top!.location.href = "/auth/onshape"` uses a non-null assertion. In a cross-origin/sandboxed embedding, `window.top` navigation is generally permitted (writing location is allowed cross-origin), but if the frame is sandboxed without `allow-top-navigation`, the assignment throws inside the click handler with no user-visible feedback.
**Fix:** Wrap the navigation in a `try/catch` and surface a fallback message (or link) so a blocked top-navigation degrades gracefully instead of silently failing.

---

_Reviewed: 2026-07-12T03:00:45Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

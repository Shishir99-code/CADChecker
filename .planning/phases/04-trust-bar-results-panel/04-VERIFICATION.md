---
phase: 04-trust-bar-results-panel
verified: 2026-07-12T03:05:54Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "When a check request cannot complete for a legitimate server-side reason (no assembly found, malformed request, missing rootAssembly), the panel surfaces this state explicitly to the user rather than crashing to a blank screen"
    status: failed
    reason: "runCheck() in src/panel/api.ts only special-cases HTTP 401 (throws AuthRequiredError). Every other non-2xx response from POST /api/check -- 400 'documentId and workspaceId are required', 404 'No assembly found in the document.', 502 'Onshape returned an assembly definition with no rootAssembly.' -- is JSON-parsed and returned as-is, cast to CheckResult, with no status check. main.tsx's catch block (which maps errors to the 'error' UI state) is therefore never reached for these paths; checkState becomes { status: 'report', report: { error: '...' } }. The report branch then unconditionally renders <DisclosureHeader context={checkState.report.measuredContext} />, and DisclosureHeader.tsx immediately evaluates `context.documentName ?? context.documentId` -- since measuredContext is undefined on an error body, this throws `Cannot read properties of undefined (reading 'documentName')` (reproduced directly with node -e). There is no React error boundary anywhere in main.tsx, so the whole panel unmounts to a blank screen. The 404 path is reachable in ordinary use (a document containing only a Part Studio, no Assembly tab yet). This is the exact opposite of the phase goal's explicit promise that 'missing data [is] always surfaced rather than hidden' -- it is the one failure mode that hides everything instead of surfacing it. Documented by code review as CR-01 (04-REVIEW.md) and confirmed still present at HEAD (97262b2); no fix commit exists after the review."
    artifacts:
      - path: "src/panel/api.ts"
        issue: "runCheck (lines 111-122) only branches on res.status === 401; every other non-ok status is JSON-parsed and returned unchecked as a CheckResult"
      - path: "src/panel/main.tsx"
        issue: "the report branch (lines 85-102) renders DisclosureHeader/ReportTable unconditionally, assuming checkState.report is always a well-formed CheckReport; no defensive guard, no error boundary"
      - path: "src/panel/components/DisclosureHeader.tsx"
        issue: "line 22 dereferences context.documentName without guarding against context being undefined, which is exactly what an error-shaped report body produces"
    missing:
      - "runCheck must reject non-ok, non-401 responses (throw an Error carrying the server's {error} message) so main.tsx's existing catch already routes them into the 'error' UI state instead of the 'report' state"
      - "A regression test exercising a 404 (no-assembly) or 502 (no-rootAssembly) /api/check response end-to-end through runCheck (and ideally through App's state machine) confirming the panel shows the error message, not a crash -- currently zero panel-side tests exist (no *.test.ts under src/panel)"
---

# Phase 4: Trust-Bar Results Panel Verification Report

**Phase Goal:** A team can hand the CADChecker panel to a lead mentor or inspector and have every verdict stand on its own — citing the exact rule, the limit, the measured value, and precisely what document/tab/configuration/timestamp it reflects, with missing data always surfaced rather than hidden.
**Verified:** 2026-07-12T03:05:54Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every check in the results panel shows pass/fail (or non-pass state) alongside rule number, title, season limit, and measured value, for all checks shipped in Phases 1-3 (Roadmap SC1 / RSLT-01) | ✓ VERIFIED | `ReportTable.tsx` has a dedicated `<th>Limit</th>` column and `renderLimit(verdict)` rendered in every row's `<td>` (lines 69, 81, 35-40); `buildEngine()` in `check.routes.ts` registers exactly the 5 real checks (materialAuditCheck, robotWeightCheck, robotBumpersWeightCheck, framePerimeterCheck, startingHeightCheck); `check.routes.test.ts:222` asserts `res.body.verdicts` has length 5, and `:248` asserts exactly one verdict cites R101 (collision resolved). `npm test` 86/86 passing, `npm run build` exits 0. |
| 2 | Any check that cannot run for any reason shows an explicit "not yet checkable" state with a plain-language reason — never a silent pass, never a blank row (Roadmap SC2 / RSLT-02) | ✓ VERIFIED | `robot-weight.check.ts`/`robot-bumpers-weight.check.ts` UNKNOWN branches prepend `"${untrusted.length} part(s) have missing material or unresolved mass — see affected parts"` as `caveats[0]` (confirmed in source). `ReportTable.tsx`'s badge and Measured cell both read "NOT YET CHECKABLE" (never the old hardcoded "N parts missing material" string) for `status === "UNKNOWN"`; `renderReason()` surfaces `caveats[0]` in the notes row. Minor caveat: the *separate* affectedParts notes block still hard-codes the heading `"Missing material:"` regardless of which check produced the list (WR-03, not fixed) — mislabels R101/R103/R408's affected-parts reasons, but the accurate `caveats[0]` text still renders alongside it in the same row, so the reason is not hidden, only accompanied by an imprecise heading. Tracked as a warning, not a truth failure. |
| 3 | Every verdict on the panel discloses the document, tab/element, configuration, and timestamp it was measured against (Roadmap SC3 / RSLT-03) | ✓ VERIFIED | `measuredContext` in `check.routes.ts` (lines 371-379) carries `documentId/workspaceId/elementId/documentName/tabName/configurationName/checkedAt`; `client.ts` implements `getDocument` via the clean-200 `client.GET("/api/documents/{did}", ...)` idiom; `DisclosureHeader.tsx` renders all four human-readable fields with id fallbacks. `check.routes.test.ts:223-230` asserts the 4 new fields including `checkedAt: expect.any(String)`. |
| 4 | Re-running "check now" after a CAD edit updates all four disclosure fields together — no mismatched old-geometry/new-timestamp combination is possible (Roadmap SC4) | ✓ VERIFIED | All 4 disclosure fields and `verdicts` are assembled in the *same* object literal passed to `res.status(200).json({...})` (check.routes.ts:370-381) with no intervening `await` — response is atomic by construction. `main.tsx` renders `DisclosureHeader` and `ReportTable` as siblings inside the single `status === "report"` branch, and the `loading` state fully replaces `checkState` before a new report lands, so no partial swap is client-reachable. |
| 5 | Missing/unavailable data is always surfaced to the user, never hidden behind a crash (derived from the phase goal's explicit "with missing data always surfaced rather than hidden" clause) | ✗ FAILED | See gaps section above (CR-01). `runCheck()` only special-cases HTTP 401; a 404 (no assembly in document), 502 (no rootAssembly), or 400 (malformed body) response is parsed and returned as a `CheckResult`, then rendered by `DisclosureHeader` which dereferences `context.documentName` on an `undefined` `measuredContext` — an uncaught `TypeError` with no error boundary, crashing the entire panel to a blank screen. Reproduced the throw directly (`node -e`) and confirmed no fix commit exists after 04-REVIEW.md documented this as CR-01 (git HEAD `97262b2`, review at `97262b2`, zero panel-side tests exist to have caught it). |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/checks/robot-weight.check.ts` | UNKNOWN branch pushes explicit `caveats[0]` reason | ✓ VERIFIED | Contains `"missing material or unresolved mass"`, prepended before existing tag notes |
| `src/server/checks/robot-bumpers-weight.check.ts` | Same, mirrored | ✓ VERIFIED | Identical idiom confirmed |
| `src/panel/components/ReportTable.tsx` | `renderReason()` + "NOT YET CHECKABLE" relabel | ✓ VERIFIED | Both present; badge and Measured cell both relabeled |
| `src/panel/components/ReportTable.tsx` | Limit column + `renderLimit()` for every row | ✓ VERIFIED | `<th>Limit</th>` + per-row `<td>{renderLimit(verdict)}</td>`; em-dash fallback for non-finite limit |
| `src/server/routes/check.routes.ts` | `buildEngine()` registers exactly 5 real checks | ✓ VERIFIED | 2 plumbing checks unregistered and their source files deleted |
| `src/server/checks/occurrence-count.check.ts`, `frame-tag-presence.check.ts`, `src/panel/components/PlumbingBanner.tsx` | Deleted | ✓ VERIFIED | `ls` confirms all three files no longer exist; `grep -rn "PlumbingBanner\|occurrenceCountCheck\|frameTagPresenceCheck"` returns no matches in relevant dirs |
| `src/server/onshape-client/client.ts` | `getDocument(documentId)` + `DocumentInfo` alias | ✓ VERIFIED | Clean-200 idiom, matches `getElementsInDocument` pattern |
| `src/server/routes/check.routes.ts` | `DEFAULT_CONFIGURATION_NAME` + grown `measuredContext` | ✓ VERIFIED | Constant present; `measuredContext` has 7 fields, single atomic object literal |
| `src/panel/api.ts` | `CheckReportContext` grown with 4 disclosure fields | ✓ VERIFIED | `documentName?`, `tabName?`, `configurationName`, `checkedAt` all present with doc comments |
| `src/panel/components/DisclosureHeader.tsx` | Measured-against header block | ✓ VERIFIED | Renders all 4 fields, inline styles only, no `dangerouslySetInnerHTML` |
| `src/panel/api.ts` | `runCheck` correctly discriminates all non-2xx responses, not just 401 | ✗ STUB (behavioral gap) | Only 401 is special-cased; see gap #1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `ReportTable.tsx` | `verdict.limit`/`verdict.unit` | `renderLimit()` in every row | ✓ WIRED | Confirmed rendered per-row |
| `ReportTable.tsx` | `verdict.caveats` | `renderReason()` reads `caveats[0]` | ✓ WIRED | Confirmed in notes-row block |
| `check.routes.ts` | `engine.runAll` | `buildEngine()` registers 5 checks | ✓ WIRED | Confirmed, test asserts 5 verdicts |
| `check.routes.ts` | `client.getDocument` | best-effort resolution before response assembly | ✓ WIRED | Confirmed step 3b, try/catch discipline matches 5b/5c/5d |
| `main.tsx` | `DisclosureHeader.tsx` | renders from `checkState.report.measuredContext` in report branch | ✓ WIRED | Confirmed, but see gap: this wiring assumes `report` is always well-formed, which is false on non-401 error paths |
| `DisclosureHeader.tsx` | `measuredContext.checkedAt` | renders document/tab/config/timestamp | ✓ WIRED | Confirmed |
| `src/panel/api.ts` (`runCheck`) | `main.tsx` error state | non-2xx/non-401 responses routed to `catch` → `error` state | ✗ NOT WIRED | `runCheck` never throws for 400/404/502; `main.tsx`'s `catch` block is unreachable for these statuses (CR-01) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm test` | 16 test files, 86 tests, all passed | ✓ PASS |
| Panel + server build | `npm run build` | `tsc -p tsconfig.server.json && vite build` exits 0 | ✓ PASS |
| Retired plumbing checks have no stale references | `grep -rn "occurrenceCountCheck\|frameTagPresenceCheck" src/server/routes src/server/checks/engine.ts src/server/checks/engine.test.ts` | `NO_STALE_REFS` | ✓ PASS |
| Deleted files absent | `ls occurrence-count.check.ts frame-tag-presence.check.ts PlumbingBanner.tsx` | all three "No such file" | ✓ PASS |
| DisclosureHeader crashes on undefined context (CR-01 reproduction) | `node -e` simulating `context.documentName ?? context.documentId` on `context = undefined` | `THROWS: Cannot read properties of undefined (reading 'documentName')` | ✗ FAIL (confirms gap #1) |
| `runCheck` rejects non-401 error statuses | `grep -n "res.status" src/panel/api.ts` | Only `res.status === 401` checked; no `res.ok` guard | ✗ FAIL (confirms gap #1) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RSLT-01 | 04-01 | Panel lists each check as pass/fail, citing rule/title/limit/measured value | ✓ SATISFIED | Limit column + 5 real checks confirmed above |
| RSLT-02 | 04-01 | Checks that cannot run show explicit "not yet checkable" state, never silent pass | ✓ SATISFIED (with WR-03 caveat noted) | UNKNOWN badge/reason relabel confirmed; per-check reason accurate via `caveats[0]` even though a secondary heading is imprecise |
| RSLT-03 | 04-02 | Every verdict shows document/tab/configuration/timestamp | ✓ SATISFIED | `measuredContext`/`DisclosureHeader` confirmed |

No orphaned requirements: REQUIREMENTS.md's Phase 4 row (RSLT-01/02/03) matches exactly what both plans declared in frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/panel/api.ts` | 111-122 | `runCheck` only special-cases HTTP 401; all other non-2xx bodies parsed as a valid report | 🛑 Blocker | Crashes the panel to a blank screen on ordinary 404/502/400 paths (CR-01) — see gap #1 |
| `src/panel/components/ReportTable.tsx` | 99-129, esp. 111 | Notes block hard-codes `"Missing material:"` heading for any verdict with `affectedParts`, regardless of which check (weight/perimeter/material-audit) produced the list | ⚠️ Warning | Mislabels R103/R408 (unresolved mass) and R101 (unreadable geometry) affected-parts lists as material issues; the accurate reason still renders via `caveats[0]` in the same block, so data isn't hidden, only imprecisely headed (04-REVIEW.md WR-03, unresolved) |
| `src/server/onshape-client/client.ts` | 163-166, 190-193, 221-224, 253-256, 284-287 | `documentId`/`workspaceId` interpolated raw into URL template strings without `encodeURIComponent`, despite a code comment claiming validation covers this | ⚠️ Warning | Pre-existing (not introduced by Phase 4), but the getDocument call added by this phase reuses the same client and the comment it partially relies on (T-01-12) remains unenforced (04-REVIEW.md WR-02, unresolved) |
| `src/server/routes/check.routes.ts` | 97-112 | Best-effort `getDocument` call awaited serially before `getAssemblyDefinition`, adding a full round-trip to every check's critical path for a cosmetic name | ⚠️ Warning | Latency/availability risk if Onshape's document-name endpoint is slow — no timeout (04-REVIEW.md WR-04, unresolved) |
| `src/panel/components/DisclosureHeader.tsx` | 24, 39 | `new Date(context.checkedAt).toLocaleString()` renders literal `"Invalid Date"` if `checkedAt` is malformed | ℹ️ Info | Defensive-only; server always stamps a valid ISO string today (04-REVIEW.md IN-01) |
| `src/panel/main.tsx` | 32 | `window.top!.location.href = ...` non-null assertion could throw in a sandboxed iframe without `allow-top-navigation` | ℹ️ Info | Pre-existing from Phase 1; unrelated to this phase's scope (04-REVIEW.md IN-02) |

Note: WR-01 (enrichment join keyed on `partId` alone, risking cross-Part-Studio mass/material misattribution) is a Phase 2/3-era correctness concern in the same route file touched by this phase's Task 1 (04-02), but the collision logic itself was not introduced or modified by Phase 4's plans — flagged here for visibility only, not counted against this phase's must-haves.

### Human Verification Required

None. All must-haves in this phase are resolvable from static code inspection, automated tests, and direct reproduction (the CR-01 crash was reproduced programmatically, not inferred). No visual/UX/external-service items require a human check for this phase's specific deliverables.

### Gaps Summary

Both plans' stated tasks were executed largely as written and are individually well-built: the season-limit column renders for all 5 real checks, both weight checks now emit honest self-contained UNKNOWN reasons, the plumbing checks and banner are fully retired, and the four-field "measured against" disclosure header is genuinely atomic with the verdict table on every check and re-check. `npm test` (86/86) and `npm run build` both pass, and I found no debt markers (TBD/FIXME/XXX) in any file this phase touched.

However, the phase's own stated goal makes an explicit, load-bearing promise: "missing data always surfaced rather than hidden." The code review (04-REVIEW.md) found a critical, reachable defect — CR-01 — that is the literal opposite of that promise: on a completely ordinary path (opening the panel on a document with no Assembly tab yet, or any other non-401 failure the route legitimately returns), the panel does not surface an error message; it crashes to a blank screen with an uncaught `TypeError`, because `runCheck()` only recognizes HTTP 401 as an error and blindly treats every other status's JSON body as a valid report. I independently re-verified this defect against the current codebase (not just trusting the review) and confirmed: (1) `runCheck` in `src/panel/api.ts` still has no `res.ok` guard, (2) `main.tsx` still renders `DisclosureHeader`/`ReportTable` unconditionally in the `report` branch with no defensive check or error boundary, (3) `DisclosureHeader.tsx` still dereferences `context.documentName` unguarded, and (4) reproduced the resulting `TypeError` directly. No commit exists after the review (`97262b2`, HEAD) that addresses it, and there are zero panel-side tests (`src/panel/*.test.ts`) that could have caught it.

Because this defect directly contradicts the phase's central trust claim — and because a blank-screen crash is strictly worse for an inspector-facing "trust bar" than the old plumbing-check dishonesty this phase set out to fix — this is classified as a BLOCKER, not a warning, despite the review itself scoring it as a single critical among otherwise clean work. RSLT-01/02/03 as literally worded are satisfied; the phase's overarching goal is not, until CR-01 is fixed.

**Recommended fix (already specified in 04-REVIEW.md):** make `runCheck` reject any non-ok, non-401 response by throwing an `Error` (extracting the server's `{error}` message when present) so `main.tsx`'s existing `catch` block — which already correctly routes unexpected errors to the `error` UI state — handles it, with no new state machine needed. Add a regression test exercising the 404/502 paths end-to-end.

---

*Verified: 2026-07-12T03:05:54Z*
*Verifier: Claude (gsd-verifier)*

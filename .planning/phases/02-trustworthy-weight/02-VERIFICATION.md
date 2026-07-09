---
phase: 02-trustworthy-weight
verified: 2026-07-09T20:07:45Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none (initial verification)
---

# Phase 2: Trustworthy Weight Verification Report

**Phase Goal:** A team sees a robot weight verdict they can actually trust — because CADChecker first audits every part for a missing/default material (the #1 cause of CAD weight silently diverging from the real robot) and refuses to report a confident pass/fail until that's accounted for.
**Verified:** 2026-07-09T20:07:45Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + trust-critical invariants)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees a material-audit result listing every part with a default/unset material — the exact set Onshape would otherwise silently omit (SC1, WGHT-01) | VERIFIED | `src/server/checks/material-audit.check.ts` filters non-`BATTERY_` facts to `materialAssigned === false`, returns `affectedParts` (name+path) not a bare count (D-08); registered in `buildEngine()` (`check.routes.ts:36`); `ReportTable.tsx` renders the offending-parts list under any verdict row. `material-audit.check.test.ts` (5 tests) passes. |
| 2 | If any part is missing material, the weight check reports UNKNOWN with the affected part count — never a confident numeric pass/fail on incomplete data (SC2, WGHT-02) | VERIFIED | Both `robot-weight.check.ts` and `robot-bumpers-weight.check.ts` compute `untrusted = included.filter(f => f.materialAssigned === false || f.massKg === undefined)`; when non-empty, return `status: "UNKNOWN"` with **no `measured` field at all** (not just zeroed) plus `affectedPartCount`/`affectedParts`. Confirmed by `robot-weight.check.test.ts` ("returns UNKNOWN with affectedParts...") and the integrity-gate test (materialed-but-unresolved-mass part still routes to UNKNOWN). |
| 3 | Once all parts have material assigned, user sees a robot-weight verdict (R103, excluding bumpers/battery) from an occurrence-filtered mass query, vs season limit (SC3, WGHT-03) | VERIFIED | `robot-weight.check.ts`: `included = facts.filter(f => !name.startsWith("BUMPER_") && !name.startsWith("BATTERY_"))`, sums `massKg`, `totalLb = totalKg * KG_TO_LB`, `status = passesOperator(entry, totalLb)`, entry read via `config.rules.find(r => r.rule === "R103")` (not a literal). `rules/2026.json` R103 `unit: "lb"` confirmed. |
| 4 | User separately sees a robot+bumpers weight verdict (R408) from a distinctly-filtered occurrence query — not the same number relabeled (SC4, WGHT-04) | VERIFIED | `robot-bumpers-weight.check.ts` independently filters `included = facts.filter(f => !name.startsWith("BATTERY_"))` (bumpers included) and independently sums/converts/gates — it does not derive from or subtract R103's result. `robot-bumpers-weight.check.test.ts` explicitly proves `R408.measured.kg === R103.measured.kg + bumperMass` over the same facts, and per-verdict isolation both directions (BUMPER_ missing-material flips R408 to UNKNOWN but leaves R103 computable, and vice versa is structurally impossible since R103 excludes bumpers). |
| 5 | UNRESOLVED (cross-doc 403) routes to UNKNOWN, never silent 0 kg (trust-critical invariant, contract F3) | VERIFIED | `check.routes.ts` merge: on any non-401/non-ReconnectRequiredError catch (e.g. 403 on an unreadable referenced document) the group's parts are left out of `massByPartId`/`materialByPartId` entirely — `Map.get` miss yields `undefined`, never `0`/`false`. `robot-weight.check.ts`'s untrusted-gate disjunct `massKg === undefined` catches this even though `materialAssigned` is also `undefined` (not `false`) for such a part. Proven end-to-end by `check.routes.test.ts` "merges mass/material per-group... degrades gracefully on a referenced-document 403" — asserts `massKg === undefined` AND `materialAssigned === undefined` for the 403'd part, and the route still returns 200. |
| 6 | R103/R408 are independently-filtered occurrence computations, not one relabeled number (WGHT-04/D-05) | VERIFIED | Two structurally separate `CheckFn` files with independent `included` filter predicates, independent `untrusted` gates, independent `totalKg`/`totalLb` reduces — no shared intermediate value or subtraction between them. Confirmed by dedicated distinctness test (see #4). |
| 7 | Weight is canonical kg, rendered `<lb> lb (<kg> kg)` via a single `KG_TO_LB` constant; rules/2026.json R103/R408 unit is `lb` | VERIFIED | `KG_TO_LB = 2.20462` exported once from `engine.ts`; both weight checks import it (no other file redefines the ratio — confirmed via `grep -rn KG_TO_LB src/`). `ReportTable.tsx` renders `` `${measured.lb.toFixed(1)} lb (${measured.kg.toFixed(1)} kg)` ``. `rules/2026.json` R103 and R408 both show `"unit": "lb"`. |
| 8 | Per-group mass merge selects w/{workspaceId} for the assembly's own document and v/{documentVersion} (m/{microversion} fallback) for referenced documents; one unreadable referenced group does not fail the whole /api/check | VERIFIED | `check.routes.ts` lines 118-176: `groupPartsByElement`, per-group `if (groupDocumentId === assemblyDocumentId) wvm="w" ... else if (documentVersion) wvm="v" ... else if (documentMicroversion) wvm="m" ... else skip`. Each group's fetch pair wrapped in its own try/catch; 401/ReconnectRequiredError re-thrown, all else swallowed and `continue`s to the next group. `check.routes.test.ts` proves the route returns 200 when the referenced group 403s, and asserts the exact `getPartStudioMassProperties`/`getPartsMetadata` call args per group (`"w"`/workspaceId for same-doc, `"v"`/documentVersion for referenced). |
| 9 | The breaking tri-state Verdict change keeps `npm run build` and `npm test` green across Phase-1 checks and the panel | VERIFIED | `occurrence-count.check.ts` and `frame-tag-presence.check.ts` migrated to `status`/`measuredCount`/`caveats: []`; `panel/api.ts` `CheckReportVerdict` mirrors the extended shape field-for-field; `ReportTable.tsx` renders tri-state. `npm run build` exits 0; `npx vitest run` → 61/61 tests passing across 12 files (ran independently during this verification, not just per SUMMARY claim). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/server/onshape-client/client.ts` | `getPartStudioMassProperties` + `getPartsMetadata`, `callWithRefresh`-wrapped | VERIFIED | Both methods present on interface (lines 90-104) and implemented in factory (lines 165-221), each `callWithRefresh`-wrapped, `partId` fan-out, `configuration` param, `OnshapeApiError` on non-2xx. |
| `src/server/onshape-client/client.test.ts` | Unit coverage for the two client methods | VERIFIED | 6 tests pass (`npx vitest run src/server/onshape-client/client.test.ts`). |
| `02-MASS-PROPERTIES-CONTRACT.md` | Live-verified merge-step contract | VERIFIED | States nominal index `mass[0]`, SI-kg unit, `definition.parts[]→partId` join key, material-absence rule, plus F1-F4 findings; explicitly marked "CONFIRMED against live Onshape documents on 2026-07-09". |
| `src/server/checks/engine.ts` | Tri-state Verdict + `KG_TO_LB` | VERIFIED | `status: "PASS"\|"FAIL"\|"UNKNOWN"`, optional `measured{lb,kg}`, `measuredCount`, `affectedPartCount`/`affectedParts`, `caveats: string[]`, `KG_TO_LB = 2.20462`. |
| `src/server/traversal/facts.ts` | `Fact.massKg` + `Fact.materialAssigned` | VERIFIED | Both optional, documented `undefined` = UNRESOLVED (never 0/false). |
| `src/server/traversal/flatten-assembly.ts` | `groupPartsByElement` + `AssemblyDefinition.parts[]` w/ cross-doc fields | VERIFIED | `AssemblyPartInfo` carries `documentVersion`/`documentMicroversion`/`isStandardContent`; `groupPartsByElement` groups by `documentId:elementId`, preserves full entries. |
| `src/server/checks/material-audit.check.ts` | `materialAuditCheck` pure CheckFn (WGHT-01) | VERIFIED | Excludes `BATTERY_`, strict `materialAssigned === false` filter, full `affectedParts` list; 5/5 behavior tests pass. |
| `src/server/checks/robot-weight.check.ts` | `robotWeightCheck` (R103) | VERIFIED | 70 lines (> min_lines 30); excludes BUMPER_+BATTERY_; per-verdict UNKNOWN gate; 7/7 tests pass. |
| `src/server/checks/robot-bumpers-weight.check.ts` | `robotBumpersWeightCheck` (R408) | VERIFIED | 61 lines (> min_lines 25); excludes only BATTERY_; 5/5 tests pass, including the R408≠R103 distinctness proof. |
| `rules/2026.json` | R103/R408 `unit` corrected to `lb` | VERIFIED | Both entries show `"unit": "lb"`; limits (115/135) and `limitStatus: "PLACEHOLDER"` untouched, matching plan scope. |
| `src/panel/api.ts` | `CheckReportVerdict` mirrored to extended Verdict | VERIFIED | Field-for-field match with backend `Verdict`. |
| `src/panel/components/ReportTable.tsx` | Tri-state render + affectedParts list | VERIFIED | `renderMeasured()` suppresses the number entirely for UNKNOWN (`"UNKNOWN — N parts missing material"`); PASS/FAIL/UNKNOWN badge colors; offending-parts list + caveats rendered below each row. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `check.routes.ts` | `client.ts` (`getPartStudioMassProperties`/`getPartsMetadata`) | per-group wvm-selected mass+material fetch | WIRED | Called per distinct `documentId:elementId` group with server-derived args (never `req.body`); confirmed by `check.routes.test.ts` call-argument assertions. |
| `check.routes.ts` | `enrichedFacts` | per-group merge before `engine.runAll` | WIRED | `enrichedFacts = facts.map(f => ({...f, massKg: massByPartId.get(f.partId), materialAssigned: materialByPartId.get(f.partId)}))`; passed to `engine.runAll(enrichedFacts, config)` (not raw `facts`). |
| `material-audit.check.ts` | `Fact.materialAssigned` | filter facts missing material | WIRED | `weightContributing.filter(f => f.materialAssigned === false)`. |
| `ReportTable.tsx` | `verdict.affectedParts` | render offending-parts list | WIRED | `verdict.affectedParts?.map(part => <li>...)`. |
| `check.routes.ts` (buildEngine) | `robotWeightCheck`, `robotBumpersWeightCheck` | `engine.register(...)` | WIRED | Both registrations present (`check.routes.ts:37-38`); `check.routes.test.ts` asserts 5 verdicts returned including `R103`/`R408`/`MAT-AUDIT` rule ids. |
| `robot-weight.check.ts` / `robot-bumpers-weight.check.ts` | `engine.ts` | import `passesOperator`, `KG_TO_LB` | WIRED | No re-derivation of the conversion ratio anywhere else in `src/`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `robotWeightCheck`/`robotBumpersWeightCheck` | `enrichedFacts[].massKg`/`materialAssigned` | Live Onshape `getPartStudioMassProperties`/`getPartsMetadata` calls merged in `check.routes.ts`, addressed per-group with real `w`/`v`/`m` ids derived from the server-fetched assembly definition | Yes | FLOWING — confirmed both by unit-level reasoning (no static/empty fallback exists in the merge path) and by the live-verified `02-MASS-PROPERTIES-CONTRACT.md`, which documents this exact chain was run against two real Onshape documents (Team 1678's public robot, a user-owned robot) on 2026-07-09. |
| `materialAuditCheck` | `affectedParts` | Same `enrichedFacts` path | Yes | FLOWING — same source as above; no separate/duplicated traversal. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (includes 3 new check files + updated route/engine tests) | `npx vitest run` | 12 files, 61 tests passed | PASS |
| Production build (server tsc + panel vite build) | `npm run build` | tsc clean, vite build succeeded | PASS |
| ESLint on phase-touched check/route files | `npx eslint src/server/checks/robot-weight.check.ts src/server/checks/robot-bumpers-weight.check.ts src/server/checks/material-audit.check.ts src/server/routes/check.routes.ts` | No output (clean) | PASS |
| `rules/2026.json` unit fix | `grep -n '"unit": "lb"' rules/2026.json` | 2 matches (R103, R408) | PASS |
| `buildEngine()` registrations | `grep -nE 'register\(robot(Bumpers)?WeightCheck\)' src/server/routes/check.routes.ts` | Both present | PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` convention or declared probes found for this phase. The phase's live-verification step (02-01 Task 2) was a human-run spike script (`scripts/spike-mass-properties.ts`), not an automated probe; its output is recorded as ground truth in `02-MASS-PROPERTIES-CONTRACT.md` and was reviewed directly (not re-executed, since it requires a live OAuth session and a specific external Onshape document).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WGHT-01 | 02-01, 02-02 | Material-default audit flags parts that would be silently omitted from mass total | SATISFIED | `material-audit.check.ts` + registration + 5 passing tests. |
| WGHT-02 | 02-03 | Weight verdict gated on material audit — UNKNOWN (with count) when parts missing material, never a confident pass/fail | SATISFIED | Per-verdict `untrusted` gate in both weight checks; UNKNOWN suppresses `measured` entirely; proven by tests + `ReportTable.tsx` rendering. |
| WGHT-03 | 02-03 | Robot-weight check (R103) excluding bumpers/battery, occurrence-filtered mass query, vs season limit | SATISFIED | `robot-weight.check.ts`; config-driven limit/unit/title; `rules/2026.json` unit=lb. |
| WGHT-04 | 02-03 | Robot+bumpers weight check (R408), separately-filtered mass query | SATISFIED | `robot-bumpers-weight.check.ts`; distinctness proven by dedicated test (`R408.kg === R103.kg + bumperMass`). |

REQUIREMENTS.md confirms all four as `Complete` under Phase 2 (lines 95-98); no orphaned Phase-2 requirement IDs found beyond these four.

### Anti-Patterns Found

None. Scanned every file modified across 02-01/02-02/02-03 (`client.ts`, `engine.ts`, `facts.ts`, `flatten-assembly.ts`, `material-audit.check.ts`, `robot-weight.check.ts`, `robot-bumpers-weight.check.ts`, `check.routes.ts`, `panel/api.ts`, `ReportTable.tsx`, `rules/2026.json`) for `TBD|FIXME|XXX|TODO|HACK` — zero matches. No placeholder returns, no empty handlers, no hardcoded-empty props feeding the render path. `rules/2026.json`'s `PLACEHOLDER` limitStatus values are a pre-existing, explicitly-tracked, out-of-scope-for-this-phase item (Game Manual number verification, not a code debt marker) — documented in `02-03-SUMMARY.md`'s "Next Phase Readiness" and not part of this phase's success criteria (D-03 only covered the `unit` field fix, which is done).

One informational note: `scripts/spike-mass-properties.ts` was planned as "throwaway... delete after" but was intentionally kept through phase completion per 02-01-SUMMARY.md's documented deviation (useful for 02-02/02-03 troubleshooting); it lives outside `src/` and is excluded from the server build (`tsconfig.server.json` only includes `src/server`), so it carries no runtime/trust risk. Not flagged as a gap.

### Human Verification Required

None. All observable truths for this phase are mechanically verifiable via unit/integration tests (pure `CheckFn`s, a mocked-client route test proving the exact per-group wvm selection and 403 degradation) and the phase's one blocking human-verify checkpoint (02-01 Task 2, live contract confirmation) was already completed and recorded prior to this verification pass. No PLAN.md in this phase contains a deferred `<human-check>` block on an `auto` task.

### Gaps Summary

No gaps. All 9 derived observable truths (roadmap Success Criteria 1-4 plus the phase's explicitly named trust-critical invariants: UNRESOLVED routing, per-verdict independent filtering, canonical-kg/single-KG_TO_LB rendering, and per-group cross-document addressing with graceful degradation) are verified against actual source code, not SUMMARY.md narrative. `npm run build` and `npx vitest run` were re-executed independently during this verification (not taken on SUMMARY's word) and both pass (61/61 tests, 12 files). All four requirement IDs (WGHT-01..04) are accounted for in REQUIREMENTS.md with no orphans.

---

_Verified: 2026-07-09T20:07:45Z_
_Verifier: Claude (gsd-verifier)_

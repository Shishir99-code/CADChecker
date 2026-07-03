# Phase 2: Trustworthy Weight — Plan Outline

**Mode:** MVP (thin vertical slices — enriched fact → check → verdict rendered into existing panel rows)
**Generated:** 2026-07-02 (chunked outline)

## Slicing rationale

1. **02-01 goes first** because the entire phase rests on two unverified live-response assumptions (RESEARCH A1/A2, Open Questions 1–2): whether `BTMassPropertiesInfo.mass[0]` is the correct nominal-kg index and whether raw REST mass is always SI kg. Adding the two typed client methods and proving them against a real Onshape document (with at least one unmaterialized part) de-risks every downstream merge/compute plan before any production math is written. Blocking `checkpoint:human-verify`.
2. **02-02 lands the breaking `Verdict` extension as one coherent slice** (per pattern-map flag). Extending `Verdict` to tri-state + dual lb/kg + caveats + affectedParts ripples into Phase 1's `occurrence-count.check.ts` / `frame-tag-presence.check.ts` AND the panel's mirrored `CheckReportVerdict` (`src/panel/api.ts`) + `ReportTable.tsx`. Those consumer updates travel with the shape change so the build stays green. The slice pays off as user-visible value by shipping the **material audit** (WGHT-01) as the first check rendered through the new shape — the enrichment merge (mass + material per Part Studio) is wired here, and after this plan a user can click "check now" and see the exact parts missing material.
3. **02-03 delivers the two trustworthy weight verdicts** on top of the now-enriched facts and extended verdict shape: R103 (robot-only) and R408 (robot+bumpers), each independently filtered (D-05) and each independently UNKNOWN-gated over its own included set (D-09/D-10, WGHT-02), plus the `rules/2026.json` unit fix (D-03).

Weight checks R103 and R408 are combined into one plan: they are near-duplicate pure `CheckFn`s that share the `rules/2026.json` unit fix, the `check.routes.ts` engine registration, and the identical per-verdict gating pattern — splitting them would force file contention on `check.routes.ts` and `rules/2026.json` (sequential anyway) with no parallelism gain.

## Outline

| Plan ID | Objective | Wave | Depends On | Requirements |
|---------|-----------|------|------------|--------------|
| 02-01 | Add `getPartStudioMassProperties` + `getPartsMetadata` typed methods to `OnshapeClient` (callWithRefresh pattern), then verify against a live Onshape document that `mass[0]` is nominal-kg, raw mass is SI kg, `BTAssemblyDefinitionInfo.parts[]` carries the `partId` join key, and `BTPartMetadataInfo.material` absence flags an unmaterialized part. Blocking human-verify spike; locks the merge-step contract. | 1 | — | WGHT-01, WGHT-03, WGHT-04 |
| 02-02 | Extend the shared facts + verdict shape and ship the material audit end-to-end: `Fact` gains `massKg`/`materialAssigned`; `flatten-assembly.ts` surfaces `parts[]` + `groupPartsByElement`; `Verdict` becomes tri-state (PASS/FAIL/UNKNOWN) with optional `measured:{lb,kg}`, `affectedParts`, `caveats`, and a single `KG_TO_LB`; Phase-1 consumers (`occurrence-count.check.ts`, `frame-tag-presence.check.ts`, panel `api.ts` `CheckReportVerdict`, `ReportTable.tsx` tri-state render) updated to keep the build green; `check.routes.ts` performs the per-Part-Studio mass+material fetch/merge before the engine; new `material-audit.check.ts` lists offending parts (D-07/D-08) rendered as a first-class row. | 2 | 02-01 | WGHT-01 |
| 02-03 | Ship the two distinctly-filtered, per-verdict-gated weight verdicts over the enriched facts: `robot-weight.check.ts` (R103 = total − BUMPER_ − BATTERY_) and `robot-bumpers-weight.check.ts` (R408 = total − BATTERY_), each producing UNKNOWN (suppressing the number) when any part in its own included set lacks material (D-09/D-10), each emitting missing-tag caveats (D-06), rendering `<lb> lb (<kg> kg)`; fix `rules/2026.json` R103/R408 `unit` → `lb` (D-03); register both in `buildEngine()`. | 3 | 02-02 | WGHT-02, WGHT-03, WGHT-04 |

## Coverage check

| Requirement | Covered by |
|-------------|-----------|
| WGHT-01 (material audit) | 02-01 (detection endpoint verified), 02-02 (audit check shipped) |
| WGHT-02 (UNKNOWN gating) | 02-03 (per-verdict UNKNOWN production) |
| WGHT-03 (R103 robot-only) | 02-01 (mass fetch verified), 02-03 (verdict) |
| WGHT-04 (R408 robot+bumpers) | 02-01 (mass fetch verified), 02-03 (verdict) |

All four phase requirements covered. No unplanned source items.

## OUTLINE COMPLETE
Plan count: 3

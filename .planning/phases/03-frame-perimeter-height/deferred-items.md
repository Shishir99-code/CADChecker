# Deferred Items — Phase 3

Out-of-scope discoveries logged during execution, per the executor's Scope
Boundary rule (not fixed, only tracked here).

## Pre-existing rule-citation collision on "R101" (and "R103")

**Discovered during:** 03-02 Task 2 (frame-perimeter check + route enrichment).

**Issue:** `occurrenceCountCheck` (`src/server/checks/occurrence-count.check.ts`,
shipped in Phase 1 as a "proof-of-plumbing" check) cites `config.rules[0]`
**positionally**, not by rule string. Now that `rules/2026.json`'s entries are
`VERIFIED` real season data (Plan 03-01), `rules[0]` happens to be the real
`R101` entry -- so `occurrenceCountCheck`'s Verdict ALSO reports
`rule: "R101"`, `title: "Frame Perimeter"`, colliding with
`framePerimeterCheck`'s (this plan's) genuine R101 perimeter verdict. Both
verdicts appear in the same `/api/check` response, both labeled "R101 |
Frame Perimeter", with unrelated measured values (an occurrence count vs. an
actual perimeter measurement) and possibly different PASS/FAIL statuses.

The same positional-indexing pattern affects `frameTagPresenceCheck`
(`config.rules[1]`, currently `R103`), which collides with
`robotWeightCheck`'s genuine `R103` citation -- this collision has existed
silently since Phase 2 (Plan 02-02) and was not previously surfaced by any
test.

**Why not fixed here:** `occurrence-count.check.ts` and
`frame-tag-presence.check.ts` are Phase 1 scaffolding, outside this plan's
`files_modified` list, and their positional-indexing design (not a bug
introduced by this plan) predates 03-02 entirely -- rules/2026.json's
PLACEHOLDER->VERIFIED flip (03-01) is what first gave the collision real
semantic meaning. Per the executor's Scope Boundary rule, only issues
directly caused by the current task's own changes are auto-fixed; this is a
pre-existing condition in unrelated files.

**Mitigation applied in this plan:** `frame-perimeter.check.test.ts` and
`check.routes.test.ts` select the perimeter verdict by `v.geometry`
presence, NOT by `rule === "R101"` string match -- this is also
`03-02-PLAN.md`'s own Task 3 guidance (`verdicts.find(v => v.geometry)`) for
exactly this reason. `HullRender`/`main.tsx` (Task 3) follow the same
collision-proof selector.

**Recommended follow-up (future plan, likely Phase 4 dashboard polish):**
Either retire `occurrenceCountCheck`/`frameTagPresenceCheck` (their stated
purpose -- "proof-of-plumbing" -- has been fully superseded by real checks
in Phases 2-3), or give them their own non-colliding, non-`R\d+`-pattern
rule identifiers (mirroring `materialAuditCheck`'s `"MAT-AUDIT"` convention)
so every displayed rule number in the ReportTable is unambiguous and
uniquely resolvable.

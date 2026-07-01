---
phase: 01-connected-foundation-first-check
plan: 02
subsystem: check-core
tags: [zod, season-config, occurrence-traversal, check-engine, vitest, tdd]

# Dependency graph
requires: [01-01]
provides:
  - "Versioned, zod-validated season config (rules/2026.json) loaded by season key -- CONF-01/CONF-02"
  - "Shared occurrence-traversal utility (flattenAssembly) converting an assembly definition into Fact[] using already-absolute transforms"
  - "Pluggable CheckEngine registry with two independent checks over the same Fact[] path -- Success Criterion 5"
affects: [01-03, phase-2, phase-3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "loadSeasonConfig(season) is the ONLY place the literal rules/{season}.json filename pattern appears -- no other module inlines a season path"
    - "Shared passesOperator() comparator (max/min) in engine.ts is the single place operator branching lives -- individual check functions never branch on operator directly"
    - "flattenAssembly consumes plain JSON via a locally-declared minimal structural type, not the panel/Onshape-client's generated types -- keeps the traversal utility free of any network dependency"
    - "Each CheckFn cites its own SeasonConfig rule entry (occurrenceCountCheck -> rules[0], frameTagPresenceCheck -> rules[1]) rather than hardcoding rule numbers"

key-files:
  created:
    - rules/2026.json
    - src/server/config/schema.ts
    - src/server/config/load-season.ts
    - src/server/config/load-season.test.ts
    - src/server/traversal/facts.ts
    - src/server/traversal/flatten-assembly.ts
    - src/server/traversal/flatten-assembly.test.ts
    - src/server/checks/engine.ts
    - src/server/checks/occurrence-count.check.ts
    - src/server/checks/frame-tag-presence.check.ts
    - src/server/checks/engine.test.ts
  modified: []

key-decisions:
  - "loadSeasonConfig resolves the repo root via import.meta.url/fileURLToPath rather than process.cwd(), so the loader works regardless of the caller's working directory"
  - "Each check cites its own config rule entry positionally (rules[0]/rules[1]) rather than looking up by a hardcoded rule string -- keeps the proof-of-plumbing checks fully config-driven, consistent with CONF-01/CONF-02"

requirements-completed: [CONF-01, CONF-02, RUN-01]

# Metrics
duration: 6min
completed: 2026-07-01
---

# Phase 01 Plan 02: Season Config, Occurrence Traversal & Check Engine Summary

**Zod-validated versioned season config (rules/2026.json) + pure flattenAssembly traversal (absolute transforms, no composition) + pluggable CheckEngine running two independent checks over the identical Fact[] -- all TDD RED->GREEN, no Onshape network dependency.**

## Performance

- **Duration:** ~6 min (18:34 -> 18:40 local)
- **Tasks:** 3 (all `type="tdd" tdd="true"`, RED->GREEN pairs)
- **Files created:** 11 (0 modified)

## Accomplishments

- Built `RuleEntrySchema`/`SeasonConfigSchema` (zod) enforcing the D-07 shape `{ rule, title, limit, unit, operator }` and `loadSeasonConfig(season)` that resolves `rules/{season}.json` by key, parses, and validates -- a malformed entry or missing season throws immediately (CONF-01/CONF-02).
- Shipped `rules/2026.json` with accurate R101/R103/R104/R408 rule numbers and titles, every limit explicitly marked `"limitStatus": "PLACEHOLDER"` plus a top-level `note` pointing to the official FRC Game Manual as source of truth (D-08).
- Built the shared `Fact` type and `flattenAssembly(def)` -- a pure function that merges `rootAssembly.instances` with every `subAssemblies[].instances` into one lookup map, resolves each occurrence's name/partId via its path leaf, and passes `transform` through verbatim (proving no matrix composition is applied, per RESEARCH Pattern 2 / Assumption A1). An unresolvable leaf yields `"UNKNOWN"` rather than throwing.
- Built `CheckEngine` (`register`/`runAll`) plus a shared `passesOperator()` comparator (max/min) used by both checks, so no per-rule branching lives in check bodies. Registered `occurrenceCountCheck` (measures `facts.length`) and `frameTagPresenceCheck` (measures `FRAME_`-prefixed fact count) -- both consume the identical `Fact[]` reference passed to `runAll`, proving Success Criterion 5 as unit-tested code.

## Task Commits

Each task followed the TDD RED -> GREEN commit pair:

1. **Task 1: Season config schema, loader, rules/2026.json**
   - `3938441` test(01-02): add failing test for season config loader
   - `85d52da` feat(01-02): implement season config loader and 2026 rule config
2. **Task 2: Shared occurrence-traversal utility**
   - `f8fe5ca` test(01-02): add failing test for occurrence-traversal utility
   - `d8f805a` feat(01-02): implement flattenAssembly with absolute-transform passthrough
3. **Task 3: Pluggable check engine with two independent checks**
   - `9c1309b` test(01-02): add failing test for pluggable check engine
   - `79709c2` feat(01-02): implement CheckEngine registry with two independent checks

No REFACTOR-only commits were needed -- each GREEN implementation already matched the intended shared-helper structure (single operator comparator, single instance-map builder) without requiring a follow-up cleanup pass.

**Plan metadata:** (this commit, following SUMMARY.md write)

## Files Created

- `rules/2026.json` -- season "2026", 4 entries (R101 frame perimeter, R103 robot weight excl. bumpers/battery, R104 starting configuration height, R408 robot+bumpers weight), all limits `PLACEHOLDER`, `note` field citing the FRC Game Manual
- `src/server/config/schema.ts` -- `RuleEntrySchema`, `SeasonConfigSchema`, inferred types `RuleEntry`/`SeasonConfig`
- `src/server/config/load-season.ts` -- `loadSeasonConfig(season)`; the only module containing the literal `rules/${season}.json` path pattern
- `src/server/config/load-season.test.ts` -- 4 tests: valid load, bad-operator throw, malformed-rule-number throw, missing-season throw
- `src/server/traversal/facts.ts` -- shared `Fact` type `{ partId, name, transform, path }`
- `src/server/traversal/flatten-assembly.ts` -- `flattenAssembly(def)`, local minimal `AssemblyDefinition` structural type, instance-map helper
- `src/server/traversal/flatten-assembly.test.ts` -- 5 tests against a hand-authored nested-subassembly fixture (depth>=2 resolution, transform passthrough, UNKNOWN fallback)
- `src/server/checks/engine.ts` -- `Verdict`, `CheckFn`, `CheckEngine`, shared `passesOperator()` comparator
- `src/server/checks/occurrence-count.check.ts` -- `occurrenceCountCheck` (cites `config.rules[0]`)
- `src/server/checks/frame-tag-presence.check.ts` -- `frameTagPresenceCheck` (cites `config.rules[1]`, `FRAME_` prefix)
- `src/server/checks/engine.test.ts` -- 6 tests: verdict count, measured values, identical-array-reference proof, generic pass/fail via operator in both directions

## Decisions Made

- `loadSeasonConfig` resolves the repo root via `fileURLToPath(import.meta.url)` rather than `process.cwd()`, so it works correctly regardless of where the process is launched from (dev vs. build vs. test runner).
- Both proof-of-plumbing checks cite their season-config rule entry positionally (`rules[0]`/`rules[1]`) rather than hardcoding a rule string like `"R101"` -- keeps them fully config-driven and avoids asserting a real rule number against a check that isn't measuring that rule's actual quantity (per CONTEXT.md: these two checks exist to prove pluggability, not correctness).

## Deviations from Plan

None -- plan executed exactly as written. No auto-fixes, no blocking issues, no architectural questions arose; this is pure, dependency-free logic and all three tasks passed RED then GREEN on the first implementation attempt.

## TDD Gate Compliance

All three tasks completed the full RED -> GREEN gate sequence with no failures requiring iteration:

| Task | RED (test) commit | Confirmed failing before GREEN | GREEN (feat) commit | Confirmed passing |
|------|--------------------|-------------------------------|----------------------|--------------------|
| 1 | `3938441` | Yes (`Cannot find module './load-season.ts'`) | `85d52da` | Yes (4/4 tests) |
| 2 | `f8fe5ca` | Yes (`Cannot find module './flatten-assembly.ts'`) | `d8f805a` | Yes (5/5 tests) |
| 3 | `9c1309b` | Yes (`Cannot find module './engine.ts'`) | `79709c2` | Yes (6/6 tests) |

No REFACTOR gate commits were needed. No warnings.

## Issues Encountered

None.

## Verification Results

- `npx vitest run` -- 4 test files, 18/18 tests passing (includes Plan 01's `app.test.ts` alongside this plan's 3 new suites).
- `npx eslint src` -- clean, no errors/warnings.
- `npx tsc -p tsconfig.server.json --noEmit` -- clean, no type errors.
- `grep -c PLACEHOLDER rules/2026.json` -- 5 (4 entries + 1 top-level note reference).
- `grep -rn 'rules/' src --include='*.ts' | grep -v load-season.ts` -- no matches; the literal path pattern lives only in the loader.
- `grep -l "traversal/facts" src/server/checks/occurrence-count.check.ts src/server/checks/frame-tag-presence.check.ts` -- both files match; single shared Fact type confirmed.

## Next Phase Readiness

- CONF-01, CONF-02 satisfied: config-driven, zod-validated rule numbers/titles/limits, never hardcoded.
- Success Criterion 5 (pluggable engine, 2+ checks, identical facts path) proven as pure, unit-tested code -- `CheckEngine`, `flattenAssembly`, and `loadSeasonConfig` are ready for Plan 03 to import and wire to a live Onshape `getAssemblyDefinition` response via the typed REST client.
- No Onshape network dependency exists anywhere in this plan's code (confirmed by grep) -- this core can be reused unchanged by Phase 2 (weight check) and Phase 3 (perimeter check) per the roadmap's stated intent to avoid divergent per-check traversal logic.
- Plan 03 should verify Assumption A1 (transform absoluteness) against one real nested Onshape assembly response early in its own execution, since this plan's fixture is hand-authored and could not verify that claim against live API data.

## Self-Check: PASSED

- All 6 task commit hashes (`3938441`, `85d52da`, `f8fe5ca`, `d8f805a`, `9c1309b`, `79709c2`) verified present in `git log --oneline --all`.
- All 11 files listed in `key-files.created` verified present on disk via direct file-existence checks.
- `npx vitest run` executed: 4 test files, 18/18 tests passing.
- No source code was re-implemented or modified during this close-out -- this SUMMARY documents work already committed prior to this session's SUMMARY step.

---
*Phase: 01-connected-foundation-first-check*
*Completed: 2026-07-01*

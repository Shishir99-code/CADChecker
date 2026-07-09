---
phase: 02-trustworthy-weight
plan: 01
status: complete
completed: 2026-07-09
requirements: [WGHT-01, WGHT-03, WGHT-04]
---

# 02-01 Summary — Mass-properties client methods + live-verify spike

## What was built

Two typed, `callWithRefresh`-wrapped methods on `OnshapeClient` — `getPartStudioMassProperties` and `getPartsMetadata` — following the existing `getAssemblyDefinition` raw-`fetch`+cast idiom, with unit tests. Then a blocking `checkpoint:human-verify` locked the mass/material response contract against real Onshape documents before any weight math is written (02-02/02-03).

## Tasks

- **Task 1 (auto, committed `d1cb013`):** `getPartStudioMassProperties(documentId, wvm, wvmid, elementId, partIds?, configuration?)` → `BTMassPropertiesBulkInfo`, and `getPartsMetadata(documentId, wvm, wvmid, elementId)` → `BTPartMetadataInfo[]`. Both throw `OnshapeApiError` with the real status on non-2xx (so 401→refresh still fires). Covered by `client.test.ts` (6 tests: URL/query construction, `partId` fan-out, `configuration` param, non-2xx→OnshapeApiError, `mass[0]` fixture). `tsc`/`vitest`/`npm run build` clean.
- **Task 2 (checkpoint:human-verify — RESOLVED):** Human ran the throwaway `scripts/spike-mass-properties.ts` against real CAD and confirmed the contract; findings recorded in `02-MASS-PROPERTIES-CONTRACT.md` (committed `8aa111f`) and RESEARCH Open Questions 1-3 marked resolved in place.

## Contract confirmed (ground truth for 02-02/02-03 — see 02-MASS-PROPERTIES-CONTRACT.md)

- Nominal mass index = **`mass[0]`** (3-element `[nominal,-tol,+tol]` array).
- Unit = **SI kilograms** (observed 2.90 kg aluminum part ≈ 6.4 lb; volume in m³).
- Join key = **`definition.parts[] → partId`** (dedup per unique part; also carries documentId/elementId/configuration/documentVersion/documentMicroversion/isStandardContent).
- Material-absence = **`getPartsMetadata(...).material` present ⇒ assigned, null ⇒ unmaterialized**.

## Live findings that shape 02-02/02-03 (details in contract F1–F4)

1. Unmaterialized parts are **omitted** from `mass` (not `0`); `hasMass`/`massMissingCount` are Onshape's official omission counters.
2. **Correction to research A3:** a no-`partId` mass call returns a single **`-all-` aggregate** body, not per-part entries — 02-02 must pass explicit `partId[]`.
3. Referenced (other-owner) documents **403 even version-addressed** — per-part reads work for self-contained/owned robots; external-library parts may be unreadable. `parts[]` provides `documentVersion`/`documentMicroversion` for `v/`/`m/` addressing of readable refs.
4. Assembly-level `/assemblies/.../massproperties` resolves refs **server-side** and returns the whole-robot total — and returned `mass=0, hasMass=false, massMissingCount=84` while `volume>0` on a real robot, i.e. Onshape's own total **silently drops unmaterialized parts** (the exact failure CADChecker flags).

## Key files

- `src/server/onshape-client/client.ts` — `getPartStudioMassProperties`, `getPartsMetadata`, `MassPropertiesBulkResponse`, `PartMetadata`.
- `src/server/onshape-client/client.test.ts` — unit coverage.
- `.planning/phases/02-trustworthy-weight/02-MASS-PROPERTIES-CONTRACT.md` — the live-verified contract.
- `scripts/spike-mass-properties.ts` — throwaway verification spike (kept through the phase for re-verification during 02-02/02-03; **delete at phase completion** per plan).

## Deviations

- **Executed on the main tree (no worktree) and the checkpoint was driven by the orchestrator**, not the paused executor, because the human-verify step required extensive live-environment troubleshooting (see below). Task 1 was committed by the executor before the connection interruption; the orchestrator verified it and completed the checkpoint.
- **Spike expanded** beyond the original plan (resilient per-element error handling; same-doc vs referenced split; `v/{documentVersion}` probing; direct Part-Studio section 3; assembly-level section 4) to get past real multi-document assemblies. Kept rather than deleted immediately because F3/F4 are relevant to the not-yet-executed 02-02/02-03.
- **Spike script committed** (plan called it throwaway-then-delete) — deferred deletion to phase completion so it remains available while 02-02/02-03 execute.

## Environment work done alongside (separate commits / quick tasks, not part of this plan's scope)

The live-verify step surfaced dev-environment blockers that were fixed to unblock OAuth: Vite IPv4 bind (`5420c59`), env-aware session cookie for http-localhost OAuth (quick `260709-k6r`), and Express-served panel for future Render deploy (quick `260707-geu`). A temporary token-log used to capture the spike token was added and **removed** (passport-config.ts is unchanged net).

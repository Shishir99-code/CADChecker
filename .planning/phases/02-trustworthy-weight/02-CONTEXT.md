# Phase 2: Trustworthy Weight - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the robot-weight verdict **trustworthy** by gating it on a material-default audit, then ship **two distinctly-filtered weight checks**:

- A **material-default audit** that inspects every weight-contributing part for a missing/unset material (the #1 cause of CAD weight silently diverging from the real robot) and lists the offending parts.
- **R103 — robot-only weight** (excludes bumpers and battery), compared against the season limit.
- **R408 — robot+bumpers weight** (includes bumpers, still excludes battery), compared against its own limit — a *distinctly filtered* number, never R103 relabeled.

The verdict is **gated per-verdict** on the audit: any weight-contributing part missing material forces that verdict to **UNKNOWN** rather than a confident numeric pass/fail.

**In scope:** WGHT-01 (material audit), WGHT-02 (UNKNOWN gating), WGHT-03 (R103), WGHT-04 (R408). These build on Phase 1's proven chain (OAuth → typed client → shared occurrence traversal → pluggable check engine → versioned config) and reuse it as-is.

**Explicitly NOT in scope:** frame perimeter / height (Phase 3), final trust-bar presentation polish (Phase 4), any UI styling pass (deferred until checks compute real values — see STATE.md USER REQUEST), and writing tags back to Onshape (read-only tagging convention only).

</domain>

<decisions>
## Implementation Decisions

### Weight display units
- **D-01:** Display verdicts with **pounds as the primary value and kilograms in parentheses** (e.g. `114.2 lb (51.8 kg)`). Onshape mass-properties returns SI kilograms; FRC teams and the Game Manual reason in pounds.
- **D-02:** **Kilograms remain the canonical internal value**; convert kg→lb at the display/verdict boundary (single documented conversion), so comparison math and API values never drift. This means the `Verdict` output must carry both the lb and kg figures (or canonical kg + a converted lb) rather than a single `measured`/`unit` pair.
- **D-03:** **Fix `rules/2026.json`** — the R103/R408 entries currently say `unit: "kg"` but hold the pound-denominated numbers (115, 135). Correct the unit to `lb` so the config's limit and unit agree. (Limit *values* stay flagged PLACEHOLDER per Phase 1 D-08 until verified against the live Game Manual.)

### Bumper & battery filtering (the two distinct verdicts)
- **D-04:** Identify the battery via a **`BATTERY_` name prefix**, extending the existing read-only prefix convention (`FRAME_`/`BUMPER_`/`MECH_`). No Onshape custom properties.
- **D-05:** Filtering rules:
  - **R103 measured = total mass − `BUMPER_` parts − `BATTERY_` parts**
  - **R408 measured = total mass − `BATTERY_` parts** (bumpers included)
  These must be **two independently-filtered occurrence queries**, not one number relabeled (WGHT-04 / Success Criterion 4).
- **D-06:** When the relevant tag is **absent** (no `BATTERY_` and/or no `BUMPER_` part found), **still compute the verdict but attach a visible caveat** — e.g. "no `BATTERY_` part found — battery mass may be included in this total." This keeps the number while being honest that the exclusion couldn't be applied. This requires the check output to carry a **caveats/notes** field.

### Material-default audit
- **D-07:** Audit **only weight-contributing parts** (the occurrences that feed a weight total), not every part in the assembly — a missing material only matters if it distorts a reported number. (Note: because R103 and R408 have different part sets, "weight-contributing" is per-verdict; see D-09.)
- **D-08:** Surface the audit as a **full list of the offending part names (plus total count)** — not a count alone — so the team can go fix the exact parts. Include the occurrence path/identity where available.

### UNKNOWN gating
- **D-09:** **Per-verdict gating.** A part missing material marks only the verdict(s) it actually contributes to as UNKNOWN. E.g. a bumper missing material makes **R408** UNKNOWN but leaves **R103** computable (bumpers aren't in R103). The engine must therefore track which parts feed which total.
- **D-10:** In the UNKNOWN state, **suppress the weight number entirely** — show `UNKNOWN` + the affected-part count + the offending-parts list, never a partial/floor number. Strongest reading of Success Criterion 2 ("never a numeric pass/fail computed on incomplete mass data"); eliminates any chance a wrong number is screenshotted or acted on.
- **D-11:** The `Verdict` (or check-result) shape must be **extended beyond Phase 1's `{ rule, title, limit, unit, measured, pass: boolean }`** to express: a tri-state **status (PASS | FAIL | UNKNOWN)**, an **optional/suppressible measured value** (absent when UNKNOWN), the **lb + kg dual figures** (D-02), and a **caveats** list (D-06). The material audit itself is a first-class result (its own row/section listing offending parts), distinct from the two weight verdicts it gates.

### Claude's Discretion (with guidance)
- **Extending the shared facts path:** Phase 1's contract is that checks are **pure functions over a shared `Fact[]`** (`CheckFn = (facts, config) => Verdict`) and never do their own traversal/network. Preserve this: the route should **fetch mass-properties + material assignment and merge them into an extended `Fact`** (adding e.g. `massKg` and `material`/`materialIsDefault` fields to `src/server/traversal/facts.ts`), so the new weight checks and the audit stay pure over the same enriched facts. Do **not** make check functions async or let them call the Onshape client directly. Exact enriched-`Fact` field shape is the planner's to design.
- **Mass-query approach** (assembly-level mass-properties with occurrence filtering vs per-part summation) is the planner's call, informed by research — but see the mass-properties research flag below; **verify the actual JSON response shape against a live document early in planning** before committing.
- **How "default/unset material" is detected** in the mass-properties / parts-metadata response — planner + researcher determine the exact field/semantics (material id null vs a known default material id vs omitted). Capture the detection rule explicitly once verified.
- **Material-audit signal wiring:** whether the audit reads material state from the same mass-properties call or a separate parts-metadata query is the planner's call (research-dependent).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 2: Trustworthy Weight" — goal + 4 success criteria this phase is judged against (material audit visible, UNKNOWN gating, R103 robot-only, R408 robot+bumpers).
- `.planning/REQUIREMENTS.md` — WGHT-01 (material audit), WGHT-02 (UNKNOWN gate), WGHT-03 (R103 occurrence-filtered), WGHT-04 (R408 separately-filtered). Also the Out-of-Scope table (read-only name-prefix tagging, no custom properties, no datastore).
- `.planning/phases/01-connected-foundation-first-check/01-CONTEXT.md` — Phase 1 decisions this phase inherits: D-06/D-07 season-config shape `{ rule, title, limit, unit, operator }`, D-04 401-reactive refresh, the shared-traversal + pluggable-engine contract.

### Existing code to reuse/extend (repo files)
- `src/server/checks/engine.ts` — `CheckEngine`, `CheckFn = (facts, config) => Verdict`, `Verdict` type, `passesOperator(max/min)`. The `Verdict` type must be extended per D-11; the operator comparator is reused as-is.
- `src/server/traversal/facts.ts` — the shared `Fact` shape. **Must be extended** with mass + material fields (D-11 discretion note).
- `src/server/traversal/flatten-assembly.ts` — `flattenAssembly()` producing `Fact[]` from the assembly definition. Weight facts enrichment hangs off this path.
- `src/server/routes/check.routes.ts` — the POST `/api/check` handler that re-derives context, gathers facts, runs the engine. New mass-properties fetch + fact enrichment + registering the weight/audit checks happen here (see `buildEngine()`).
- `src/server/onshape-client/client.ts` — typed `OnshapeClient`; add a **mass-properties** method (and material/parts-metadata if needed) alongside `getAssemblyDefinition`, routed through `callWithRefresh`.
- `rules/2026.json` — season config to correct per D-03 (R103/R408 unit → `lb`).

### External Onshape docs (URLs — cited in CLAUDE.md "Sources")
- Onshape mass-properties + Parts/Assemblies API — via the Onshape OpenAPI spec (mirrored `onshape-clients/openapi.json`), used by `openapi-typescript`. Source for the mass-properties response type and material metadata fields. **Response shape must be confirmed against a live document (research flag below).**
- `CLAUDE.md` — locked stack + the "What NOT to Use" list (stale `onshape-client`, API-key-only `onshape-ts-client`); mass computation stays on the hand-rolled typed `fetch` client.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Pluggable check engine** (`src/server/checks/engine.ts`): register new check functions with `engine.register(fn)`; `passesOperator` handles max/min comparison generically — reuse for weight limits.
- **Shared occurrence traversal** (`flatten-assembly.ts` → `Fact[]`): the single facts path both weight checks and the audit must consume (Phase 1 Success Criterion 5 pattern carried forward).
- **Typed, refresh-wrapped Onshape client** (`onshape-client/client.ts`): `callWithRefresh` gives every new API method free 401→refresh→retry. Add mass-properties here.
- **Season config loader** (`config/load-season.ts`, `config/schema.ts`): zod-validated; already exposes R103/R408 entries.
- **Report/Reconnect panel** (`src/panel/components/ReportTable.tsx`, `ReconnectState.tsx`): existing (unstyled) render targets for the new verdicts + audit rows. Keep unstyled per the deferred-UI request.

### Established Patterns
- Checks are **pure over shared facts** — no per-check traversal or network. Phase 2 must preserve this; enrich the facts upstream (route), keep checks pure.
- Verdicts are **config-driven** (rule/title/limit/unit/operator from `rules/2026.json`), never hardcoded.
- The route **re-derives the element server-side** and never trusts client-supplied element ids (T-01-11 / CONN-02) — the new mass-properties call must follow the same server-side-derivation discipline.

### Integration Points
- `buildEngine()` in `check.routes.ts` is where the two new weight checks (and the audit) get registered.
- The mass-properties fetch is a **new Onshape API surface** (Phase 1 only exercised elements + assembly-definition) — this is the primary new integration risk; see research flag.

</code_context>

<specifics>
## Specific Ideas

- Battery tag convention: `BATTERY_` name prefix (mirrors `FRAME_`/`BUMPER_`/`MECH_`).
- Filtering math locked: R103 = total − `BUMPER_` − `BATTERY_`; R408 = total − `BATTERY_`.
- Display format: `<lb> lb (<kg> kg)`; kg canonical internally.
- UNKNOWN state renders as: `UNKNOWN — N parts missing material` + the offending-part list, with no weight number.
- Missing-tag caveat wording example: "no `BATTERY_` part found — battery mass may be included in this total."

</specifics>

<deferred>
## Deferred Ideas

- **Config limit-value verification** — replacing the PLACEHOLDER R103/R408 limits with exact current-season Game Manual values is a data/verification task (carried from Phase 1 D-08 and STATE.md blockers), not a code decision for this phase; the unit-field fix (D-03) is in scope, the verified numbers are not asserted here.
- UI/styling pass for the panel remains deferred until checks compute real values (STATE.md USER REQUEST; `/gsd-ui-phase` later). Phase 2 renders trustworthy data into the existing unstyled rows.
- v2 items already recorded in `.planning/REQUIREMENTS.md` §v2 (webhook auto-refresh, FeatureScript, guided tagging, bumper coverage) — untouched.

*Discussion stayed within phase scope — no new scope-creep ideas surfaced.*

</deferred>

---

*Phase: 02-trustworthy-weight*
*Context gathered: 2026-07-02*

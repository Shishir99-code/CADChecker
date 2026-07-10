# Phase 3: Frame Perimeter & Height - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the two **geometry** checks, both compared against season limits and both honest about what/where/which-config they measured:

- **Robot/frame perimeter (R101/R104)** — the 2D convex hull of the **floor-plane (world XY) projection** of `FRAME_`-tagged parts. Explicitly the taut-string wrap, **not** a 3D hull and **not** a raw whole-robot bounding box. **Rendered visually** in the panel so the team can see exactly which footprint was measured.
- **Starting-configuration height (R104/R107)** — the vertical (world +Z) extent of the **whole robot** in the measured configuration, with that configuration **explicitly named/disclosed**.

Both reuse Phase 1's proven chain (OAuth → typed client → shared occurrence traversal → pluggable check engine → versioned config) and Phase 2's enrichment pattern (fetch geometry in the route, merge onto `Fact[]`, keep checks pure/sync). The tri-state `Verdict { status: PASS|FAIL|UNKNOWN, caveats[] }` from Phase 2 is reused as-is for the "not yet checkable" state.

**In scope:** GEOM-01 (perimeter hull vs limit), GEOM-02 (visual render + config disclosure), GEOM-03 (starting-config height vs limit + config disclosure). Plus the SC4 empty-state: no `FRAME_` parts → explicit "not yet checkable — no frame parts tagged" (UNKNOWN + caveat), never a silent pass or zero-value.

**Explicitly NOT in scope:** the ≤¼-in minor-protrusion exception to frame perimeter (deferred — see below); final trust-bar panel polish / measured-context disclosure fields (Phase 4, RSLT-01/02/03); any general UI styling pass (deferred until Phase 4 — but the hull *visual render* itself IS an in-scope Phase 3 deliverable per Success Criterion 2, not deferred styling); named-configuration selection convention (deferred); writing tags back to Onshape (read-only convention only).

</domain>

<decisions>
## Implementation Decisions

### Hull geometry source (perimeter)
- **D-01:** For v1, build the hull from **per-part bounding-box corners** of `FRAME_`-tagged parts — fetch each frame part's bounding box, transform its 8 corners into world space, project onto the floor plane, then take the 2D convex hull of all projected corners. This is the fast/simple path (few API calls, small payloads, deterministic) over tessellated mesh vertices. Choosing per-part-bbox vs one assembly-level `boundingboxes` call is the planner's/researcher's call — but the hull must be of **many parts' corner points**, never a single whole-robot bounding box (Success Criterion 1 forbids a raw bounding box).
- **D-02:** Bounding boxes **overestimate** angled/rounded/diagonal frame rails, so the perimeter reads slightly LARGE. This is **accepted for v1** because the user explicitly **prefers a false FAIL over a false PASS** (aligns with the project's core value: catch violations before inspection; never tell a team they pass when they'd fail). The verdict MUST carry a **caveat disclosing the measurement method** — e.g. "perimeter measured from part bounding boxes and may read slightly high; a FAIL just over the limit warrants a manual re-check." Attach this caveat on every perimeter verdict (reuse the existing `caveats[]` field).
- **D-03:** **Tessellated-vertex measurement is the documented upgrade path**, not v1 scope — only pursue it if bounding-box overestimation proves inadequate (verify magnitude against real CAD, see discretion note).

### Up-axis, floor plane & height
- **D-04:** **Assume world +Z is up.** Perimeter projects onto the world **XY plane** (drop the Z component of each world-space point). Height = the **max +Z extent** in world space. Chosen over inferring the up-axis (heuristic, no clean API answer — STATE.md flag) or a team-declared convention (adds tagging burden, conflicts with read-only v1). Disclose the assumption in a caveat so a mis-oriented model is explainable rather than silently wrong — e.g. "assumes the robot is modeled with +Z up."
- **D-05:** **Height measures the WHOLE robot**, not just `FRAME_` parts — the max +Z extent across **all** occurrences in the measured configuration. Rationale: R104/R107 height governs the robot's tallest point (a mechanism/arm above the frame counts); measuring only frame parts could pass a robot that's really too tall. (Do NOT subtract bumpers/battery for height — that exclusion is unverified against the Game Manual and would be over-engineering.)

### Starting configuration
- **D-06:** Measure Onshape's **default (as-modeled) configuration** — what `getAssemblyDefinition` already returns with no configuration parameter — and **explicitly disclose its name** in both geometry verdicts (satisfies Success Criterion 3: named, not "whatever tab is open"). If the assembly actually has multiple configurations, attach a caveat like "measured the Default configuration — verify this is your starting configuration." No new tagging burden for v1.

### Visual render (perimeter)
- **D-07:** Render the measured footprint as an **inline SVG polygon with a limit overlay** — the hull outline drawn top-down, auto-scaled to fit, with the perimeter length and the season limit labeled, and a visual reference for the limit so over-perimeter is visible at a glance (not just numeric). **Self-contained SVG, no chart library / no new dependency**, consistent with the intentionally-unstyled panel. Optionally draw the individual `FRAME_` part footprints faintly behind the hull so the team can see which geometry was included. This is a genuine Phase-3 deliverable (Success Criterion 2), distinct from the deferred general styling pass. The render needs the hull vertices (and ideally per-part footprints) returned from the server alongside the verdict — the perimeter `Verdict`/report shape must be extended to carry this geometry.

### Claude's Discretion (with guidance)
- **Geometry source verification:** The user said "you decide" on bbox-vs-tessellation, resolved to bounding-box-corners for v1 per D-01/D-02. **Verify the bounding-box overestimate magnitude and payload sizes against a real public team CAD doc early in planning** (Chief Delphi / GrabCAD, e.g. teams 1690/254) before committing — if overestimation is large enough to routinely false-FAIL legal robots, reconsider tessellation.
- **Configuration approach:** The user said "you decide" on config selection, resolved to default-config + disclosure per D-06. During planning, **confirm whether the test CAD docs even use configurations** — if they don't, the caveat can be softened. Named-configuration convention (e.g. a `STARTING_` marker or a config literally named "Starting") is a **documented future upgrade**, not v1.
- **Convex hull implementation:** `d3-polygon` (`polygonHull()`, Andrew's monotone chain, zero deps) is the CLAUDE.md-recommended library and is **not yet installed** — installing it vs hand-rolling the hull is the planner's call. Whichever is chosen, the hull points must come out in a consistent winding order so perimeter length is a simple closed-polygon sum.
- **Where the geometry enrichment lives:** Follow Phase 2's pattern — fetch bounding boxes in `check.routes.ts`, merge world-space corner points (or a projected footprint) onto the `Fact[]` before the engine runs; keep the perimeter and height checks **pure and synchronous** over the enriched facts. Exact enriched-`Fact` field shape (e.g. `bboxCornersWorld?: number[][]`) is the planner's to design. Referenced-document parts that can't be read (403 / F3) leave geometry UNRESOLVED (`undefined`, never a substituted 0) exactly like mass/material in Phase 2.
- **Height as a check vs a facet of perimeter:** whether height is a separate registered `CheckFn` (likely — it cites its own rule R104/R107 and its own limit) or shares enrichment with perimeter is the planner's call; both consume the same shared enriched `Fact[]`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 3: Frame Perimeter & Height" — goal + 4 success criteria this phase is judged against (2D floor-projected hull not a bbox/3D-hull; visual render + config disclosure; whole-robot starting-config height with config named; no-FRAME_-tags → explicit "not yet checkable").
- `.planning/REQUIREMENTS.md` — GEOM-01 (perimeter = 2D hull of floor-projected `FRAME_` parts vs limit), GEOM-02 (hull rendered visually + configuration disclosed), GEOM-03 (starting-config height vs limit + configuration disclosed). Also the Out-of-Scope table (read-only name-prefix tagging, no custom properties, no datastore).
- `.planning/PROJECT.md` — Frame-perimeter definition (R101 taut-string wrap = 2D convex hull), name-prefix tagging convention (`FRAME_`/`BUMPER_`/`MECH_`/`BATTERY_`), 2026 season values (frame perimeter ≤ 110 in, starting height ≤ 30 in) noted as versioned config, validation strategy (public team CAD, no physical robot).

### Prior-phase decisions this phase inherits
- `.planning/phases/01-connected-foundation-first-check/01-CONTEXT.md` — D-06/D-07 season-config shape `{ rule, title, limit, unit, operator }`; D-04/D-05 401-reactive refresh + distinct Reconnect state; the shared-traversal + pluggable-engine contract; PLACEHOLDER limit values (R101=110in, R104=30in still unverified against the live Game Manual — see blockers).
- `.planning/phases/02-trustworthy-weight/02-CONTEXT.md` — the enrichment pattern to mirror: fetch per-group data in the route, merge onto `Fact[]`, keep checks pure/sync (D-11 discretion); tri-state `Verdict` with `caveats[]`; UNRESOLVED semantics (`undefined` never coerced to 0/false); referenced-document (F3) 403-swallow-per-group discipline.
- `.planning/phases/02-trustworthy-weight/02-MASS-PROPERTIES-CONTRACT.md` — the per-group cross-document addressing rules (w/{workspaceId} vs v/{documentVersion} vs m/{documentMicroversion}) that the geometry fetch must follow identically.

### Existing code to reuse/extend (repo files)
- `src/server/checks/engine.ts` — `CheckEngine`, `CheckFn = (facts, config) => Verdict`, tri-state `Verdict`, `passesOperator(max/min)`, `KG_TO_LB`. The perimeter `Verdict`/report shape must be **extended to carry hull geometry** for the SVG render (D-07). `passesOperator` reused for the `max` perimeter/height limits.
- `src/server/traversal/facts.ts` — the shared `Fact` shape (currently `partId`, `name`, `transform` [world 16-element], `path`, `massKg?`, `materialAssigned?`). **Must be extended** with a geometry field (e.g. world-space bbox corners / projected footprint) per the discretion note. `transform` is already absolute world-space — never compose it further.
- `src/server/traversal/flatten-assembly.ts` — `flattenAssembly()` (→ `Fact[]`) and `groupPartsByElement()` (per-element grouping for cross-document fetch). Geometry enrichment hangs off the same grouping path as mass/material.
- `src/server/routes/check.routes.ts` — POST `/api/check`: re-derives element server-side, walks assembly, does the per-group mass/material fetch+merge, runs `buildEngine()`. **New bounding-box fetch + geometry merge + registering the perimeter & height checks happen here** (mirror the existing 5b enrichment block and its 401/Reconnect/403-per-group error discipline). `buildEngine()` is where the two new checks get registered.
- `src/server/onshape-client/client.ts` — typed `OnshapeClient` (has `getElementsInDocument`, `getAssemblyDefinition`, `getPartStudioMassProperties`, `getPartsMetadata`, all via `callWithRefresh`). **Add a bounding-box method** here (assembly-level `/assemblies/.../boundingboxes` or per-part `/parts/.../boundingboxes` — see spec endpoints below), routed through `callWithRefresh` for free 401→refresh→retry.
- `src/panel/components/ReportTable.tsx` — existing (intentionally unstyled) verdict renderer with a notes/caveats row. The new **SVG hull render** is added here (or a sibling panel component) reading the geometry the server now returns.
- `src/panel/api.ts` — `CheckReportVerdict` / `CheckReport` panel types; extend to carry the hull geometry payload alongside the verdict.
- `rules/2026.json` — season config; R101 (Frame Perimeter, 110 in, `max`) and R104 (Starting Configuration Height, 30 in, `max`) entries already exist, marked `limitStatus: PLACEHOLDER`. The perimeter and height checks cite these. (Height rule may be R104 and/or R107 per ROADMAP — reconcile the exact number(s) against the Game Manual; config currently has R104 for height.)

### Onshape geometry API endpoints (in the generated spec — `src/server/onshape-client/types/onshape.d.ts`)
- `/api/assemblies/d/{did}/{wvm}/{wvmid}/e/{eid}/boundingboxes` (line ~469) — assembly-level bounding box.
- `/api/parts/d/{did}/{wvm}/{wvmid}/e/{eid}/partid/{partid}/boundingboxes` (line ~1565) — per-part bounding box.
- `/api/parts/.../tessellatedfaces` (line ~1663) — mesh vertices (the tessellation upgrade path, D-03; not v1).
- Onshape OpenAPI spec (mirrored `onshape-clients/openapi.json`) — source for the bounding-box response type via `openapi-typescript`. **Confirm the response shape and coordinate frame (part-local vs world; does it honor occurrence transforms?) against a live document early in planning** — the STATE.md floor-plane flag applies here.

### Geometry library (per CLAUDE.md)
- `CLAUDE.md` §"Computational Geometry" — `d3-polygon@3.0.1` (`polygonHull()`, Andrew's monotone chain, O(n log n), zero deps) recommended for the 2D convex hull; **not yet installed** in `package.json` (planner decides install vs hand-roll, D-07 discretion). Also the locked stack + "What NOT to Use" list.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Pluggable check engine** (`engine.ts`): `engine.register(fn)`; `passesOperator` handles `max` limits generically — reuse for both perimeter (R101) and height (R104/R107).
- **Enrichment-in-route pattern** (`check.routes.ts` step 5b): the exact template for fetching geometry per element-group, merging onto facts before the engine runs, with the 401-rethrow / ReconnectRequiredError-rethrow / other-error-swallow-per-group discipline and UNRESOLVED (`undefined`, never 0) semantics already proven for mass/material.
- **Shared occurrence traversal** (`flatten-assembly.ts`): `flattenAssembly()` gives world-space `transform` per occurrence (already absolute); `groupPartsByElement()` gives the cross-document fetch grouping. Both perimeter and height consume the same enriched `Fact[]` (Success Criterion 5 pattern).
- **Tri-state Verdict + caveats** (`engine.ts`): `status: UNKNOWN` + `caveats[]` directly express the "not yet checkable — no FRAME_ parts" empty state and the bbox-overestimate / +Z-assumption / default-config disclosures.
- **Refresh-wrapped client** (`client.ts`): new bounding-box method gets free 401→refresh→retry via `callWithRefresh`.
- **Report/caveats panel** (`ReportTable.tsx`): existing render target with a notes row for caveats and affected-parts; the SVG hull render slots alongside it.

### Established Patterns
- Checks are **pure, synchronous functions over shared enriched facts** — no per-check traversal or network. Enrich upstream (route), keep the two new checks pure. Do NOT make check functions async or let them call the client.
- Verdicts are **config-driven** (`rule/title/limit/unit/operator` from `rules/2026.json`) — never hardcode 110/30.
- The route **re-derives the element server-side** and never trusts client-supplied ids (T-01-11/CONN-02) — every id used by the bounding-box fetch must come from the server-fetched `definition`, never `req.body`.
- **UNRESOLVED never becomes 0/false** — a part whose geometry can't be read leaves its geometry field `undefined`; the check must treat that honestly (caveat / partial), never as a zero-size footprint.

### Integration Points
- `buildEngine()` in `check.routes.ts` — register the perimeter and height checks here (joining occurrence-count, frame-tag-presence, material-audit, robot-weight, robot-bumpers-weight).
- The bounding-box fetch is a **new Onshape API surface** (Phase 1–2 exercised elements, assembly-definition, mass-properties, parts-metadata) — the primary new integration risk; the response coordinate frame is the key unknown (verify live).
- Server→panel contract must grow a **geometry payload** (hull vertices + optional per-part footprints) so the panel can draw the SVG — `check.routes.ts` response and `src/panel/api.ts` types both change.

</code_context>

<specifics>
## Specific Ideas

- Perimeter hull = 2D convex hull of world-XY-projected **bounding-box corners** of `FRAME_`-tagged parts (v1). Never a single whole-robot bbox; never a 3D hull.
- Up-axis: **world +Z**; floor plane = world XY (drop Z). Disclosed as a caveat.
- Height = **whole-robot** max +Z extent in the measured configuration.
- Configuration: measure Onshape **default** config, disclose its name; caveat if multiple configs exist.
- Failure-direction preference: **prefer false FAIL over false PASS** — bbox overestimation is acceptable, disclosed via caveat.
- Empty state: no `FRAME_` parts → `UNKNOWN` + caveat "not yet checkable — no frame parts tagged" (reuses Phase 2 UNKNOWN pattern).
- Render: inline **SVG polygon + limit overlay** (hull outline, perimeter length + limit labeled, optional faint per-part footprints), self-contained, no chart lib.

</specifics>

<deferred>
## Deferred Ideas

- **≤¼-in minor-protrusion exception** to frame perimeter (STATE.md Phase 3 research flag) — the rule text is unverified (Game Manual PDF parse failed during research) and building it speculatively risks over-engineering v1. Flagged for the researcher to confirm; a deliberate v1 non-goal until then.
- **Tessellated-vertex hull measurement** — the accuracy upgrade over bounding-box corners (D-03). Pursue only if bbox overestimation proves inadequate against real CAD.
- **Named-configuration convention** (e.g. a `STARTING_` marker or a config named "Starting") for teams with multiple configurations — v1 measures + discloses the default config instead (D-06).
- **Game-Manual limit-value + exact rule-number verification** — R101 (110 in), R104/R107 (30 in) limits are still `limitStatus: PLACEHOLDER` (carried from Phase 1 D-08 and STATE.md blockers); reconcile the exact R-number(s) for starting height (R104 vs R107) and the verified limits against the live 2026 Game Manual. A data/verification task, not a code decision asserted here.
- **Trust-bar panel polish** (measured-context disclosure fields: document/tab/config/timestamp shown per verdict) — Phase 4 (RSLT-01/02/03). Phase 3 discloses the configuration inline via caveat but the full disclosure UI is Phase 4.
- v2 items already in `.planning/REQUIREMENTS.md` §v2 (webhook auto-refresh, FeatureScript, guided tagging, bumper coverage/extension checks) — untouched.

*Discussion stayed within phase scope — no new scope-creep ideas surfaced.*

</deferred>

---

*Phase: 03-frame-perimeter-height*
*Context gathered: 2026-07-09*

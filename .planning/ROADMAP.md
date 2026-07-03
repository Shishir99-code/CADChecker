# Roadmap: CADChecker — FRC Robot Legality Checker for Onshape

## Overview

CADChecker ships as four vertical MVP slices, each a thin end-to-end path through auth → API → check-engine → panel. Phase 1 de-risks the highest-uncertainty integration point (Onshape OAuth + panel context) and proves the entire plumbing chain with a manual "check now" trigger and a structured (but not-yet-trusted) report. Phase 2 makes weight verdicts trustworthy by shipping the material-default audit as a gate, then delivers both weight checks (R103, R408). Phase 3 tackles the highest-complexity check — frame/robot perimeter via floor-projected 2D convex hull — plus starting-configuration height, reusing the occurrence-traversal utility built in Phase 1. Phase 4 polishes the results panel into something a team can actually trust in front of an inspector: rule citations, explicit "not yet checkable" states, and full disclosure of what was measured and when.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Connected Foundation & First Check** - OAuth-connected panel runs a manual check-now and returns a structured, rule-cited report using a shared occurrence-traversal utility and versioned config (completed 2026-07-02)
- [ ] **Phase 2: Trustworthy Weight** - Material-default audit gates two separately-filtered weight verdicts (robot-only R103, robot+bumpers R408)
- [ ] **Phase 3: Frame Perimeter & Height** - Robot/frame perimeter (2D convex hull of tagged frame parts, rendered visually) and starting-configuration height checks
- [ ] **Phase 4: Trust-Bar Results Panel** - Every verdict cites its rule, discloses what was measured, and never silently passes when data is missing

## Phase Details

### Phase 1: Connected Foundation & First Check

**Goal**: A team can connect their Onshape document via OAuth, open the CADChecker panel inside the document view, click "check now," and get back a structured report — proving the entire integration chain (auth, context acquisition, typed API client, occurrence traversal, versioned config, pluggable check engine) end-to-end before any check's correctness is trusted.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: CONN-01, CONN-02, CONN-03, CONF-01, CONF-02, RUN-01
**Success Criteria** (what must be TRUE):

  1. User can authorize CADChecker against their Onshape account via OAuth2 and see the panel render inside a real Onshape document tab
  2. The panel correctly identifies the active document/workspace/element context at the moment "check now" is clicked (not a value cached at panel mount), so navigating to a different tab before clicking checks the right place
  3. A multi-hour session (or a simulated expired token) triggers a transparent token refresh, or a clearly labeled "session expired — reconnect" state that is visibly distinct from a real check failure
  4. Clicking "check now" returns a structured report (not a crash or blank state) whose rule limits and titles are loaded from a versioned, schema-validated season config file — never a hardcoded string
  5. The returned report is produced by a pluggable check engine calling a shared occurrence-traversal utility (subassembly walk + transforms + tag filtering) — verifiable by the engine registering more than one independent check function using the same underlying facts-gathering path

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Walking-skeleton auth slice: scaffold + Onshape OAuth + server-side session + iframe panel shell (CONN-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Pure check core: versioned zod-validated season config + shared occurrence-traversal + pluggable check engine (CONF-01/02, RUN-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Wiring slice: typed Onshape client + 401 refresh + live-context /api/check + report/Reconnect panel (CONN-02/03, RUN-01)

### Phase 2: Trustworthy Weight

**Goal**: A team sees a robot weight verdict they can actually trust — because CADChecker first audits every part for a missing/default material (the #1 cause of CAD weight silently diverging from the real robot) and refuses to report a confident pass/fail until that's accounted for.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: WGHT-01, WGHT-02, WGHT-03, WGHT-04
**Success Criteria** (what must be TRUE):

  1. User sees a material-audit result listing every part with a default/unset material — the exact set Onshape would otherwise silently omit from the mass total
  2. If any part is missing material, the weight check reports an explicit UNKNOWN state with the affected part count — never a confident numeric pass/fail computed on incomplete mass data
  3. Once all parts have material assigned, user sees a robot-weight verdict (R103, excluding bumpers/battery) computed from an occurrence-filtered mass query, compared against the season limit
  4. User separately sees a robot+bumpers weight verdict (R408) computed from a distinctly-filtered occurrence query (not the same number relabeled), compared against its own season limit

**Plans**: 3 plans

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Add getPartStudioMassProperties + getPartsMetadata typed methods to OnshapeClient, then live-verify the mass/material response contract (mass[0]=nominal-kg, SI units, parts[]→partId join key, material-absence rule) — blocking human-verify spike (WGHT-01, WGHT-03, WGHT-04)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — Extend Fact + Verdict shapes and ship the material audit end-to-end (enrichment merge + first-class audit row) (WGHT-01)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-03-PLAN.md — Two distinctly-filtered, per-verdict-gated weight verdicts (R103 robot-only, R408 robot+bumpers) + rules/2026.json unit fix (WGHT-02, WGHT-03, WGHT-04)

### Phase 3: Frame Perimeter & Height

**Goal**: A team sees their robot/frame perimeter and starting-configuration height checked against season limits, with the perimeter computed the way the rulebook actually defines it (a taut-string wrap = floor-projected 2D convex hull) and rendered so the team can sanity-check exactly what geometry was measured.
**Mode:** mvp
**Depends on**: Phase 1 (occurrence-traversal utility, check engine); benefits from Phase 2's proven check-engine wiring pattern
**Requirements**: GEOM-01, GEOM-02, GEOM-03
**Success Criteria** (what must be TRUE):

  1. User sees a robot/frame perimeter verdict (R101/R104) computed by projecting `FRAME_`-tagged parts onto the floor plane and taking the 2D convex hull of that projection — not a 3D hull and not a raw bounding box
  2. The computed hull is rendered visually in the panel so the team can see exactly which geometry was included, alongside which configuration was measured
  3. User sees a starting-configuration height verdict (R104/R107) against the season limit, with the measured configuration explicitly named/disclosed rather than assumed to be "whatever tab is open"
  4. If no `FRAME_`-tagged parts exist in the document, the perimeter check shows an explicit "not yet checkable — no frame parts tagged" state instead of a silent pass or a zero-value result

**Plans**: TBD

Plans:

- [ ] 03-01: TBD
- [ ] 03-02: TBD

### Phase 4: Trust-Bar Results Panel

**Goal**: A team can hand the CADChecker panel to a lead mentor or inspector and have every verdict stand on its own — citing the exact rule, the limit, the measured value, and precisely what document/tab/configuration/timestamp it reflects, with missing data always surfaced rather than hidden.
**Mode:** mvp
**Depends on**: Phase 1, Phase 2, Phase 3 (polishes all prior checks' presentation)
**Requirements**: RSLT-01, RSLT-02, RSLT-03
**Success Criteria** (what must be TRUE):

  1. Every check in the results panel shows pass/fail (or its non-pass state) alongside the rule number, rule title, the season limit, and the actual measured value — for all checks shipped in Phases 1-3
  2. Any check that cannot run for any reason (missing `FRAME_` tags, parts missing material, no starting configuration found) shows an explicit "not yet checkable" state with a plain-language reason — never a silent pass and never a blank row
  3. Every verdict on the panel discloses the document, tab/element, configuration, and timestamp it was measured against, so a team can tell at a glance whether a result is stale
  4. Re-running "check now" after making a CAD edit updates all four disclosure fields (document/tab/config/timestamp) together, so no verdict can display a mismatched combination of old geometry and new timestamp (or vice versa)

**Plans**: TBD

Plans:

- [ ] 04-01: TBD
- [ ] 04-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Connected Foundation & First Check | 3/3 | Complete    | 2026-07-02 |
| 2. Trustworthy Weight | 0/3 | Not started | - |
| 3. Frame Perimeter & Height | 0/2 | Not started | - |
| 4. Trust-Bar Results Panel | 0/2 | Not started | - |

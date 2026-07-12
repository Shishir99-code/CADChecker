# Requirements: CADChecker — FRC Robot Legality Checker for Onshape

**Defined:** 2026-07-01
**Core Value:** Surface FRC rule violations in a team's CAD design *before* in-person inspection, so problems are caught and fixed at design time.

## v1 Requirements

Requirements for the initial release — the smallest end-to-end useful slice. Each maps to a roadmap phase. All checks cite the specific rule number they enforce and must never present a silent pass when data is missing.

### Connection & Context

- [x] **CONN-01**: User can connect CADChecker to Onshape via OAuth2 and authorize access to a document
- [x] **CONN-02**: The panel loads inside the Onshape document view and correctly identifies the active document / workspace / element context (re-derived at check time, not cached at mount)
- [x] **CONN-03**: The Onshape session stays valid across a multi-hour CAD session (access-token refresh handled transparently; "session expired" is distinguished from a real failure)

### Rule Configuration

- [x] **CONF-01**: Season rule limits (robot perimeter, starting height, weight excl. bumpers/battery, weight incl. bumpers) load from a versioned per-season config file, validated at load — never hardcoded
- [x] **CONF-02**: Each rule limit in config carries its rule number and title so checks can cite them (e.g. R101, R103, R104, R408), reflecting current-season terminology

### Running Checks

- [x] **RUN-01**: User can manually trigger a legality check ("check now") for the active document and get a structured pass/fail report back

### Weight & Material

- [x] **WGHT-01**: The tool audits every part for a default/unset material and flags any that would be silently omitted from the mass total (material audit)
- [x] **WGHT-02**: The weight verdict is gated on the material audit — if parts are missing material, weight reports UNKNOWN (with the count), never a confident pass/fail
- [x] **WGHT-03**: User sees a robot-weight check excluding bumpers and battery against the season limit (R103), using an occurrence-filtered mass query
- [x] **WGHT-04**: User sees a robot-plus-bumpers weight check against the season limit (R408), using a separately-filtered mass query

### Geometry Checks

- [ ] **GEOM-01**: User sees a robot/frame perimeter check computed as the 2D convex hull of the floor-plane projection of `FRAME_`-tagged parts, compared against the season limit (R101/R104) — REOPENED 2026-07-10: enrichment join broken (CR-01, Fact.partId is instance id not CAD partId → always UNKNOWN live); gap closure pending
- [~] **GEOM-02**: The computed hull is rendered visually so the team can sanity-check what was measured, and the check discloses which configuration was measured — PARTIAL: render code correct but starved of real hull data by GEOM-01's broken join
- [x] **GEOM-03**: User sees a starting-configuration height check against the season limit (R104/R107), disclosing which configuration was measured

### Results Panel

- [x] **RSLT-01**: The panel lists each check as pass / fail, citing the rule number + title, the limit, and the actual measured value
- [x] **RSLT-02**: Checks that cannot run (e.g. no `FRAME_`-tagged parts, missing material) show an explicit "not yet checkable" state — never a silent pass
- [x] **RSLT-03**: Every verdict shows the document / tab / configuration / timestamp it was measured against

## v2 Requirements

Deferred to future releases. Tracked but not in the current roadmap.

### Live Feedback

- **WEBH-01**: Panel auto-refreshes a few seconds after an edit via Onshape webhooks (`onshape.model.lifecycle.changed`), replacing the manual "check now" click
- **FSCR-01**: A FeatureScript custom feature gives instant, in-Part-Studio feedback on the simplest checks (height, gross bounding box) with zero external-server latency

### Assisted Tagging

- **TAG-01**: Guided first-run flow helps a team apply `FRAME_`/`BUMPER_`/`MECH_` name-prefix tags to an existing assembly (heuristic-assisted rename; never auto-classifies without confirmation; never writes custom properties)

### Additional Checks

- **BUMP-01**: Bumper extension-from-perimeter check (R403)
- **EXTN-01**: Extension-limit checks across configurations (R105–R108) — requires Configurations API enumeration
- **BCOV-01**: Bumper coverage / gap analysis (R401/R405/R406) — segment/gap curve math

### Scale

- **HIST-01**: Historical trend tracking of check results over time (requires a datastore)
- **MULT-01**: Multi-document / whole-team dashboard

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Electrical / motor / pneumatic / software / cost / safety rule checks | No geometric signature in CAD — any result would be an unverifiable guess that destroys trust. Permanent, not deferred. |
| Auto-inferring "frame" geometry without tagging | R101's frame definition isn't inferable from raw geometry; guessing produces confidently-wrong perimeters. Tagging is required. |
| Treating a green dashboard as inspection-equivalent | The tool checks a narrow CAD-inferable subset; it complements, never replaces, official inspection. |
| Auto-fixing violations | The tool reports; changing a team's CAD automatically would erode trust and correctness. |
| Onshape custom properties for tagging | Requires Company/Enterprise-admin setup many FRC teams lack; name-prefix convention is universally available. |
| Physical robot / hardware inspection | Pure CAD-analysis tool by design; validated against public team CAD, not physical robots. |
| Server-side datastore in v1 | Onshape holds tags/geometry; rule limits ship as config; only a session OAuth token is held. |
| Onshape App Store listing / publishing | Later concern; not needed to deliver value to a team using the app directly. |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Complete |
| CONN-02 | Phase 1 | Complete |
| CONN-03 | Phase 1 | Complete |
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| RUN-01 | Phase 1 | Complete |
| WGHT-01 | Phase 2 | Complete |
| WGHT-02 | Phase 2 | Complete |
| WGHT-03 | Phase 2 | Complete |
| WGHT-04 | Phase 2 | Complete |
| GEOM-01 | Phase 3 | Reopened (CR-01 broken join) |
| GEOM-02 | Phase 3 | Partial |
| GEOM-03 | Phase 3 | Complete |
| RSLT-01 | Phase 4 | Complete |
| RSLT-02 | Phase 4 | Complete |
| RSLT-03 | Phase 4 | Complete |

**Coverage:**

- v1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-01*
*Last updated: 2026-07-01 after roadmap creation (100% v1 coverage across 4 phases)*

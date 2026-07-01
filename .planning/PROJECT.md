# CADChecker — FRC Robot Legality Checker for Onshape

## What This Is

An Onshape-integrated legality checker for FIRST Robotics Competition (FRC) robots. Teams design their robot in Onshape CAD, and CADChecker continuously checks the design against the current season's official robot construction rules — frame perimeter size, weight limits, starting height, and material/mass accuracy — surfacing violations *before* the team ever reaches an in-person inspection.

The primary surface is an **Onshape Extension**: a web app registered as an Onshape OAuth app that renders as a panel/tab inside the Onshape document view. It shows a live pass/fail dashboard, and every check cites the specific rule number it enforces (e.g. R101, R104). A secondary surface (later phase) is a lightweight **FeatureScript custom feature** for instant, always-on feedback on the simplest checks with zero external-server latency.

It is for FRC teams (and their CAD leads/students) who design in Onshape and want to catch rule violations early. No physical robot or hardware access is required — this is a pure CAD-analysis tool.

## Core Value

Surface FRC rule violations in a team's CAD design *before* in-person inspection, so problems are caught and fixed at design time rather than at competition.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**v1 (Phase 1) — smallest end-to-end useful slice:**

- [ ] OAuth2 connection to a single Onshape document
- [ ] Manual "check now" trigger (no webhooks yet)
- [ ] Total assembly weight check (via Onshape mass-properties API) vs season limit
- [ ] Material-default audit — flag any part still using Onshape's generic/default material (the #1 cause of CAD weight diverging from the real robot)
- [ ] Frame perimeter check — 2D convex hull of the floor-level projection of name-tagged frame parts, compared to the season's limit
- [ ] Starting-configuration height check
- [ ] Results panel listing each check as pass/fail with the cited rule number

**Later phases (documented, not abandoned):**

- [ ] Onshape Webhooks (`onshape.model.lifecycle.changed`) to auto-refresh the panel a few seconds after edits, replacing the manual "check now" click
- [ ] FeatureScript custom feature for instant in-Part-Studio checks (height, gross bounding box)
- [ ] Guided first-run tagging flow — a rename-assist tool that helps a team apply the naming-convention tags to an existing assembly (renames parts; never writes custom-property values)
- [ ] Extension-limit checks across configurations
- [ ] Bumper coverage / gap analysis
- [ ] Onshape App Store listing / publishing

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Webhooks / auto-refresh — v1 uses a manual "check now" trigger; auto-refresh is a later phase
- FeatureScript custom feature — deeper Extension checks come first; FeatureScript complements them later
- Guided in-panel tagging flow — v1 reads existing tags only; guided rename-assist is a later phase
- Extension-limit checks across configurations — later phase
- Bumper coverage / gap analysis — later phase
- Onshape App Store listing / publishing — later phase
- Physical robot / hardware inspection — this is a pure CAD-analysis tool by design; validated against publicly released team CAD, not physical robots
- Onshape **custom properties** for tagging — rejected in favor of a naming convention (see Key Decisions); custom properties require Company/Enterprise-admin setup many teams lack
- Server-side datastore in v1 — Onshape holds all persistent state (part tags, geometry); rule limits ship as versioned config

## Context

- **Domain:** FRC robot construction rules change slightly year to year via the official FRC Game Manual / Inspection Checklist. 2026 season values: frame perimeter ≤ 110 in, starting height ≤ 30 in, robot weight ≤ 115 lbs (excluding bumpers/battery), robot + bumpers ≤ 135 lbs. Store these as **versioned config**, not hardcoded constants.
- **Frame perimeter definition:** FRC rule R101 defines it as a taut-string wrap around the floor-level projection of the frame — mathematically the 2D convex hull of those points. It is *not* automatically inferable from raw geometry, which is why parts must be tagged so the tool knows which geometry counts as "frame."
- **Tagging mechanism:** Parts/subassemblies are tagged by **name-prefix convention** (`FRAME_`, `BUMPER_`, `MECH_`), read via the standard Onshape Parts API. This deliberately avoids Onshape custom properties, which require admin-level company/enterprise setup that many teams don't have.
- **Material-default audit rationale:** Unset/default materials are the #1 reason CAD weight is wrong versus the real robot; catching them is high-leverage for weight accuracy.
- **Validation strategy:** No physical robot access. Validate against publicly released team CAD documents on Chief Delphi and GrabCAD (e.g., teams 1690, 254 post full Onshape links most seasons) rather than physical inspection.

## Constraints

- **Integration**: Onshape REST API (OAuth2, Assemblies API, Part Studios API, mass-properties endpoints) — the app is fundamentally an Onshape OAuth application rendered as a document panel.
- **Tech stack**: To be recommended by domain research (Onshape SDK availability, mass-properties API examples, convex-hull geometry needs) — no preference locked in yet.
- **State**: v1 is stateless — only an in-memory/session OAuth token; Onshape is the source of truth for tags and geometry; rule limits are shipped versioned config. No database in v1.
- **Rule limits**: Stored as versioned per-season config, never hardcoded, because they change annually.
- **Validation data**: Public team CAD documents only; no physical/hardware feedback loop.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Onshape Extension (OAuth panel app) is the primary surface; FeatureScript is secondary/later | The panel can call the mass-properties and Parts APIs for the deep checks; FeatureScript is limited but complements it later | — Pending |
| Tag parts by **name-prefix convention** (`FRAME_`/`BUMPER_`/`MECH_`), read via Parts API — **not** Onshape custom properties | Custom properties require Company/Enterprise-admin setup many FRC teams lack; naming is universally available | — Pending |
| Frame perimeter = 2D convex hull of floor-level projection of tagged frame parts | Convex hull is the mathematical form of R101's taut-string-wrap definition | — Pending |
| Rule limits stored as versioned per-season config | Limits change yearly via the Game Manual / Inspection Checklist | — Pending |
| v1 is stateless (no datastore); Onshape holds persistent state | Smallest useful slice; tags live in the document, limits ship as config | — Pending |
| v1 tagging is read-only; guided tagging (a rename-assist flow) is a later phase | Keeps v1 small; even the later flow renames parts, never writes custom properties | — Pending |
| Validate against public team CAD (Chief Delphi / GrabCAD), not physical robots | No hardware access; public Onshape links are available and representative | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-30 after initialization*

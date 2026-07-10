# Phase 3: Frame Perimeter & Height - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 3-frame-perimeter-height
**Areas discussed:** Hull geometry source, Up-axis/floor & height, Starting configuration, Hull visual render

---

## Hull geometry source

| Option | Description | Selected |
|--------|-------------|----------|
| Bounding-box corners | Fetch each FRAME_ part's bbox, transform 8 corners to world, project, hull. Fast/simple; overestimates angled rails → reads slightly large. | |
| Tessellated vertices | Fetch tessellatedfaces mesh vertices, transform, project, hull. Faithful taut-string; many calls + big payloads. | |
| You decide | Pick after verifying payload sizes and bbox overestimate against real CAD in planning. | ✓ |

**User's choice:** You decide → resolved to bounding-box-corners for v1 via the follow-up below.
**Notes:** Follow-up asked which failure direction to prefer near the limit (since bbox reads large).

### Follow-up: preferred failure direction

| Option | Description | Selected |
|--------|-------------|----------|
| Prefer false FAIL | Occasionally flag a legal robot rather than ever pass a robot that would fail inspection. Makes bbox overestimation acceptable. | ✓ |
| Prefer false PASS | Only FAIL when confident; push toward tessellation. | |
| Must be exact | Invest in tessellation now. | |

**User's choice:** Prefer false FAIL.
**Notes:** Locks bounding-box-corners for v1 with a disclosed measurement-method caveat; tessellation is the documented upgrade path. Verify overestimate magnitude against real public team CAD during planning.

---

## Up-axis, floor plane & height

### Up-axis / floor plane

| Option | Description | Selected |
|--------|-------------|----------|
| Assume world +Z up | Project onto world XY; height = world +Z extent. Disclose the assumption in a caveat. | ✓ |
| Infer up-axis | Derive 'up' from geometry/principal axes. Robust but heuristic, no clean API answer. | |
| Let team specify | Team declares up-axis via a convention. Correct but adds tagging burden. | |

**User's choice:** Assume world +Z up.
**Notes:** Disclosed as a caveat so a mis-oriented model is explainable.

### Height measurement scope

| Option | Description | Selected |
|--------|-------------|----------|
| Whole robot | Max +Z extent across ALL parts in the measured config. Matches inspector intent. | ✓ |
| FRAME_ parts only | +Z extent of only FRAME_ parts. Simpler but misses tall mechanisms → could pass a too-tall robot. | |
| Exclude bumpers/battery | Whole robot minus BUMPER_/BATTERY_. Unverified against Game Manual; over-engineering risk. | |

**User's choice:** Whole robot.
**Notes:** A mechanism/arm above the frame counts against the height rule.

---

## Starting configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Default config + disclose | Measure Onshape's default config (already fetched) and disclose its name; caveat if multiple configs exist. | |
| Named-config convention | Look for a config named 'Starting'/a STARTING_ marker; fall back to default. More correct, more scope. | |
| You decide | Pick after checking whether test CAD docs use configurations. | ✓ |

**User's choice:** You decide → resolved to default-config + disclosure for v1.
**Notes:** Named-config convention documented as a future upgrade. Confirm during planning whether test docs use configurations.

---

## Hull visual render

| Option | Description | Selected |
|--------|-------------|----------|
| Inline SVG polygon | Top-down SVG of the hull outline + perimeter length/limit labels; self-contained, no chart lib. | |
| SVG + limit overlay | The polygon PLUS a visual limit reference so over-perimeter is visible at a glance. | ✓ |
| Coordinate list now | Ship vertices + length as text; defer the drawing to Phase 4. | |

**User's choice:** SVG + limit overlay.
**Notes:** Strongest sanity-check value; genuine Phase-3 deliverable (SC2), distinct from the deferred general styling pass. Server must return hull geometry (and optionally per-part footprints) to the panel.

---

## Claude's Discretion

- **Geometry source mechanism** — user said "you decide"; resolved to bounding-box-corners (D-01/D-02) with the prefer-false-FAIL guidance. Verify overestimate magnitude + payload sizes against real CAD in planning before committing; tessellation upgrade only if inadequate.
- **Configuration selection** — user said "you decide"; resolved to default-config + disclosure (D-06). Confirm test docs' configuration usage in planning.
- **Convex hull implementation** — `d3-polygon` (not yet installed) vs hand-rolled hull is the planner's call.
- **Enrichment shape & placement** — exact enriched-`Fact` geometry field and per-part-bbox vs assembly-level bbox call left to the planner, following Phase 2's route-enrichment pattern.
- **Height as a separate CheckFn vs shared enrichment** — planner's call; both consume the same enriched facts.

## Deferred Ideas

- ≤¼-in minor-protrusion exception to frame perimeter (STATE.md research flag; rule text unverified) — flagged for the researcher, v1 non-goal.
- Tessellated-vertex hull measurement — accuracy upgrade path over bounding-box corners.
- Named-configuration convention for multi-config teams.
- Game-Manual limit-value + exact rule-number verification (R101 110in, R104/R107 30in still PLACEHOLDER; reconcile R104 vs R107 for starting height).
- Trust-bar panel disclosure fields (document/tab/config/timestamp per verdict) — Phase 4 (RSLT-01/02/03).

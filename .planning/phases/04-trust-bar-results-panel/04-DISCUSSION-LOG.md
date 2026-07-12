# Phase 4: Trust-Bar Results Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 4-trust-bar-results-panel
**Areas discussed:** Plumbing-check disposition, Context disclosure shape, "Not yet checkable" display, Visual "trust bar" scope

---

## Plumbing-check disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Retire from panel | Unregister occurrenceCountCheck + frameTagPresenceCheck from buildEngine(); panel shows only the 5 real rule checks; the R101/R103 collision disappears. | ✓ |
| Keep but relabel honestly | Stop positional rules[] citation; move to a separate non-rule "diagnostics" area. | |
| You decide | (Lean was Retire.) | |

**User's choice:** Retire from panel
**Notes:** No real signal lost — framePerimeterCheck already carries its own "no FRAME_ parts tagged" UNKNOWN state; occurrenceCountCheck was pure plumbing evidence. Retiring resolves the pre-existing citation collision flagged in STATE.md / 03 deferred-items.md.

---

## Context disclosure shape (RSLT-03 / SC3–4)

| Option | Description | Selected |
|--------|-------------|----------|
| Human names, shared header | Resolve document/tab/config names; show all four + timestamp in ONE panel header block above the table. | ✓ |
| Raw ids, shared header | Show the existing id hashes + config + timestamp; no name-resolution calls. | |
| Per-verdict disclosure | Repeat document/tab/config/timestamp on every row. | |

**User's choice:** Human names, shared header
**Notes:** Tab name is already in the getElementsInDocument response the route fetches; document/config name resolution is a planning research flag. Single shared block satisfies SC4's atomic-update requirement naturally.

### Re-check behavior (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Clear, then show fresh | Clear old results + header, show checking state, render new header + verdicts together atomically on response. | ✓ |
| Dim stale, then swap | Keep previous results dimmed with a checking badge, swap block atomically on response. | |
| You decide | (Lean was Clear-then-show.) | |

**User's choice:** Clear, then show fresh
**Notes:** Makes an old-geometry/new-timestamp mismatch structurally impossible (the point of SC4). Brief empty state during the check is acceptable. v1 has no active stale-detection (webhooks = v2); the timestamp is the staleness signal.

---

## "Not yet checkable" display (RSLT-02 / SC2)

| Option | Description | Selected |
|--------|-------------|----------|
| Relabel + reason from caveats | UNKNOWN badge → "NOT YET CHECKABLE" (distinct yellow); render each check's own reason from existing caveats[]; no Verdict schema change, fix ReportTable. | ✓ |
| Add explicit reason field | Add a dedicated unknownReason string to Verdict; touches engine.ts + api.ts + every UNKNOWN check. | |
| You decide | (Lean was Relabel + reason from caveats.) | |

**User's choice:** Relabel + reason from caveats
**Notes:** The only real bug is the panel hardcoding "N parts missing material" for all UNKNOWNs; per-check reasons already exist in caveats[]. Planner must audit each UNKNOWN branch to ensure it emits a clear plain-language reason caveat.

---

## Visual "trust bar" scope

| Option | Description | Selected |
|--------|-------------|----------|
| Structural + light polish here | Ship all data/states/disclosure with just-enough layout (header block, consistent badges, readable grouping); no CSS framework / design-system pass; full visual design optional later via /gsd-ui-phase. | ✓ |
| Full visual pass here | Fold a real design system (typography, color tokens, polished layout) into Phase 4. | |
| Structural only, defer all visuals | Data/states only with today's bare styling; all look-and-feel deferred. | |

**User's choice:** Structural + light polish here
**Notes:** Unblocks the "don't style until checks are real" memory (checks are now real) without pulling a full design pass into this mvp phase.

---

## Claude's Discretion

- Whether retired check functions are deleted or left as unregistered dead code.
- Cheapest document-name / configuration-name resolution path (research flag, verify against live API during planning).
- Whether to add relative-time ("N min ago") alongside the absolute timestamp.
- Exact header-block layout and how "light polish" is realized within the no-framework constraint.

## Deferred Ideas

- Full visual design pass (typography scale, color/semantic tokens, dashboard layout, responsive) → optional follow-on /gsd-ui-phase.
- Active staleness detection / auto-refresh on CAD edit → needs webhooks, v2 (WEBH-01).
- Named-configuration selection convention (STARTING_ marker) → deferred from Phase 3, still deferred.
- Game-Manual limit-value + exact rule-number verification (R101/R104 PLACEHOLDER) → carried data/verification task, not a Phase-4 code decision.

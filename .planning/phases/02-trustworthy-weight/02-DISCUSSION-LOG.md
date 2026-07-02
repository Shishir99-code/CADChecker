# Phase 2: Trustworthy Weight - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 2-trustworthy-weight
**Areas discussed:** Weight display units, Bumper/battery filtering, Material-audit surfacing, UNKNOWN gating & partial number

---

## Weight display units

| Option | Description | Selected |
|--------|-------------|----------|
| Pounds (convert from kg) | Display measured + limit in lbs, converting the kg API value at the boundary. Requires fixing rules/2026.json unit. | |
| Kilograms (raw API units) | Show kg as Onshape returns it, no conversion. | |
| Both (lb primary, kg secondary) | Pounds headline with kg in parentheses. | ✓ |

**User's choice:** Both (lb primary, kg secondary)
**Notes:** kg remains canonical internally; convert kg→lb at display boundary. rules/2026.json unit field to be corrected from kg to lb (values stay PLACEHOLDER).

---

## Bumper/battery filtering — battery identification

| Option | Description | Selected |
|--------|-------------|----------|
| BATTERY_ name prefix | Extend the FRAME_/BUMPER_/MECH_ prefix convention. Explicit, read-only. | ✓ |
| Name-contains heuristic | Match parts whose name contains 'battery'. Lower burden, fuzzier. | |
| Prefix + fallback heuristic | Prefer BATTERY_, fall back to name-contains and disclose. | |

**User's choice:** BATTERY_ name prefix
**Notes:** Filtering math: R103 = total − BUMPER_ − BATTERY_; R408 = total − BATTERY_.

---

## Bumper/battery filtering — missing-tag case

| Option | Description | Selected |
|--------|-------------|----------|
| Disclose as a caveat, still compute | Compute the verdict but attach a visible note that exclusion couldn't be applied. | ✓ |
| Compute silently | No caveat; risks silently-inflated number. | |
| Treat as not-yet-checkable | Report UNKNOWN until battery tagged. Over-strict. | |

**User's choice:** Disclose as a caveat, still compute
**Notes:** Requires a caveats/notes field on the check output.

---

## Material-audit surfacing — detail

| Option | Description | Selected |
|--------|-------------|----------|
| Full list of offending part names | Each part missing material by name + count. Most actionable. | ✓ |
| Count only | 'N parts missing material.' Weaker on 'lists every part.' | |
| Count + expandable list | Headline count with list on demand. Adds interaction. | |

**User's choice:** Full list of offending part names (+ count)

---

## Material-audit surfacing — scope

| Option | Description | Selected |
|--------|-------------|----------|
| Only weight-contributing parts | Audit exactly the occurrences that feed weight totals. | ✓ |
| Every part in the assembly | Audit all occurrences regardless of exclusion. Broader but noisier. | |

**User's choice:** Only weight-contributing parts

---

## UNKNOWN gating — partial number

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress the number entirely | UNKNOWN + count + offending list, no weight figure. Strongest reading of Criterion 2. | ✓ |
| Show a labeled floor value | 'at least X lb (incomplete)'. More informative, risks being mistaken for real. | |

**User's choice:** Suppress the number entirely

---

## UNKNOWN gating — gate scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-verdict gating | A missing-material part only marks the verdict(s) it feeds as UNKNOWN. | ✓ |
| Gate both together | Any weight-contributing part missing material marks BOTH R103 and R408 UNKNOWN. | |

**User's choice:** Per-verdict gating
**Notes:** Engine must track which parts feed which total (R103 excludes bumpers, R408 includes them).

---

## Claude's Discretion

- Extending the shared `Fact` shape with mass + material fields (route enriches facts; checks stay pure — no async checks, no client access from checks).
- Mass-query approach (assembly-level filtered mass-properties vs per-part summation) — planner, informed by research; verify live JSON shape first.
- Exact detection rule for "default/unset material" (field/semantics in the API response).
- Whether material state comes from the mass-properties call or a separate parts-metadata query.

## Deferred Ideas

- Verifying/replacing PLACEHOLDER limit values against the live Game Manual (data/verification task, not a Phase 2 code decision; unit-field fix IS in scope).
- Panel UI/styling pass — deferred until checks compute real values (`/gsd-ui-phase` later).

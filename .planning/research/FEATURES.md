# Feature Research

**Domain:** FRC (FIRST Robotics Competition) robot legality/inspection checking, applied to CAD (Onshape) rather than physical robots
**Researched:** 2026-06-30
**Confidence:** MEDIUM-HIGH (rule taxonomy and Onshape API behavior verified via official/community sources; exact current-year rule numbers should be pinned against the live 2026 manual PDF at implementation time — see Sources)

## Domain Context: How FRC Legality Checking Normally Works

There is no existing dedicated "CAD legality checker" product in the FRC ecosystem (verified via search — Onshape4FRC, FRCDesign.org, and team FeatureScript libraries provide CAD *tooling* for FRC but nothing that audits a design against the Game Manual). Today, teams self-check using:

1. **The official FRC Inspection Checklist** (PDF, published yearly by FIRST) — the literal document a physical inspector fills out at competition. It groups checks into sections: Robot Dimensions/Weight, Bumpers, Electrical, Pneumatics, Software/Control System, Safety.
2. **The Game Manual "R" (Robot Construction) rules** — the authoritative rule text. Numbered roughly by family:
   - **R1xx** — Robot perimeter, starting configuration, weight, height, extension limits
   - **R2xx** — General safety (sharp edges, field damage, prohibited devices)
   - **R3xx** — Cost limits, fabrication timing (COTS/custom part rules)
   - **R4xx** — Bumpers (construction, coverage, gaps, corners, weight, markings)
   - **R5xx** — Motors (legal motor list, motor count/usage limits)
   - **R6xx** — Battery and power distribution
   - **R7xx** — Control system and communications (roboRIO, radio, network)
   - **R8xx** — Pneumatics
3. **Manual spreadsheets/CAD spot-checks** — teams eyeball bounding boxes and sum up part masses by hand; error-prone and usually done once late in the build season, not continuously.

This confirms the product's premise: a gap exists between "design in CAD" and "know if it's legal," and it's currently closed by manual, late-cycle, error-prone human effort. CADChecker's differentiator is closing that gap continuously and automatically for the CAD-inferable subset of rules.

**Important scope-defining fact:** the Game Manual defines only a handful of rules that are pure-geometry/pure-mass-property questions (R1xx dimensional rules, some R4xx bumper geometry). The overwhelming majority of R-rules (electrical, control system, pneumatics, motors, safety, cost) are **not** inferable from CAD at all — they require BOM/wiring/part-catalog knowledge or physical inspection. This is the single most important scoping fact for this tool: the addressable rule surface from CAD alone is inherently narrow, and that narrowness is by design, not a shortcoming.

## Concrete FRC Construction-Rule Checks Mapped to Rule Families

| # | Check | Rule Family (2025/2026 numbering, verify against live manual) | CAD-feasible? | Notes |
|---|-------|------|----------------|-------|
| 1 | Robot perimeter ≤ season limit (110 in 2026) | R101/R104 (perimeter definition + max size) | YES, with tagging | 2D convex hull ("taut string") of floor-projected FRAME_ parts in starting configuration. Requires knowing which parts are "frame" — not inferable from geometry alone. |
| 2 | Starting-configuration height ≤ season limit (30 in 2026) | R104/R107 | YES | Bounding-box Z-extent of the full assembly (or a specific "starting configuration" named configuration) — no tagging needed if the model's default/named config represents starting state correctly. |
| 3 | Robot weight (excl. bumpers/battery) ≤ 115 lb | R103 | YES, with caveats | Onshape mass-properties API on assembly minus BUMPER_-tagged parts and battery placeholder. Accuracy fully depends on every part having a correct material assigned (see check #6). |
| 4 | Robot + bumpers weight ≤ 135 lb | R408 | YES, with caveats | Same as above but including BUMPER_ tagged parts; also depends on whether bumper foam/wood/cloth mass is even modeled (often it's a rough block, not accurate density). |
| 5 | No starting-configuration overhang beyond perimeter (except bumpers/minor protrusions) | R102 | PARTIAL | Geometrically checkable (any non-BUMPER_ geometry outside the convex hull footprint, projected vertically) but "minor protrusions ≤0.25 in" carve-out requires a tolerance threshold, and distinguishing "structural" vs "minor" protrusions from raw geometry is unreliable without tagging discipline. |
| 6 | Material-default audit (parts using Onshape's generic/no material) | Not a Game Manual rule directly — a **CAD hygiene check** that gates the accuracy of R103/R107/R408 | YES — fully CAD-native | Onshape's own behavior: a part with no material assigned contributes **zero mass** to mass-properties, not an estimate. This is a silent, invisible failure mode that makes weight checks confidently wrong. This is arguably the single highest-leverage check in the whole tool because it's a precondition for every mass-based check being trustworthy. |
| 7 | Horizontal extension limit (≤12 in beyond perimeter, one side at a time) | R105/R106 | PARTIAL / later phase | Requires enumerating *configurations* (Onshape assembly configurations representing extended mechanism states), computing perimeter-relative bounding box per configuration, and checking "only one side extended at a time." Feasible in principle via the Configurations API but materially harder than static checks — explicitly deferred in PROJECT.md. |
| 8 | Vertical extension limit (total height ≤30 in, all configurations) | R107 | PARTIAL / later phase | Same configuration-enumeration complexity as #7. Height-in-starting-configuration (check #2) is easy; height-across-all-possible-mechanism-states is not, because Onshape configurations may not exhaustively represent every physically reachable robot pose (e.g., continuous-rotation mechanisms, soft/flexible members). |
| 9 | Extension floor-interaction (extensions can't lift bumpers off the floor zone) | R108 | NO / not reliably | Requires kinematic/physics reasoning (would extending this mechanism physically lift the robot?) that static CAD geometry checks cannot answer. Out of scope. |
| 10 | Bumper coverage — gaps ≤1.25 in between segments, corner-fill rule | R401/R406 | PARTIAL / later phase | Geometrically computable (arc-length gaps between BUMPER_-tagged solids along the perimeter) but needs careful 3D-curve/segment logic and reliable BUMPER_ tagging of every bumper segment. Explicitly listed as a later phase in PROJECT.md. |
| 11 | Bumper zone height (2.5–5.75 in from floor, fully filled) | R405 | PARTIAL / later phase | Bounding-box/solid-fill check per bumper segment vs the zone's Z-range — feasible but adds complexity; bumper *padding vs backing* material distinction is generally not something CAD models represent faithfully (padding is soft foam, often abstracted as a solid block). |
| 12 | Bumper max extension from perimeter (≤4 in) | R403 | YES, with tagging | Straightforward distance-from-hull check on BUMPER_ tagged geometry once perimeter hull exists — natural extension of check #1's geometry. |
| 13 | Bumper hard-part limit (≤1.25 in of "hard" bumper material) | R404 | NO / not reliably | Requires knowing which bumper sub-geometry is "hard" (wood backing) vs "soft" (foam) — CAD models rarely distinguish these as separate parts with correct materials, and even when they do, the semantic classification isn't derivable from geometry alone. Needs tagging convention at minimum; likely still unreliable. |
| 14 | Frame electrical isolation (>120Ω from battery post to chassis) | R611 | NO | Purely an electrical/wiring property; has no CAD-geometric signature at all. Out of scope by definition. |
| 15 | Battery restrictions (only 1 legal SLA battery, correct connector, secured) | R601–R607 | NO / weak signal at best | Whether a battery is modeled in CAD at all is a documentation nicety, not a legality signal — the physical battery's presence/security can't be verified from a 3D model. At most CAD can note "no battery-shaped part found" as a documentation gap, not a rule check. |
| 16 | Cost limit per non-KOP item (≤$600 FMV) | R301 | NO | Requires cost/BOM data with no CAD-geometric correlate; Onshape doesn't track this natively unless teams add custom BOM cost fields (which the project has already ruled out relying on, per PROJECT.md's rejection of custom properties). |
| 17 | Motor count / motor legality (≤4 drive motors, from approved list) | R501/R502 | NO | Requires a parts catalog of "which CAD part = which real motor SKU" plus semantic classification of "propulsion" vs "mechanism" motor — not geometrically inferable, and misclassifying even correctly-modeled COTS motor CAD would produce false confidence. |
| 18 | Wiring, breakers, fuses, PD/PDH correctness | R6xx/R7xx (electrical/control) | NO | Electrical schematic properties entirely outside CAD geometry's domain, even if wire CAD routing exists in the model (most teams don't model wiring in CAD at all). |
| 19 | Pneumatics legality (pressure ratings, permitted parts only) | R8xx | NO | Same reasoning as electrical — pressure/certification properties aren't geometric. |
| 20 | Software/control system checks (roboRIO image version, radio config) | Inspection Checklist software section | NO | Has zero relationship to CAD; entirely a robot-code/firmware concern. |
| 21 | Safety — no sharp edges / prohibited devices | R202/R203 | NO / weak signal at best | "Sharp edge" is a qualitative human-safety judgment (edge-break radius, deburring) that generic mesh/geometry analysis cannot reliably assess; false positives/negatives would erode trust. Not attempted. |

**Summary of the CAD-feasible frontier:** Checks 1–6 are the geometrically/mass-property "core" that is both fully checkable from Onshape APIs and squarely matches what PROJECT.md already scopes for v1. Checks 7–13 are geometrically *possible* but require either (a) enumerating configurations, (b) finer-grained tagging semantics (hard vs soft bumper material), or (c) segment/gap curve math — all explicitly deferred to later phases in PROJECT.md, consistent with this research. Checks 14–21 are not meaningfully inferable from CAD at all and should remain permanently out of scope, not just deferred.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OAuth connection to a specific Onshape document | Any Onshape Extension must authenticate and scope to a document; without it there's no product | LOW-MEDIUM | Standard Onshape OAuth2 app flow; well-documented. |
| Weight check vs season limit (R103) | The single most-asked "will we make weight" question every FRC team has | LOW-MEDIUM | Onshape mass-properties API call; complexity is mostly in correctly excluding bumpers/battery per the rule's carve-outs. |
| Material-default audit | Table stakes *because* it's a precondition for weight/height trust — a tool that reports weight without flagging unset materials would report confidently wrong numbers | LOW-MEDIUM | Iterate Parts API for material assignment == null/generic; Onshape's own semantics (no material = zero mass, not an estimate) make this check especially high-value and low-complexity to justify. |
| Frame perimeter check vs season limit (R101/R104) | This is the rule every mentor mentions first ("did we blow perimeter") — a legality tool without it isn't credible | MEDIUM-HIGH | Needs 2D convex hull of floor-projected tagged frame geometry; convex hull algorithm itself is well-trodden, but correctly projecting 3D tagged solids to a floor-plane point set needs care (which points to include: all vertices? silhouette only?). |
| Starting-configuration height check (R104/R107 static case) | Second most-cited numeric limit after weight/perimeter | LOW | Simple bounding-box Z-extent read from mass-properties/bounding-box API on the starting configuration. |
| Pass/fail results panel citing rule numbers | Users need to trust *why* something failed, not just that it failed; citing R101/R104-style numbers builds credibility with mentors who know the manual | LOW | Primarily a rendering/UX concern once checks emit structured results (rule id, status, actual value, limit value). |
| Versioned per-season rule-limit config | Limits change every year (perimeter/weight/height have all changed across recent seasons); hardcoding breaks the tool every January at Kickoff | LOW | Already decided in PROJECT.md; just needs an actual mechanism (e.g. `rules/2026.json`) checked into the app config. |
| Clear indication of "why this check is unavailable" when tags are missing | If a team hasn't tagged FRAME_/BUMPER_ parts, the tool must say so plainly rather than silently reporting 0 or a false pass | LOW-MEDIUM | Directly prevents the worst failure mode of a legality tool: false confidence. Should be considered part of the table-stakes bar, not a nice-to-have. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Continuous/live checking via webhooks | Removes the "remember to re-run the checker" friction; catches regressions the moment a part is edited, closest to true "shift-left" legality checking | MEDIUM | Onshape `onshape.model.lifecycle.changed` webhook; already scoped as a later phase in PROJECT.md — correctly sequenced after the manual-trigger MVP proves the checks are trustworthy. |
| FeatureScript custom feature (in-canvas instant feedback) | Zero-latency, no external server round-trip, feels native to Onshape rather than bolted-on; strong "wow" factor for CAD leads who live in Part Studios | MEDIUM-HIGH | Correctly sequenced as later/secondary per PROJECT.md; FeatureScript's own mass-properties access (`evApproximateMassProperties`) requires explicit density, so it's a natural complement to, not replacement for, the Extension's Parts-API-based checks. |
| Guided rename-assist tagging flow | Directly removes the main adoption barrier (a team has to retrofit FRAME_/BUMPER_ naming onto an existing, possibly large assembly by hand) | MEDIUM | Renaming parts via Onshape API is straightforward; the differentiator is the *guidance/heuristics* for suggesting which parts are probably frame vs mechanism (e.g., by shape signature: long extrusions near floor level) — this heuristic layer is where real product value/IP lives. |
| Extension-limit checks across all configurations (R105–R108) | Closes the largest remaining checkable-but-deferred gap; teams with telescoping/extending mechanisms genuinely worry about this at inspection | HIGH | Needs Configurations API enumeration + per-configuration bounding-box/perimeter re-evaluation; correctly deferred — this is meaningfully harder than the static v1 checks and shouldn't gate MVP validation. |
| Bumper coverage/gap analysis (R401/R405/R406) | Bumpers are a top-3 inspection failure category in practice (foam/backing errors, corner gaps) — catching this pre-inspection has high perceived value | HIGH | Needs curve/segment gap math along the perimeter hull plus zone-height fill checks; correctly deferred per PROJECT.md. |
| Historical trend / "weight over time" tracking | Mentors like seeing whether the robot is trending toward or away from the limit as build season progresses | MEDIUM | Requires persisting check results over time — directly conflicts with the "stateless v1, no datastore" decision in PROJECT.md; a legitimate v2+ differentiator once a lightweight datastore is justified. |
| Multi-document / whole-team dashboard (if a team CADs across several documents or sub-teams) | FRC teams sometimes split subsystems across documents; a rollup view is valuable at scale | MEDIUM-HIGH | Out of scope for v1 (single-document OAuth connection is the decided scope) but a natural v2 direction once single-document checks are validated. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Auto-inferring "frame" parts from geometry heuristics alone (no tagging) | Teams don't want to do manual tagging work; "just detect the frame automatically" sounds appealing | R101's frame-perimeter definition is a *rules concept* (fixed, non-articulated structural elements), not a geometric one — a heuristic (e.g. "biggest connected solid near the floor") will misclassify mechanisms, bumpers-in-progress, or intentionally excluded brackets, producing a plausible-looking but wrong number that a team could trust into a real inspection failure | Keep explicit NAME-PREFIX tagging (already decided) as the source of truth; offer the guided rename-assist *suggestion* tool as a differentiator, but never silently substitute inference for a team's explicit tag |
| Electrical/pneumatics/motor/software legality checks | "Since you're already checking legality, why not check everything on the checklist?" is a natural feature-creep request from users comparing the tool to the full Inspection Checklist | None of these properties have a CAD-geometric signature (see table above, rows 14–20); attempting them either requires data sources far outside Onshape (parts catalogs, wiring diagrams, firmware versions) or produces checks that *look* authoritative but are actually unverifiable guesses — worse than not checking at all, because it erodes trust in the checks that ARE reliable | Explicitly scope the tool to the CAD-geometric/mass-property rule family only, and say so in the product's framing ("checks the parts of inspection your CAD can actually answer") |
| Treating a passing CADChecker run as inspection-equivalent / a guarantee of passing physical inspection | Teams under deadline pressure will naturally want to treat a green dashboard as "we're done, ready for inspection" | CAD models diverge from physical robots (missing wiring mass, as-built deviations, bumper foam compression, manufacturing tolerance) — overselling certainty here is a trust-destroying failure mode if a team fails physical inspection despite a green CADChecker dashboard | Frame every result as "your CAD design, as modeled, appears compliant" — explicit language and disclaimers distinguishing CAD-model legality from physical-robot legality; treat it as a pre-inspection design aid, not a certification |
| Auto-correcting/auto-fixing violations (e.g., auto-shrinking frame geometry to fit) | "Just fix it for me" is an attractive pitch for a struggling team close to deadline | Silently modifying a team's CAD design is both dangerous (could break downstream assembly relationships/mates) and removes the educational value FRC is built around (students should understand *why* something is out of spec); also directly conflicts with the "tags renamed, never geometry/properties written" boundary already set in PROJECT.md for the tagging flow | Report violations with the specific offending part(s)/dimension and let the team fix their own design; at most, suggest *which* tagged part is the worst offender to guide fixing |
| Using Onshape custom properties for tagging or storing check metadata | Custom properties are Onshape's "native" structured-data mechanism and look like the "correct" engineering solution | Already investigated and rejected in PROJECT.md: custom properties require Company/Enterprise-admin setup that many self-funded/school FRC teams don't have access to, making the tool unusable for a meaningful chunk of the target audience | Name-prefix convention via the Parts API (already decided) — works for every team regardless of admin tier |
| Real-time collaborative multi-user check-result comments/annotations in the panel | Feels like a natural "why not add basic PM features" extension once you have a panel UI | Scope creep away from the core value (surfacing violations); duplicates functionality Onshape's own commenting/PM features already provide natively on the document | Keep the panel focused on check results; if teams want discussion, they can use Onshape's built-in comments on the flagged parts |

## Feature Dependencies

```
OAuth connection to Onshape document
    └──requires──> (nothing; foundational)

Material-default audit
    └──enhances──> Weight check (robot, R103)
    └──enhances──> Weight check (robot+bumpers, R408)
    (a part with unset material silently contributes ZERO mass in Onshape —
     material audit must run before/alongside weight checks or the weight
     number is untrustworthy)

Name-prefix tagging convention (FRAME_/BUMPER_/MECH_)
    └──requires──> Parts API read access
    └──enables───> Frame perimeter check (R101/R104)
                       └──enables──> Bumper extension-from-perimeter check (R403)
                       └──enables──> Bumper coverage/gap check (R401/R406) [later phase]
    └──enables───> Robot-vs-bumper weight split (R103 vs R408)

Frame perimeter check (convex hull)
    └──requires──> Name-prefix tagging (FRAME_)
    └──requires──> Floor-level projection logic (which plane = "floor")
    └──enhances──> Starting-configuration overhang check (R102) [partial/later]

Starting-configuration height check
    └──requires──> Correct identification of "starting configuration" state
                    (default config vs a named config representing startup)

Guided rename-assist tagging flow [later phase]
    └──enhances──> Name-prefix tagging convention
    (lowers adoption friction; does not replace explicit tagging as source of truth)

Webhooks / auto-refresh [later phase]
    └──enhances──> all checks (removes manual "check now" friction)
    └──requires──> checks already being correct/trustworthy (validated in v1 first)

Extension-limit checks across configurations (R105-R108) [later phase]
    └──requires──> Onshape Configurations API enumeration
    └──requires──> Frame perimeter check logic (reused per-configuration)

Bumper coverage/gap analysis (R401/R405/R406) [later phase]
    └──requires──> Name-prefix tagging (BUMPER_)
    └──requires──> Frame perimeter check logic (hull to measure gaps against)

FeatureScript custom feature [later phase]
    └──conflicts (partially)──> Extension's mass-properties approach
    (FeatureScript's evApproximateMassProperties requires explicit density input,
     unlike the Parts API/mass-properties endpoint the Extension uses — the two
     surfaces need separate, non-shared logic for the "same" weight check)
```

### Dependency Notes

- **Material-default audit enhances (really: gates) the weight checks:** This is the most important dependency in the whole feature set. Onshape's mass-properties calculation treats "no material assigned" as zero mass, not an estimate — so a weight check run before/without a material audit can report a robot as under the limit when in reality several parts are silently missing from the total. PROJECT.md already places both in v1 Phase 1, which this research confirms is the correct sequencing (they should ship together, not staged).
- **Name-prefix tagging is a hard prerequisite for the frame perimeter and bumper checks:** R101's "frame perimeter" is a Game-Manual concept (fixed structural elements) with no geometric signature the tool can infer on its own. Every check that touches "frame" or "bumper" geometry depends on tagging being present and correct; when tags are absent, the correct behavior is to report "check unavailable — tag your frame parts," never a false pass/fail.
- **Extension-limit checks (R105-108) and bumper coverage checks (R401/405/406) both reuse the frame-perimeter hull logic**, so they are naturally sequenced after the static v1 perimeter check is built and validated, not built in parallel — this matches PROJECT.md's phase ordering.
- **Guided rename-assist enhances but does not replace tagging:** it's an adoption-friction reducer, not a new capability. It should never write geometry or auto-classify without team confirmation (see anti-features table).
- **FeatureScript and the Extension are parallel surfaces with a shared goal but different implementation paths** for mass properties specifically (FeatureScript needs explicit density; the Extension's REST-API-based mass-properties call does not). This means "port the checks to FeatureScript" later is not a trivial copy-paste — it's a partial reimplementation, worth flagging for planning.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept. (This matches PROJECT.md's Phase 1 scope; research confirms no additions or removals needed.)

- [ ] OAuth2 connection to a single Onshape document — foundational, nothing works without it
- [ ] Manual "check now" trigger — validates the checks themselves before adding auto-refresh complexity
- [ ] Material-default audit — must ship alongside weight checks; it's the precondition that makes weight numbers trustworthy
- [ ] Total assembly weight check (R103) — the single most-wanted number by every FRC team
- [ ] Frame perimeter check (R101/R104) — the second most-cited rule and the tool's clearest differentiator vs "just look at mass properties yourself"
- [ ] Starting-configuration height check (R104/R107 static case) — cheap to compute, rounds out the "big three" numeric limits
- [ ] Results panel with pass/fail + cited rule number per check — this is *how* users trust the tool; a bare number without rule citation feels like a toy

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Robot+bumpers weight check (R408) — natural extension of the weight check once BUMPER_ tagging is proven reliable from the frame-perimeter work
- [ ] Webhooks / auto-refresh — add once the checks themselves are validated as correct; don't automate re-running checks whose accuracy hasn't been confirmed by real teams
- [ ] Guided rename-assist tagging flow — add once real teams hit the "retrofitting tags onto an existing assembly" friction point; premature to build before observing that pain
- [ ] Bumper extension-from-perimeter check (R403) — cheap incremental addition once the perimeter hull exists

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Extension-limit checks across configurations (R105-R108) — meaningfully harder (Configurations API enumeration); defer until the static-checks value proposition is validated with real teams
- [ ] Bumper coverage/gap analysis (R401/R405/R406) — high complexity (segment/gap curve math), high value, but not needed to prove the core concept
- [ ] FeatureScript custom feature — a UX/latency enhancement on top of already-validated checks, not a new capability; defer until the Extension's checks are trusted
- [ ] Historical trend tracking — requires a datastore, which v1 deliberately avoids; revisit once statelessness becomes a real limitation
- [ ] Multi-document/whole-team dashboard — only relevant once single-document usage is validated across multiple teams
- [ ] Onshape App Store listing — a distribution/packaging step, not a feature; do last

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| OAuth connection | HIGH | LOW | P1 |
| Weight check (R103) | HIGH | LOW | P1 |
| Material-default audit | HIGH | LOW | P1 |
| Frame perimeter check (R101/R104) | HIGH | MEDIUM | P1 |
| Starting-configuration height check | HIGH | LOW | P1 |
| Rule-cited results panel | HIGH | LOW | P1 |
| Robot+bumpers weight (R408) | MEDIUM | LOW | P2 |
| Webhooks/auto-refresh | MEDIUM | MEDIUM | P2 |
| Guided rename-assist tagging | MEDIUM | MEDIUM | P2 |
| Bumper extension check (R403) | MEDIUM | LOW | P2 |
| Extension-limit checks (R105-R108) | MEDIUM | HIGH | P3 |
| Bumper coverage/gap analysis (R401/405/406) | HIGH | HIGH | P3 |
| FeatureScript custom feature | LOW-MEDIUM | HIGH | P3 |
| Historical trend tracking | LOW-MEDIUM | MEDIUM (needs datastore) | P3 |
| Multi-document dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor / Prior-Art Feature Analysis

No dedicated CAD-based FRC legality checker exists as a shipped product (confirmed via web search of the FRC CAD-tooling ecosystem — Onshape4FRC, FRCDesign.org, and community FeatureScript libraries provide general CAD productivity tooling, not rule-compliance checking). The closest points of comparison are:

| Feature | Official FRC Inspection Checklist (PDF, manual/physical) | Community FeatureScripts (e.g. mass/property helpers) | Our Approach |
|---------|-----------|-----------|--------------|
| Rule coverage | Comprehensive (all R-rule families) | None — general CAD utilities, not compliance-aware | Deliberately narrow: only the CAD-geometric/mass-property subset (weight, material, perimeter, height), explicitly not a full-checklist replacement |
| Timing | Once, in-person, near/at competition | N/A (used ad hoc during design) | Continuous, during design, long before competition |
| Rule citation | Yes (it *is* the rule text) | No | Yes — every check cites its rule number, matching the checklist's own framing so mentors trust it |
| Data source | Physical robot | Whatever the FeatureScript author scoped (usually raw geometry) | Onshape Parts API + mass-properties API + name-prefix tags, explicitly not custom properties |
| Trustworthiness signal | Human inspector judgment | None (utility scripts, not compliance judgments) | Explicit "check unavailable" states when tags/materials are missing, rather than false confidence |

## Sources

- [2026 FRC Game Manual (PDF)](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf) — primary/authoritative source; binary PDF parsing failed via WebFetch in this session, rule numbers below were cross-verified via community mirror, not directly extracted from this PDF. Recommend a direct text-extraction pass at implementation time to pin exact 2026 rule IDs.
- [FRCManual.com — 2026 Robot Construction Rules (R)](https://www.frcmanual.com/2026/robot-construction-rules-(r)) — community-maintained, human-readable mirror of the Game Manual, used for rule taxonomy/numbering (MEDIUM confidence — cross-referenced against WebSearch summaries and training-data knowledge of FRC rule structure, both agree)
- [FRCTools.com — Rule R405, R401, R402, R412 pages](https://frctools.com/2026/rule/R405) — secondary community rule-lookup source, used to verify bumper rule text (R401, R405, R406)
- [2026 FRC Inspection Checklist (PDF)](https://firstfrc.blob.core.windows.net/frc2026/Manual/2026FRCInspectionChecklist.pdf) — the literal physical-inspection document; confirms checklist category structure (dimensions/weight, bumpers, electrical, pneumatics, software, safety)
- [The Annotated Inspection Checklist (2025), BoVLB's FRC Tips](https://bovlb.github.io/frc-tips/inspection/2025.html) — community annotation of the inspection process, corroborates checklist category structure
- [FIRST Robotics Competition Bumper Guide (PDF)](https://www.firstinspires.org/hubfs/web/program/frc/resources/bumper-guide.pdf?hsLang=en) — official supplementary bumper-construction guidance
- [Onshape Help — Mass Properties Tool](https://cad.onshape.com/help/Content/View/mass_properties_tool.htm) — HIGH confidence, official docs; confirms parts with no material assigned contribute no mass to the calculation (critical finding for material-default audit's priority/value)
- [Onshape Help — Customizing Part Materials](https://cad.onshape.com/help/Content/material_library.htm) — official docs on material assignment/override mechanics
- [Onshape Forum — "Overriding calculated mass"](https://forum.onshape.com/discussion/6998/overriding-calculated-mass) and [API/PartStudio/Mass Properties discussion](https://forum.onshape.com/discussion/23808/api-partstudio-mass-properties) — MEDIUM confidence, community-verified API behavior notes
- [Onshape4FRC](https://onshape4frc.com/) and [FRCDesign.org](https://frcdesign.org/) — surveyed to confirm no existing legality-checking tool exists in the current FRC CAD tooling ecosystem
- [Onshape Standard Library FeatureScript Documentation](https://cad.onshape.com/FsDoc/library.html) — referenced for FeatureScript `evApproximateMassProperties` density-input requirement, relevant to the later-phase FeatureScript custom feature

---
*Feature research for: FRC robot legality checking, CAD-integrated (Onshape)*
*Researched: 2026-06-30*

# Pitfalls Research

**Domain:** Onshape-integrated FRC robot legality checker (OAuth Extension + REST API + FRC Game Manual rules)
**Researched:** 2026-06-30
**Confidence:** HIGH (Onshape API mechanics — verified via Context7/official docs and Onshape forum); HIGH (FRC rule text — verified via frcmanual.com and official 2026 Game Manual sources); MEDIUM (some Onshape API response-shape details, e.g. Assembly mass-properties JSON fields, only verified via community forum posts, not raw OpenAPI spec inspection)

## Critical Pitfalls

These pitfalls can make the tool produce a **confidently wrong pass/fail verdict** — worse than having no tool at all, because teams will trust it and get inspected-out at competition.

### Pitfall 1: Silent mass omission from unset/default materials

**What goes wrong:**
Onshape's mass-properties calculation omits parts with no material assigned from the mass total entirely — it does not treat them as zero mass with a warning, it silently drops them from the sum. If *no* parts in a studio/assembly have a material, Onshape may return no mass calculation at all, or a near-zero/undefined value. A robot with several unmaterialed structural parts will show a total weight that is understated by exactly the mass of those parts — the check will read "PASS: 98 lbs / 115 lbs" when the real robot (with all parts materialed) would be over the limit.

**Why it happens:**
Developers assume "no material = default density (e.g., generic steel)" the way some other CAD tools behave. In Onshape, no-material parts are excluded from the mass sum, not defaulted. Onshape does have a generic/default material for *display* in some contexts, but for mass-properties purposes an unassigned material contributes nothing.

**How to avoid:**
- The material-default audit (already in v1 scope) must run *before* — and gate — the weight check, not run in parallel as an independent, ignorable check.
- Treat "any FRAME_/MECH_/BUMPER_-tagged part with no material, OR a material Onshape flags as its library default placeholder" as a hard blocker on the weight verdict: render weight as "UNKNOWN — N parts missing material" rather than a false PASS/FAIL number.
- Explicitly fetch each part's material assignment via the Parts API (not just trust the aggregate mass-properties total) so you can enumerate *which* parts are the problem, not just detect that the total looks suspicious.
- Never show a weight PASS if the material audit found any violations in the same run — chain the checks.

**Warning signs:**
- Total assembly mass is suspiciously low relative to visible part volume/geometry.
- Mass-properties response for a part studio returns null/omitted for a body that has geometry.
- Teams recently imported parts (McMaster-Carr, purchased COTS) which often import with no material or a placeholder.

**Phase to address:** Phase 1 (v1) — this is explicitly called out in PROJECT.md as the #1 cause of CAD/real weight divergence; the material audit must be wired as a precondition for the weight check's verdict, not a sibling check.

---

### Pitfall 2: Assembly mass-properties API doesn't reflect the answer you think it does — and per-part looping is required to attribute mass to tags

**What goes wrong:**
The assembly-level mass-properties endpoint (`/api/assemblies/d/{did}/{wvm}/{wvmid}/e/{eid}/massproperties`) returns one aggregate mass/CG/inertia for the *entire* assembly (or a specified sub-selection of occurrences) — it does not break mass down per named/tagged part. If the tool naively calls this once and trusts the total, it cannot (a) detect which specific parts are missing materials, (b) exclude BUMPER_-tagged parts from the "robot weight excluding bumpers" figure, or (c) exclude the battery. Getting a single number back and treating it as "robot weight per R103" will silently include bumpers/battery mass that must legally be excluded, or fail to exclude a non-frame decorative subassembly.

**Why it happens:**
The endpoint name and top-level UI ("Mass Properties" panel) imply "the" mass of the assembly, so it's tempting to call it once with no `partIds`/occurrence filter and treat the returned `mass` field as the R103 weight. In practice you must call it with an explicit list of occurrence IDs (all parts *except* those tagged BUMPER_, plus explicitly excluding any modeled battery/no-mass-placeholder part) to get the legally-relevant figure, which typically means enumerating parts via the Assembly definition (occurrences/instances) first, filtering by name-prefix tag, then requesting mass properties scoped to that occurrence subset — or summing per-part mass-properties calls.

**How to avoid:**
- Never call assembly mass-properties without an explicit occurrence/part filter for a "weight excluding bumpers" or "weight including bumpers" check — these are two different filtered queries, not one.
- Build the part enumeration (via `getAssemblyDefinition`, walking `rootAssembly.instances` and `subAssemblies`, applying `matedOccurrence`/`occurrences` transforms) as a first-class shared step that both the weight check and the frame-perimeter check depend on, rather than letting each check independently and inconsistently traverse assembly structure.
- Explicitly design the two weight numbers required by rules R103 (excluding bumpers/battery, ≤115 lb) and R408 (including bumpers, ≤135 lb) as two separate, clearly filtered API calls/verdicts, each citing its own rule number.

**Warning signs:**
- Weight check "just works" in a smoke test with a simple single-part-studio robot but produces wrong numbers on a real team's multi-subassembly robot.
- No code path exists that lists parts *excluded* from a given mass query — if you can't print "excluded: BUMPER_left, BUMPER_right, battery_18ah" you don't actually know your filter is right.

**Phase to address:** Phase 1 (v1) — the "total assembly weight check" and later the bumper-inclusive check both depend on getting occurrence enumeration + filtered mass-properties right from the start; get the shared traversal utility correct before layering more checks on it.

---

### Pitfall 3: Frame perimeter computed as bounding-box or raw convex hull of ALL vertices, not the floor-level projection with the minor-protrusion exception

**What goes wrong:**
R101 (2026: "ROBOT PERIMETER," formerly "FRAME PERIMETER" through 2024) defines the perimeter as the taut-string wrap around the robot's structural elements **projected onto the floor**, while in **starting configuration**, **excluding bumpers**, and **excluding minor protrusions ≤ ¼ in (bolt heads, fastener ends, weld beads, rivets, cable ties)**. A naive implementation that (a) takes the 3D convex hull of all vertices of FRAME_-tagged parts instead of projecting to 2D first, (b) doesn't exclude protrusions ≤ ¼ in, or (c) includes bumper geometry because tagging was inconsistent, will compute a perimeter number that doesn't match the rule — sometimes larger (an outrigger arm sticking out will inflate the 2D hull but might be a "minor protrusion" or might not, and if it's genuinely structural but not floor-level it should still be excluded), sometimes smaller (if the projection step is skipped and a tall vertical member's top corner is used instead of its floor footprint).

**Why it happens:**
"Convex hull of the frame parts" sounds like a straightforward 3D geometry problem, but the rule is specifically about the *floor-level (Z=0, or whatever the team defines as ground in starting configuration) 2D projection*. Teams' CAD is not always modeled with a consistent floor plane at Z=0 — some model the robot with the origin at a wheel centerline, a bumper-bottom reference, or an arbitrary part-studio origin. Getting "floor level" wrong (e.g., using the assembly's Z=0 without confirming that's actually where the robot's wheels/frame rails touch the field) silently changes which points get included in the projection.

**How to avoid:**
- Explicitly require (and validate) that the assembly's Z=0 (or a configurable ground-plane reference) corresponds to the robot's actual floor contact plane in starting configuration — don't assume the CAD origin is the floor. Consider requiring a `FRAME_` naming convention *plus* a documented assumption (visible in the UI) about which axis/plane is "floor," and flag when tagged frame parts have geometry entirely above a suspiciously high Z threshold (signals wrong floor assumption).
- Take the 2D projection (drop the Z coordinate) of the vertices/silhouette of FRAME_-tagged part geometry first, *then* compute the 2D convex hull — not the 3D hull projected afterward. These are not equivalent when parts have geometry at varying heights that would expand a 3D hull's footprint incorrectly.
- Implement the ≤¼ in minor-protrusion exception as an explicit filter (e.g., ignore hull vertices contributed by features smaller than a threshold, or provide a documented limitation that the tool doesn't yet filter minor protrusions and may over-report by a small margin) — do not silently ignore this rule text and claim exact compliance.
- Never include BUMPER_-tagged geometry in the perimeter point set — even though bumpers sit outside the frame perimeter by rule, geometry overlap/mis-tagging is a realistic failure mode.
- Surface the actual computed hull polygon (not just the number) in the results panel so a team can visually sanity-check it against their CAD — this turns silent wrongness into detectable wrongness.

**Warning signs:**
- Frame perimeter check passes/fails by a very small margin (a few tenths of an inch) — small margins are exactly where floor-plane and protrusion-exception errors matter.
- Test robots with wheels/standoffs/casters modeled below the main frame rail — if included in the projection, they can add spurious extent.
- No visual/debug rendering of the computed hull exists to compare against the CAD by eye.

**Phase to address:** Phase 1 (v1) — this is a core v1 check per PROJECT.md; the floor-plane assumption and 2D-projection-before-hull ordering must be nailed down in the initial implementation, since it's the hardest-to-detect wrongness (a plausible-looking number that's subtly incorrect).

---

### Pitfall 4: "Starting configuration" is not "current CAD state" — configuration-dependent geometry silently uses the wrong configuration

**What goes wrong:**
FRC rules (R104, and the general starting-configuration rule) define limits based on the robot's **starting configuration** — i.e., a specific state, typically stowed/retracted, which for many robots is *not* whatever configuration happens to be active in the Onshape document/tab the extension reads when the user clicks "check now." If the robot has an extending elevator, a deployable intake, or a configuration table with named states (e.g., "Stowed," "Extended," "Match Start"), and the tool blindly reads whatever configuration is currently selected in the Onshape workspace, it may compute height/perimeter against an *extended* state and report a false FAIL (robot looks too tall) — or worse, read an *extended* state that happens to still pass and report a false PASS when the actual starting configuration (which the team forgot to switch back to before checking) is fine, masking that the extended state would violate extension-limit rules (later phase) or that the team's "current" tab state isn't actually representative of match start.

**Why it happens:**
Onshape configurations are a per-element feature; there's no platform-level flag that says "this configuration value represents FRC starting configuration." The tool has no way to know this without an explicit convention (analogous to the FRAME_ naming convention for parts). It's easy to build v1 against a single-configuration test robot where this ambiguity never surfaces, then discover on a real team's CAD (which almost always has a configuration table for extend/retract states) that "starting height" was measured against whatever config tab happened to be open.

**How to avoid:**
- Explicitly document (in the UI and in PITFALLS-informed roadmap) that v1 measures whatever configuration is currently active in the workspace/element the panel is attached to, and require the user to confirm/select "this is starting configuration" before trusting a height/perimeter verdict — don't silently assume.
- If a configuration table exists with a name matching a convention (e.g., a config value literally named "Starting" or "Stowed"), prefer that named state and flag when no such state is found and the tool is falling back to "whatever is currently active."
- Never label a height/perimeter check as a clean PASS without indicating *which configuration* was measured, so a team reviewing results can catch a wrong-configuration read.

**Warning signs:**
- Robot has any moving mechanism (elevator, arm, intake) — nearly all competitive FRC robots do.
- Height/perimeter numbers change between two "check now" clicks with no CAD edits, because a teammate switched configuration tabs in another browser tab of the same document.

**Phase to address:** Phase 1 (v1) for the disclosure/labeling of which configuration was measured; full configuration-table-aware "starting configuration" detection can be flagged as a later-phase enhancement (related to the already-deferred "extension-limit checks across configurations").

---

### Pitfall 5: Rule numbers, rule text, and even terminology drift year to year — hardcoding "R101 = frame perimeter" breaks silently

**What goes wrong:**
The exact rule identifiers this project is built around are **not stable across seasons**. Verified in this research: the FRC rule governing perimeter was called **R101** in 2024 under the name "FRAME PERIMETER," but by the 2026 season the FIRST community/rules ecosystem confirms the term was explicitly corrected to **"ROBOT PERIMETER"** (still numbered R101 in 2026 per frcmanual.com, but the *name* changed, and rule numbering has shifted in the past between seasons as sections are added/removed). The 2026 rule set researched here uses R101 (perimeter definition), R103 (weight ≤115 lb, excluding bumpers/battery), R104 (starting configuration size ≤110 in perimeter / ≤30 in tall), R405 (bumper zone 2.5–5.75 in from floor), and R408 (robot+bumpers ≤135 lb) — a *different* numbering scheme than the FRAME PERIMETER-era rules R101–R104ish used in 2022–2024 docs found during research, and PROJECT.md itself still uses the term "frame perimeter" and a `FRAME_` naming convention that no longer matches the 2026 official term "ROBOT PERIMETER." If the tool hardcodes "R101" as a string tied to a specific rule *text*, and FIRST renumbers or renames the rule next season (which has happened before), the tool will confidently cite the wrong rule number/name for the check it's actually running — a subtle but real trust-destroying bug, since teams cross-reference the cited rule against the Game Manual during scouting/mentoring review.

**Why it happens:**
Developers treat "R101 = frame perimeter" as a fact learned once and hardcode it as a constant/string, rather than treating rule number *and* rule text *and* rule name as versioned data tied to a specific season. FRC's Game Manual is revised every season (sometimes rule numbers shift when sections are reorganized), and mid-season Team Updates can further amend or clarify rule text without renumbering.

**How to avoid:**
- Rule config (already planned as versioned config per PROJECT.md) must store, per season: rule ID, rule display name/title, full rule text or summary, and the limit value — all together, not just the numeric limit against a hardcoded ID/label elsewhere in code.
- Never hardcode a rule number or rule name (e.g., "Frame Perimeter") in check-logic or UI strings; always pull both the number and the current display name from the versioned config for the active season.
- Update the internal terminology (`FRAME_` prefix docs/UI copy) to acknowledge that the FRC rule name is "ROBOT PERIMETER" as of 2026 even if the internal tag prefix name (`FRAME_`) stays for backward compatibility/brevity — surface the *current official term* in the results panel and any citation, not a term that was correct in an earlier season.
- Build a lightweight process (even manual, pre-kickoff each January) to re-verify rule numbers/text against the new Game Manual before each season's config is published, since Kickoff (per official FIRST cadence) is when the new manual drops and rules can shift.
- Treat "Team Update" amendments mid-season as a real risk: a rule's *number* may stay the same but its *text/limit* can be revised by Team Update after Kickoff — versioned config needs a revision/update mechanism within a season, not just year-to-year.

**Warning signs:**
- Any string literal like `"R101"` or `"Frame Perimeter"` appearing directly in check logic, UI copy, or test fixtures rather than sourced from the season config file.
- No process/reminder exists for reviewing the new Game Manual at each season's Kickoff before shipping that season's config.

**Phase to address:** Phase 1 (v1) for the config architecture (rule ID + name + text + limit all versioned together, never hardcoded separately); ongoing operational process for every subsequent season, not a one-time fix.

---

### Pitfall 6: OAuth access-token expiry (60 min) during a long CAD-review session causes silent failed API calls or forces re-auth mid-check

**What goes wrong:**
Onshape's OAuth bearer/access token expires 60 minutes after issuance (confirmed via Onshape forum/docs); the authorization "nonce" used during the initial code exchange expires in ~3 minutes. If the extension panel is left open during a normal CAD working session (which for FRC teams can easily run 1-3+ hours), the access token will expire mid-session. If the app doesn't proactively use the refresh token to mint a new access token before/at expiry, the next "check now" click (or a webhook-triggered refresh in a later phase) will fail with a 401, and if that failure isn't handled distinctly from "the robot has no frame parts" or similar domain-logic failures, the UI could show a stale, misleading "last known" pass/fail as if it were current, or an unhelpful generic error.

**Why it happens:**
It's easy to implement the OAuth code-exchange flow correctly (get access + refresh token once) and stop there, since a quick manual test (click "check now" once) never exceeds 60 minutes. The refresh-token flow is a separate code path that's easy to skip until a user reports "it stopped working after a while."

**How to avoid:**
- Implement refresh-token exchange from day one of the OAuth integration (Phase 1), not as a later hardening pass — track token issuance time and refresh proactively (e.g., refresh at 45–50 min) or reactively on first 401.
- Distinguish, in the UI, between "results are stale because your session needs re-authentication" (actionable, one click to fix) versus "results are stale because a check failed" (a real domain problem) — never silently show old pass/fail data labeled as current.
- Store the refresh token server-side/session-side with the same care as a password-equivalent secret (per Onshape's own security note that refresh-token leakage is the more severe risk versus access-token leakage) — this matters even in an explicitly "stateless" v1, since "stateless" (no long-term datastore) still requires secure in-session handling.

**Warning signs:**
- No code path calls the token endpoint with `grant_type=refresh_token`.
- Manual QA only ever tests short sessions (<60 min) and never leaves the panel open across a lunch break or multi-hour design session — which is exactly how a student CAD lead will actually use it.

**Phase to address:** Phase 1 (v1) — this is core OAuth plumbing, must be correct before any other check logic is trustworthy, since an expired-token failure that's mishandled can *look like* a stale-but-valid result.

---

### Pitfall 7: Extension panel reads a stale documentId/workspaceId/elementId after in-Onshape navigation, silently checking the wrong document/tab

**What goes wrong:**
Onshape passes `documentId`, `workspaceId`, and `elementId` to the extension's iframe as query parameters at load time (and via an Action URL mechanism when the user's selection/context changes, which reloads the iframe with new parameters). If the tool caches these IDs in memory/component state at first load and a user then switches Part Studio/Assembly tabs, switches to a different workspace/version, or navigates to a different element within the same document, without correctly re-reading the new query parameters (or without the iframe actually reloading, if the extension's JS framework intercepts navigation), the "check now" action can silently run against the *previous* document/element context — producing a pass/fail verdict for a robot design the user is no longer even looking at, with no indication anything is wrong.

**Why it happens:**
Onshape's own docs note that when the extension uses a JS framework, it's possible to parse query params and maintain state "in other ways" instead of relying on a full iframe reload — this flexibility is exactly what creates the footgun: it's easy to grab documentId/workspaceId/elementId once on mount and never re-derive them from the current URL/context on each "check now" click.

**How to avoid:**
- Re-read `documentId`/`workspaceId`/`elementId` from the current iframe URL (or Onshape's client-messaging API) at the moment "check now" is clicked, not from component state cached at initial mount.
- Display the document/tab name (fetched fresh) prominently in the results panel so a user can visually confirm "yes, this is the robot I'm looking at" — a redundant but cheap sanity check against stale-context bugs.
- Do not implement custom SPA-style routing that avoids iframe reloads unless the context-refresh logic is explicitly tested against tab-switching, workspace-switching, and version/microversion-switching scenarios.

**Warning signs:**
- Clicking between two Part Studio tabs in the same document, then clicking "check now," ever shows stale results tied to the previous tab.
- No test exists for "user switches tabs mid-session then re-runs the check."

**Phase to address:** Phase 1 (v1) — the "manual check now trigger" is explicitly v1 scope per PROJECT.md; getting document/workspace/element context right at trigger time (not just at initial load) is foundational to every other check being trustworthy.

---

### Pitfall 8: Treating "part has a material assigned" as sufficient, without checking it's not a nonsensical/placeholder density

**What goes wrong:**
The material audit (Pitfall 1) catches parts with *no* material. It's a smaller but related trap to assume any *assigned* material is a correct one — a part imported from a vendor STEP file, or copy-pasted from another team's public document during early prototyping, may carry an assigned material with an unrealistic density (e.g., a plastic gearbox housing accidentally assigned "Steel, Mild" density from a copy/paste, or a COTS part imported with a placeholder density of 1 g/cm³ or similar generic import default). This won't be caught by an "unset material" check, so the tool reports a clean material audit and a computed weight, but the underlying number can still be significantly wrong.

**Why it happens:**
It's tempting to treat "material audit" as binary (set vs. unset) since that maps directly to what the Onshape API can tell you cheaply. Detecting "wrong but present" material requires either heuristics (density outside plausible range for the part's apparent bounding-box-derived volume vs. mass) or human judgment, which is much harder to automate reliably.

**How to avoid:**
- Scope v1's material audit explicitly and honestly to "unset/default material" detection only, and say so in the UI copy ("this checks for missing materials, not incorrect ones") — do not imply a broader guarantee than what's actually checked.
- Consider a lightweight sanity heuristic later (flag parts whose density falls far outside a typical range for FRC materials — aluminum ~2.7 g/cm³, steel ~7.8-8.0 g/cm³, common polymers 0.9-1.4 g/cm³) as a differentiator/later-phase feature, clearly distinct from the core audit.

**Warning signs:**
- A team's total weight passes the check but "feels" wrong compared to bathroom-scale reality on similar past robots (available from public post-mortems only, no ground truth in v1 per project scope) — hard to detect without real-world validation, which is explicitly out of scope. This is itself a residual-risk flag to document, not fully solvable in v1.

**Phase to address:** Phase 1 (v1) — scope the audit's guarantee explicitly and document the limitation; do not silently overclaim. A density-sanity heuristic can be flagged as a later-phase differentiator.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|------------------|
| Hardcode 2026 rule numbers/limits directly in check functions instead of building the versioned-config loader in Phase 1 | Faster to ship v1 checks | Every season requires a code change + redeploy instead of a config update; risk of missing a season's update entirely | Never — versioned config is already a stated v1 requirement in PROJECT.md; skipping it undermines the whole premise |
| Call assembly mass-properties once unfiltered and treat it as "the weight" | Simple, one API call | Silently wrong for the bumpers-excluded (R103) vs bumpers-included (R408) distinction; wrong the moment a robot has tagged bumpers | Only acceptable for a throwaway prototype/demo, never for a check whose verdict a team will trust |
| Cache documentId/workspaceId/elementId once at panel mount | Simpler state management | Stale-context bug (Pitfall 7) when user navigates within Onshape without a full panel reload | Only if you've explicitly verified (and kept verifying via tests) that Onshape always fully reloads the iframe on every context change relevant to this app — risky to rely on |
| Skip refresh-token flow, just re-prompt full OAuth login on any 401 | Less code in Phase 1 | Disruptive UX (full re-consent) every ~60 min during a working session; likely to be perceived as "the tool is broken" | Acceptable only as an explicit, intentional v1 stopgap if clearly communicated in-UI ("session expired, please reconnect") — not acceptable as a silent failure |
| Treat "no material assigned" and "material assigned but Onshape's calc omitted it anyway" as the same code path without distinguishing root cause | Simpler audit logic | Harder to debug when a team insists "I set the material" and the tool still flags/omits it (e.g., material set on a sub-part vs. parent, or set in a different configuration) | Acceptable for v1 if the UI error message says "could not compute mass for this part" generically, but should be revisited once real user reports surface configuration-specific material issues |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| Onshape OAuth | Storing only the access token, letting the session silently die at 60 min | Store and use the refresh token; proactively refresh before/at expiry; distinguish auth-expired errors from domain errors in the UI |
| Onshape mass-properties (Part Studio) | Assuming a null/omitted mass field means "zero mass" | Treat omitted/null mass as "unknown — likely missing material," not zero, and surface it as a material-audit finding |
| Onshape mass-properties (Assembly) | Calling the unfiltered assembly endpoint and trusting the aggregate as "the" robot weight | Enumerate occurrences via assembly definition, filter by tag (exclude BUMPER_/battery for R103, include for R408), call mass-properties scoped to that occurrence set |
| Onshape Parts API / Assembly structure | Assuming a flat parts list; not recursively walking `subAssemblies` and applying occurrence transforms | Recursively traverse `rootAssembly.instances`/`subAssemblies`/`occurrences`, applying transform matrices, to get true world-space geometry for perimeter projection and correct part attribution |
| Onshape rate limits | No handling for HTTP 429; assumes every API call succeeds | Read `X-Rate-Limit-Remaining` and `Retry-After` headers; implement backoff/retry; batch/minimize calls per "check now" run since a full check likely fires several API calls (assembly definition, mass-properties x2+, per-part material lookups) |
| Onshape extension context | Reading documentId/workspaceId/elementId once at mount | Re-derive from current URL/query params (or Onshape client-messaging) at the moment of each user-triggered check |
| Onshape webhooks (later phase) | Assuming `onshape.model.lifecycle.changed` fires reliably for every edit, and returning non-200 status codes from the receiving endpoint | Always return HTTP 200 promptly (Onshape deregisters webhooks on bad response codes); treat webhook-triggered refresh as best-effort, not a guarantee — the manual "check now" affordance should remain even after webhooks ship, as a fallback |
| Onshape units | Assuming API responses are always in a fixed unit (e.g., always meters/kg) | Mass-properties and geometry values follow the *document's* configured units; explicitly read/normalize units rather than assuming a global constant, and be aware some raw API fields are in Onshape's internal base units (meters/kg) regardless of document display units — verify per-endpoint, don't assume consistency across endpoints |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Re-fetching full assembly definition + all part mass-properties on every "check now" click with no caching within a session | Slow check runs, hitting rate limits during rapid iterative clicking | Cache assembly structure/tag mapping per element+microversion; invalidate on version change (or via webhook later); reuse within a session | Noticeable once a robot assembly has 50-100+ parts (typical for a competitive FRC robot with COTS + custom parts) |
| Per-part mass-properties calls in a loop instead of a single filtered/batched call where the API supports it | N+1 API call pattern, slow and rate-limit-risky | Prefer assembly-level mass-properties scoped to an occurrence-ID list over per-part looping wherever the endpoint supports batch/occurrence filtering | Breaks down (slow, rate-limited) once part count grows past a few dozen tagged parts |
| Recomputing the full 2D convex hull from every vertex of every FRAME_-tagged part's full-resolution mesh/tessellation | Slow perimeter check on complex machined parts with many vertices | Use a coarser silhouette/bounding representation per part (e.g., part bounding box footprint or a simplified outline) before hull computation, or use Onshape's own geometry query endpoints if they can return a simplified outline | Breaks down on robots with many highly-tessellated custom machined frame rails |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Logging or persisting the OAuth refresh token in plaintext logs/error reports | Refresh-token leak grants long-lived account access — Onshape's own docs flag this as the more severe leak versus access-token leak | Never log tokens; scrub them from error-tracking payloads; treat as a secret even in a "stateless" v1 with only in-session storage |
| Trusting client-supplied documentId/workspaceId/elementId without server-side authorization checks | A modified request could attempt to read a document the authenticated user doesn't actually have access to | Rely on Onshape's own API-level authorization (calls will 403/404 if the token's user lacks access) but don't assume client-supplied IDs are inherently trustworthy context — always make the actual data-fetching calls through Onshape's authenticated API, never bypass with cached/assumed data |
| Using the OAuth `state` parameter loosely (or skipping it) during the sign-in redirect flow | CSRF-style attack on the OAuth redirect flow | Follow Onshape's documented pattern of generating and validating a `state` value (as shown in Onshape's own OAuth sample) tied to the session |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Showing a bare PASS/FAIL with no indication of which configuration, which document version, or when the check ran | Team can't tell if a "PASS" is stale or was run against the wrong tab/config | Always show: document/tab name, configuration name (or "default/unspecified"), and timestamp of the check alongside every verdict |
| Citing a rule number with no link/quote of the rule text | Team has to go hunt down the Game Manual to verify what the rule actually says, undermining trust | Show the rule's short title/summary text inline next to the citation, sourced from the same versioned config (see Pitfall 5) |
| Reporting a single aggregate "weight: FAIL" with no breakdown of contributing parts | Team can't act on the failure — doesn't know what to remove/fix | Break down weight by tag category (FRAME_/MECH_/BUMPER_/untagged) and flag the specific parts driving a failure, especially those missing materials |
| Silently treating "no FRAME_-tagged parts found" as a pass/skip rather than a loud error | A team that hasn't tagged anything yet gets a false sense that everything's fine (no red flags shown) | Treat "zero tagged parts for a check that requires tags" as its own explicit error state ("Not yet checkable — no parts tagged FRAME_"), not a silent skip or accidental pass |

## "Looks Done But Isn't" Checklist

- [ ] **Weight check:** Often missing the distinction between R103 (excluding bumpers/battery, ≤115 lb) and R408 (including bumpers, ≤135 lb) as two separate verdicts — verify both are computed and both cite their own rule number, not one generic "weight" number.
- [ ] **Material audit:** Often missing coverage of parts nested inside sub-subassemblies (recursive traversal) — verify a part buried three levels deep in subassemblies is still caught if its material is unset.
- [ ] **Frame perimeter:** Often missing the floor-projection step (using 3D hull instead of projected-then-hulled 2D points) — verify by testing a robot with frame rails at varying heights or a part with geometry above the main frame plane.
- [ ] **OAuth flow:** Often missing the refresh-token path entirely, only tested with short-lived manual sessions — verify by leaving a session open past 60 minutes and confirming the check still works without a full re-login.
- [ ] **Rule citations:** Often hardcoded as literal strings in check logic/UI rather than sourced from versioned config — verify by grepping the codebase for rule-number/rule-name string literals outside the config layer.
- [ ] **"Check now" context:** Often reads cached document/workspace/element IDs from initial load — verify by switching tabs/documents within Onshape mid-session and confirming the next check reflects the new context, not the old one.
- [ ] **Starting configuration:** Often silently uses "whatever configuration is currently active" without disclosing this — verify the UI explicitly states which configuration was measured for every height/perimeter verdict.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Silent mass omission from unset materials (Pitfall 1) shipped and teams got false PASS verdicts | MEDIUM | Ship a fix that gates weight verdicts on material-audit cleanliness; proactively message affected teams/document a known-issue changelog entry since trust repair matters for a legality tool |
| Rule number/name drift (Pitfall 5) shipped hardcoded and a season's rules changed underneath it | LOW–MEDIUM | Refactor to versioned config (should have been done in Phase 1 anyway); audit all check outputs from the affected period and flag/re-notify if any were shipped with the wrong citation — for a legality tool, silent wrongness that already reached users needs an explicit correction, not just a quiet fix |
| Frame perimeter floor-projection bug (Pitfall 3) shipped and produced wrong hulls | MEDIUM–HIGH | Requires geometry-logic fix plus a way to re-validate previously "passing" designs; since this affects the tool's core differentiator, prioritize adding the visual hull-overlay debug view (Pitfall 3 prevention) as part of the fix so future regressions are caught by eye before shipping |
| Stale document/workspace context (Pitfall 7) caused a wrong-document check | LOW | Fix the context-refresh bug; add the document/tab name display (already recommended as a UX safeguard) so future instances are visually catchable even if the underlying bug recurs |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| Silent mass omission from unset materials | Phase 1 (v1) | Weight check refuses to show a clean PASS when material audit has any findings; test with a part studio containing at least one no-material part |
| Assembly mass-properties misuse (bumpers/battery inclusion) | Phase 1 (v1) | Two distinct, separately-filtered weight verdicts exist (R103 and R408 equivalents), each with a printed list of excluded occurrence IDs/tags |
| Frame perimeter floor-projection / minor-protrusion handling | Phase 1 (v1) | Hull computed from 2D-projected points (not 3D hull), visually overlaid in UI for manual sanity check against a known test robot's CAD |
| Starting-configuration ambiguity | Phase 1 (v1) for disclosure; later phase for full config-table detection | Every height/perimeter verdict displays which configuration was measured; test by switching configs mid-session |
| Rule number/text/terminology drift | Phase 1 (v1) architecture; ongoing per-season process | No rule ID/name/text string literals outside the versioned config layer (grep-verifiable); a documented pre-Kickoff review checklist exists for future seasons |
| OAuth token expiry / refresh handling | Phase 1 (v1) | Refresh-token exchange implemented and tested with a session held open >60 minutes |
| Stale document/workspace/element context on repeated checks | Phase 1 (v1) | Context IDs re-derived at check-trigger time, not cached at mount; tested by switching tabs mid-session |
| Placeholder/implausible (but present) material density | Phase 1 (v1) scope limitation documented; later phase for density-sanity heuristic | UI copy explicitly states the audit checks for *missing* materials only |
| Assembly-vs-Part-Studio API traversal correctness (shared dependency of weight + perimeter checks) | Phase 1 (v1) | Single shared, tested traversal utility (occurrences + transforms + tag filtering) used by both checks, not duplicated/divergent logic per check |
| Rate-limit handling (429) | Phase 1 (v1), hardened as usage grows | Backoff/retry logic present; verified by simulating a 429 response in tests |
| Webhook reliability (later phase) | Later phase (webhooks) | Manual "check now" remains available as fallback even after webhooks ship; webhook endpoint always returns 200 promptly |

## Sources

- Onshape OAuth flow and token lifetimes: https://forum.onshape.com/discussion/16693/what-is-the-expiry-time-for-refresh-tokens-in-onshape-api , https://forum.onshape.com/discussion/12268/what-is-the-oauth-authorization-code-lifetime , https://onshape-public.github.io/docs/auth/oauth/
- Onshape API rate limits and error handling: https://onshape-public.github.io/docs/auth/limits/ , https://onshape-public.github.io/docs/api-adv/errors/ , https://github.com/Rhoban/onshape-to-robot/issues/170
- Onshape mass properties (Part Studio endpoint, units, material omission behavior): https://cad.onshape.com/help/Content/View/mass_properties_tool.htm , https://cad.onshape.com/help/Content/massprops-ps.htm , https://forum.onshape.com/discussion/23808/api-partstudio-mass-properties , https://cad.onshape.com/help/Content/Primer/mass_properties_measure.htm
- Onshape mass properties (Assembly-level gap / workaround pattern): https://forum.onshape.com/discussion/14940/get-assembly-mass-properties-with-api , https://forum.onshape.com/discussion/11354/api-getting-mass-properties-for-assembly , https://forum.onshape.com/discussion/26257/can-mass-properties-of-parts-be-accessed-in-the-context-of-an-assembly
- Onshape Assembly structure/occurrence traversal: https://onshape-public.github.io/docs/api-adv/assemblies/ , https://onshape-public.github.io/docs/api-adv/configs/
- Onshape Extension context (documentId/workspaceId/elementId, iframe reload behavior, Action URLs): https://onshape-public.github.io/docs/app-dev/extensions/ , https://onshape-public.github.io/docs/app-dev/clientmessaging/ , https://onshape-public.github.io/docs/app-dev/element-right-panel , https://forum.onshape.com/discussion/26795/how-do-the-query-parameters-in-action-urls-work-for-onshape-extensions , https://forum.onshape.com/discussion/26692/how-do-you-get-the-document-id-and-workspace-id-of-the-currently-active-document-and-workspace
- Onshape webhooks reliability: https://onshape-public.github.io/docs/app-dev/webhook/ , https://forum.onshape.com/discussion/24245/webhook-unregistered , https://forum.onshape.com/discussion/14469/how-to-use-webhooks-for-translations
- Onshape default units per document/workspace: https://cad.onshape.com/help/Content/Document/setting_default_units_per_workspace.htm
- FRC 2026 Robot Construction Rules (R101 ROBOT PERIMETER, R103 weight, R104 starting configuration size, R405 bumper zone, R408 weight with bumpers): https://www.frcmanual.com/2026/robot-construction-rules-(r)
- FRC rule R101 taut-string/convex-hull/minor-protrusion definition (2024 "FRAME PERIMETER" era, for historical comparison): https://frctools.com/2024/rule/R101 , https://www.chiefdelphi.com/t/frame-perimeter/109565
- Confirmation of "FRAME PERIMETER" → "ROBOT PERIMETER" terminology correction for 2026: https://firstfrc.blob.core.windows.net/frc2026/Manual/TeamUpdates/2026TeamUpdate00.pdf , https://www.chiefdelphi.com/t/2026-robot-and-inspection-rules-changes/510291
- 2026 bumper material rule changes (context for rule drift risk): https://community.firstinspires.org/2025-robot-rules-preview-for-2026
- FRC starting configuration / extension limit definition: https://frctools.com/2025/rule/R105 , 2023 Game Manual Section 7 PDF (firstfrc.blob.core.windows.net)

---
*Pitfalls research for: Onshape-integrated FRC robot legality checker*
*Researched: 2026-06-30*

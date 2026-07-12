# Phase 4: Trust-Bar Results Panel - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Polish the existing results panel so **every verdict stands on its own in front of a lead mentor or inspector** — the presentation/trust layer over the checks already shipped in Phases 1–3. No new checks, no new geometry, no new API surface beyond resolving human-readable names for the disclosure header.

**In scope (RSLT-01/02/03 + SC1–4):**
- Each check shows pass/fail (or its non-pass state) alongside rule number, rule title, season limit, and actual measured value — for all real checks from Phases 1–3 (RSLT-01, SC1).
- Any check that can't run shows an explicit, plain-language **"not yet checkable"** state with its own reason — never a silent pass, never a blank row (RSLT-02, SC2).
- A single **"measured against" disclosure header** shows the document, tab/element, configuration, and timestamp the run reflects, with human-readable names (RSLT-03, SC3).
- Re-running "check now" replaces the header + all verdicts **atomically** so no verdict can ever pair old geometry with a new timestamp or vice-versa (SC4).
- Retiring the two Phase-1 proof-of-plumbing checks from the panel (resolves the R101/R103 citation collision — see D-01).
- Just-enough structural/light visual polish to read as a coherent trust panel (D-08).

**Explicitly NOT in scope:**
- Any new rule check, geometry computation, or new Onshape API surface (beyond name-resolution for the header).
- A full design-system / theming / typography-scale visual pass — that is an optional follow-on `/gsd-ui-phase`, not this phase (D-08).
- Active staleness detection / auto-refresh (webhooks) — v2 (WEBH-01). The disclosed timestamp IS the staleness signal for v1's manual check-now model.
- Named-configuration selection convention (`STARTING_` marker etc.) — deferred from Phase 3, still deferred.

</domain>

<decisions>
## Implementation Decisions

### Proof-of-plumbing check disposition (resolves the R101/R103 collision)
- **D-01:** **Retire `occurrenceCountCheck` and `frameTagPresenceCheck` from the panel** — unregister both from `buildEngine()` in `check.routes.ts` so the panel shows only the real rule checks (material audit gate, R103 robot weight, R408 robot+bumpers weight, R101 frame perimeter, R104 starting height). They were Phase-1 plumbing proofs that cite `config.rules[0]`/`rules[1]` **positionally** and emit meaningless measured values (an occurrence count / a tag count) under duplicate R101/R103 labels. SC1's "every check for Phases 1–3" means the real rule checks a team is judged on — not plumbing evidence. Retiring them makes the citation collision disappear entirely.
- **D-01a:** **No signal is lost by retiring `frameTagPresenceCheck`** — `framePerimeterCheck` already gates its own UNKNOWN "no FRAME_-tagged parts" state (Phase 3), so the "not yet checkable — no frame parts tagged" message still surfaces on the R101 row. `occurrenceCountCheck` was pure traversal-plumbing evidence with no rule meaning.
- **D-01b:** Retire = **unregister** from the engine (stop it emitting a verdict/panel row). Leaving the check functions in the repo as dead code vs deleting them is the planner's call; the requirement is that they no longer appear in `/api/check` output. After retiring, confirm the remaining real checks cite their intended rule (the collision was specifically plumbing-vs-real).

### Measured-context disclosure (RSLT-03)
- **D-02:** **Human-readable names in ONE shared panel-level header block.** Show document name, tab/element name, configuration name, and timestamp in a single "measured against" block above the verdict table — not per-row. A single shared block is the natural way to satisfy SC4's "all four update together." The literal "every verdict discloses" (SC3) is satisfied by the run-level block since all checks in one run share the same context.
- **D-02a:** **Resolve human names, not raw id hashes.** The tab/element name is already available in the `getElementsInDocument` response the route fetches (pick the assembly element's `name`). The document name and configuration name may need resolution — **research flag:** confirm the cheapest way to get the document display name (extra Documents-API call vs already present in a response we make) and the default-configuration display name during planning. Ids are meaningless to a mentor glancing at the panel; names are the whole "trust" point.
- **D-02b:** **Timestamp** is server-generated at check time and shown as a human-readable local time (absolute). A relative "just now / N min ago" affordance is a nice-to-have the planner may add. The timestamp is v1's staleness disclosure — there is no active stale-detection (that needs webhooks, v2).

### Re-check atomicity (SC4)
- **D-03:** **Clear-then-show-fresh.** On "check now", clear the previous header + verdicts and render a checking/loading state; render the new disclosure header and new verdicts **together, only when the response lands**. This makes an old-geometry/new-timestamp mismatch structurally impossible, at the cost of a brief empty state during the check. Chosen over dimming stale results in place (more UI work, risks a stale-looking-live moment).

### "Not yet checkable" state (RSLT-02 / SC2)
- **D-04:** **Relabel the UNKNOWN badge to plain-language "NOT YET CHECKABLE"** (keep the distinct yellow, visibly separate from the red FAIL) and **render each check's own reason from its existing `caveats[]`** instead of the current hardcoded `"UNKNOWN — N parts missing material"` in `ReportTable.renderMeasured()`. No `Verdict` schema change — the fix is in the panel; the per-check reasons already exist (`framePerimeterCheck` → "no frame parts tagged", `materialAuditCheck` → parts-missing-material count).
- **D-04a:** **Planner must audit every UNKNOWN-producing branch** to ensure it emits a clear, single, plain-language reason the panel can surface (first caveat, or an equivalently distinguishable one). The material audit's count may need composing from `affectedPartCount` into a human sentence. The bug today is the panel assuming one weight-specific reason for all UNKNOWNs.

### Visual scope
- **D-05:** **Structural + light polish in this phase.** Ship all the data/states/disclosure (rule/title/limit/measured columns, NOT-YET-CHECKABLE states, the measured-against header block, consistent badges, readable grouping/spacing) using the existing inline-style idiom. **No CSS framework, no design-system/typography/color-token pass.** A full visual design remains an optional later `/gsd-ui-phase`. This unblocks the "don't style until checks are real" memory (checks are now real) without pulling a full design pass into this mvp phase.

### Claude's Discretion
- Whether retired check functions are deleted or left as unregistered dead code (D-01b).
- Cheapest document-name / config-name resolution path — verify against the live API during planning (D-02a research flag).
- Whether to add relative-time ("N min ago") alongside the absolute timestamp (D-02b).
- Exact header-block layout and how "light polish" is realized within the no-framework constraint (D-05).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 4: Trust-Bar Results Panel" — goal + 4 success criteria (every verdict cites rule/title/limit/measured for all Phase 1–3 checks; explicit not-yet-checkable states; document/tab/config/timestamp disclosure; atomic 4-field update on re-check).
- `.planning/REQUIREMENTS.md` — RSLT-01 (pass/fail + rule# + title + limit + measured), RSLT-02 (explicit "not yet checkable", never silent pass), RSLT-03 (document/tab/configuration/timestamp per verdict).

### The known landmines this phase resolves
- `.planning/phases/03-frame-perimeter-height/deferred-items.md` — the pre-existing **R101/R103 rule-citation collision**: `occurrenceCountCheck` (`config.rules[0]`) and `frameTagPresenceCheck` (`config.rules[1]`) cite positionally and now duplicate the real perimeter/weight rows. STATE.md flags "recommend resolving before Phase 4 dashboard polish" — D-01 retires them.
- `.planning/STATE.md` §Blockers/Concerns — the collision note and the deferred UI/styling request ("dedicated UI/styling pass deferred until checks are real — now they are").

### Prior-phase decisions this phase inherits
- `.planning/phases/01-connected-foundation-first-check/01-CONTEXT.md` — season-config shape `{ rule, title, limit, unit, operator }`; the distinct Reconnect-vs-report state (must remain its own view, never a table row); the pluggable-engine/`buildEngine()` contract.
- `.planning/phases/02-trustworthy-weight/02-CONTEXT.md` — tri-state `Verdict` + `caveats[]`; UNKNOWN semantics (`undefined` never coerced); the material-audit UNKNOWN gate whose reason the panel must surface honestly.
- `.planning/phases/03-frame-perimeter-height/03-CONTEXT.md` — D-06 default-(as-modeled)-configuration measurement + disclose its name (the config name this phase surfaces in the header); the `framePerimeterCheck` UNKNOWN "no frame parts tagged" state.

### Existing code to modify/extend (repo files)
- `src/server/routes/check.routes.ts` — `buildEngine()` (unregister the 2 plumbing checks, D-01) and the response builder (`measuredContext: { documentId, workspaceId, elementId }` at ~line 343 must grow to carry human names + configuration + server timestamp, D-02).
- `src/panel/api.ts` — `CheckReportContext` / `CheckReport` panel types must grow the new disclosure fields (document/tab/config names, timestamp); `CheckReportVerdict` unchanged (D-04 needs no schema change).
- `src/panel/components/ReportTable.tsx` — `renderMeasured()` hardcodes the weight-specific UNKNOWN message (**the SC2 bug**); relabel UNKNOWN badge → "NOT YET CHECKABLE" and source per-check reason from `caveats[]` (D-04). Add/adjust the shared disclosure header rendering (D-02) and light structural polish (D-05).
- `src/panel/main.tsx` — orchestrates check-now → report render; implement clear-then-show-fresh so header + verdicts swap atomically (D-03). Keep the existing Reconnect/AuthRequired branches distinct.
- `src/server/checks/engine.ts` — `Verdict` shape (PASS/FAIL/UNKNOWN + `caveats[]` + `measured`/`measuredCount` + `geometry`). Read to confirm no schema change is needed for D-04; `M_TO_IN`/`KG_TO_LB` are the only unit-conversion boundaries.
- `src/server/checks/occurrence-count.check.ts`, `src/server/checks/frame-tag-presence.check.ts` — the two checks being retired (D-01).
- `src/server/onshape-client/client.ts` — `getElementsInDocument` (already returns element `name` = the tab name for free); check whether document/configuration display names are cheaply reachable here for D-02a.
- `rules/2026.json` — season config the real verdicts cite; note the `limitStatus: PLACEHOLDER` values (R101=110in, R104=30in) are still unverified against the live 2026 Game Manual (carried blocker — a data task, not a Phase-4 code decision).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Tri-state `Verdict` + `caveats[]`** (`engine.ts`) — already expresses PASS/FAIL/UNKNOWN and per-check reasons; D-04 needs no schema change, only correct panel rendering.
- **`ReportTable.tsx`** — the render target with an existing notes/caveats row and status-badge idiom; extend in place rather than rebuild.
- **`getElementsInDocument`** (`client.ts`) — already fetched by the route and already carries the element/tab `name` → the tab-name disclosure is essentially free (D-02a).
- **Pluggable `buildEngine()`** (`check.routes.ts`) — retiring checks is a one-line unregister each; no engine changes (D-01).

### Established Patterns
- The panel **duplicates no business logic** — it renders whatever JSON the backend returns (api.ts comment). So disclosure data (names, timestamp) must be assembled server-side and shipped in the report, not derived client-side.
- The route **re-derives the target element server-side** and never trusts client-supplied ids (CONN-02) — the disclosed document/tab/config must come from the server-fetched `definition`/elements, never from `req.body`.
- **Reconnect and AuthRequired are distinct top-level states**, never table rows (Phase 1 D-05) — clear-then-show (D-03) must preserve those branches.
- Checks stay **pure/synchronous over shared enriched facts** — no change; this phase is presentation only.

### Integration Points
- Server→panel contract grows disclosure fields on `measuredContext` (server `check.routes.ts` response ↔ panel `api.ts` `CheckReportContext`). This is the main cross-cutting change.
- Name/config/timestamp resolution happens server-side in the route, alongside the existing element re-derivation, before the response is assembled.

</code_context>

<specifics>
## Specific Ideas

- One "measured against" header block: Document name / Tab name / Configuration / Checked-at timestamp — above the verdict table, not repeated per row.
- UNKNOWN badge reads **"NOT YET CHECKABLE"** (plain language), stays yellow, visibly distinct from red FAIL; the reason line comes from the check's own `caveats[]`.
- On "check now": clear old results → loading/checking state → render new header + verdicts together atomically.
- Panel shows only the real rule checks after retiring the two plumbing checks: R101 perimeter, R104 height, R103 weight, R408 weight, material-audit gate.
- Light polish only — consistent badges, header block, readable spacing — no CSS framework, no design-system pass.

</specifics>

<deferred>
## Deferred Ideas

- **Full visual design pass** (typography scale, color/semantic tokens, dashboard layout, responsive treatment) — optional follow-on `/gsd-ui-phase`, explicitly out of this mvp phase (D-05).
- **Active staleness detection / auto-refresh on CAD edit** — needs webhooks; v2 (WEBH-01). v1 discloses the timestamp and relies on manual re-check.
- **Named-configuration selection convention** (`STARTING_` marker / config named "Starting") — deferred from Phase 3, still deferred; v1 measures + discloses the Default config name.
- **Game-Manual limit-value + exact rule-number verification** — R101 (110 in) / R104 (30 in) remain `limitStatus: PLACEHOLDER`; a data/verification task carried from Phases 1/3, not a Phase-4 code decision.

None — discussion stayed within phase scope (no scope-creep ideas surfaced; the only adjacent items were the already-tracked deferrals above).

</deferred>

---

*Phase: 4-trust-bar-results-panel*
*Context gathered: 2026-07-11*

# Phase 1: Connected Foundation & First Check - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The **Walking Skeleton** — the entire CADChecker integration chain proven end-to-end, before any individual check's correctness is trusted:

OAuth login → panel renders inside a real Onshape document tab → "check now" re-derives the *live* document/workspace/element context at click time → typed Onshape API client → shared occurrence-traversal utility (subassembly walk + transforms + tag filtering) → pluggable check engine registering **2+ independent check functions** over the same facts-gathering path → versioned, zod-validated season config supplying rule numbers/titles/limits → structured, rule-cited report rendered in the panel.

**Explicitly NOT in scope:** trustworthy check *correctness*. The two checks that ship here exist to prove pluggability and the shared traversal path, not to give a verdict a team should act on. Real weight/perimeter/height checks come in Phases 2–4. This phase de-risks the highest-uncertainty integration surface (Onshape OAuth + iframe panel context).

</domain>

<decisions>
## Implementation Decisions

### Deployment & Hosting
- **D-01:** Backend runs on a **long-running container host** (Render / Fly.io / Railway class). Chosen over serverless because in-memory session "just works" as the v1 stateless model and it's webhook-ready for the v2 auto-refresh feature — avoiding a later hosting migration. Specific provider is Claude's discretion (see below).
- **D-02:** During local dev, the Onshape iframe panel content is served through an **HTTPS tunnel (ngrok)** so embedding/mixed-content behavior matches production — not bare `localhost`. `localhost` remains valid only as an OAuth redirect URI.

### Token Storage & Refresh
- **D-03:** OAuth access + refresh tokens are held in an **in-memory `express-session` (MemoryStore)**; the session id rides in an httpOnly cookie. Tokens never leave the server. Sessions die on restart/redeploy — acceptable for a "click check now" tool with no persisted state.
- **D-04:** Token refresh is **reactive on 401**: let an Onshape API call fail with 401, use the refresh token to mint a new access token, and transparently retry the request once. No proactive expiry clock-tracking (avoids bookkeeping; naturally handles Onshape-side revocation).
- **D-05:** If refresh itself fails (refresh token revoked/expired), the panel shows a **dedicated "Reconnect" state** — a distinct panel view with a "Session expired — reconnect to Onshape" message and a reconnect button that restarts OAuth. It must be *visually separate* from check-result rows so an expired session is never mistaken for a check failure (satisfies CONN-03 / Success Criterion 3 directly).

### Season Config
- **D-06:** Season rule limits ship as a **JSON file (`rules/2026.json`)**, loaded by season key and **zod-validated at startup**. Pure data — clean year-over-year diffs, updatable by a non-coder mentor from the official Game Manual. Never a TS module, never hardcoded constants.
- **D-07:** Each rule entry carries **`{ rule, title, limit, unit, operator }`** — e.g. `{ rule: "R103", title: "Robot Weight", limit: <placeholder>, unit: "kg", operator: "max" }`. The `operator` (`max`/`min`) lets the check engine compare generically without per-rule branching, paying off in Phases 2–3.
- **D-08:** Phase 1 ships **accurate rule numbers and titles (R101, R103, R104, R408)** with **clearly-marked placeholder limit values** and an inline comment/field pointing to the official FRC Game Manual as the source of truth. Real current-season numbers are NOT asserted — they are unverifiable at this cutoff and Phase 1 trusts no check's output anyway. A team (or a later phase) fills real limits from the Manual.

### Claude's Discretion
- **The two proof-of-plumbing checks** (report presentation area was also left to discretion). Guidance for the planner: both checks MUST consume the *same* shared occurrence-traversal facts to satisfy Success Criterion 5. Suggested pair: (a) an **occurrence/part-inventory count** check and (b) a **`FRAME_`-tag presence** check (how many tagged occurrences exist) — both derived purely from traversal facts, needing no trusted numbers. Exercising the mass-properties endpoint in one trivial check is *desirable* to de-risk Phase 2's weight work, but not required; weigh it against added API surface.
- **First report presentation.** Lean: render **minimal pass/fail rows** shaped like the eventual Phase 4 dashboard (rule number + title + measured value + verdict), topped with an explicit **"plumbing proof — verdicts not yet trusted"** banner so the Walking Skeleton's UI already points at the final direction without overclaiming. Planner may refine.
- **Specific container provider** (Render vs Fly.io vs Railway) — pick whichever has the simplest always-on HTTPS deploy for a Node/Express app.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project stack & Onshape integration decisions
- `CLAUDE.md` — Locked tech stack (TS 5.9, Node 22, Express 5, React 19, Vite 8), the Onshape integration layer (`passport-onshape` for OAuth handshake, `openapi-typescript` + `openapi-fetch` for typed REST calls, hand-rolled `postMessage` listener for the iframe boundary), the "What NOT to Use" list (stale `onshape-client`, API-key-only `onshape-ts-client`, no "Glassworks" npm package), and the container-vs-serverless deployment analysis backing D-01/D-03.

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 1: Connected Foundation & First Check" — goal + 5 success criteria this phase is judged against.
- `.planning/REQUIREMENTS.md` — CONN-01/02/03 (connection & context), CONF-01/02 (rule configuration), RUN-01 (running checks). Also the Out-of-Scope table (no auto-tagging, no datastore, name-prefix tagging convention).

### External Onshape docs (URLs, not repo files — cited in CLAUDE.md "Sources")
- Onshape OAuth flow: https://onshape-public.github.io/docs/auth/oauth/ — authorization-code grant, 60-min access tokens, long-lived refresh tokens (backs D-04).
- Onshape Extensions / Client Messaging: https://onshape-public.github.io/docs/app-dev/extensions/ and .../clientmessaging/ — Element-tab location, Action URL parameter replacement, iframe `postMessage` "ready" handshake + origin validation (backs CONN-02 live-context acquisition).
- Onshape OpenAPI spec (mirrored `onshape-clients/openapi.json`) — source for `openapi-typescript` generation of Assemblies / Parts / mass-properties / bounding-box types.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield. Only `CLAUDE.md` and `.planning/` exist; no source tree.

### Established Patterns
- No code patterns yet. This phase establishes them. Because MVP/Walking-Skeleton mode is active, the planner will scaffold project + routing + one real Onshape read + one real panel interaction + a dev deployment as the thinnest end-to-end slice, and emit a `SKELETON.md` alongside `PLAN.md`.

### Integration Points
- Onshape Developer Portal registration (OAuth app + Extension with Element-tab location + Action URL + redirect URIs) is a **manual external prerequisite** — nothing runs until it exists. Plans should call this out as a setup step, not a code task.
- The shared occurrence-traversal utility is the deliberate integration seam: both Phase-1 proof checks and all future checks (Phases 2–4) consume it.

</code_context>

<specifics>
## Specific Ideas

- Config example shape locked in D-07: `{ rule, title, limit, unit, operator }` with `operator ∈ { "max", "min" }`.
- Config file naming locked in D-06: `rules/2026.json`, loaded by season key.
- Refresh strategy is 401-reactive with a single transparent retry (D-04) — not a proactive expiry timer.

</specifics>

<deferred>
## Deferred Ideas

None new — discussion stayed within phase scope. v2 items (webhook auto-refresh WEBH-01, FeatureScript FSCR-01, assisted tagging TAG-01, additional checks) are already recorded in `.planning/REQUIREMENTS.md` §v2. Note that D-01 (container host) was chosen partly to keep WEBH-01's future webhook receiver viable without a hosting migration.

</deferred>

---

*Phase: 01-connected-foundation-first-check*
*Context gathered: 2026-07-01*

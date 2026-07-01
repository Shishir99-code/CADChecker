# Walking Skeleton — CADChecker (FRC Robot Legality Checker for Onshape)

**Phase:** 1
**Generated:** 2026-07-01

## Capability Proven End-to-End

A team member authorizes CADChecker against their Onshape account via OAuth2, sees the CADChecker panel render inside a real Onshape Element tab, clicks "check now," and gets back a structured, rule-cited pass/fail report produced by a pluggable check engine over a shared occurrence-traversal utility and a versioned season config — proving the entire integration chain (auth → live context → typed API → traversal → check engine → config → report) before any check's correctness is trusted.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.9 (backend + panel) | Locked in CLAUDE.md; one language across the stack; Onshape OpenAPI spec generates accurate TS types, de-risking the "no official SDK" gap |
| Backend runtime | Node.js 22.x LTS | Locked in CLAUDE.md; longest guaranteed support tail across multiple FRC seasons |
| Backend HTTP server | Express 5.2.x | Locked in CLAUDE.md; matches Onshape's own sample repos; Express 5 (not legacy Express 4) |
| Frontend | React 19.2.x + Vite 8.x | Locked in CLAUDE.md; component model fits a pass/fail dashboard; Vite over deprecated CRA |
| OAuth handshake | `passport-onshape` 1.2.x (Passport strategy) with `state: true` CSRF | Purpose-built and actively maintained for Onshape's OAuth2; state param protects the authorization-code flow |
| Onshape REST typing | `openapi-typescript` 7.13.x generated from the live `onshape-clients/openapi.json` spec | The generated clients are stale (2020/2023) but the spec is current; generate types fresh, never depend on `onshape-client`/`onshape-ts-client` |
| Onshape REST calls | `openapi-fetch` 0.17.x thin wrapper (server-side only) | ~6-8 endpoints total; a full SDK is unnecessary weight; token injected server-side |
| Auth / token storage (D-03) | In-memory `express-session` (MemoryStore); tokens live server-side only; session id in an httpOnly + Secure + SameSite=None cookie | v1 stateless model; SameSite=None+Secure required for the cross-origin Onshape iframe (see Known Limitation) |
| Token refresh (D-04) | 401-reactive single transparent refresh-and-retry; no proactive expiry timer | Avoids clock bookkeeping; naturally handles Onshape-side revocation |
| Refresh-failure UX (D-05) | Dedicated, visually-distinct "Reconnect" panel state (not a check-result row) | Satisfies CONN-03 — an expired session is never mistaken for a check failure |
| Season config (D-06/07/08) | `rules/2026.json` loaded by season key, zod-validated at startup; entry shape `{ rule, title, limit, unit, operator }`; accurate R101/R103/R104/R408 numbers/titles with clearly-marked PLACEHOLDER limits | Rule limits change annually; config-driven, mentor-updatable, never hardcoded |
| Context acquisition (CONN-02) | Live re-derivation via `getElementsInDocument` at "check now" click time — NOT postMessage cross-tab awareness (which does not exist for Element Tab extensions) and NOT iframe query params (which identify only the extension's own tab) | Ground-truth research finding; the correct pattern for Element Tab extensions |
| Occurrence traversal | Pure `flattenAssembly(def) → Fact[]` using already-absolute occurrence transforms (no matrix composition up the subassembly chain) | RESEARCH Pattern 2 / A1; the single facts path all Phase 1-4 checks consume |
| Deployment target (D-01) | Long-running container host — **Render** (Claude's discretion among Render/Fly.io/Railway) via `render.yaml`; ngrok HTTPS tunnel in dev (D-02) | In-memory session "just works" on an always-on process; webhook-ready for v2 (WEBH-01) without a hosting migration |
| Directory layout | `src/server/*` (auth, onshape-client, traversal, checks, config, routes) + `src/panel/*` (components, postMessage) + `rules/*.json` | Per RESEARCH Recommended Project Structure; traversal/checks/config are pure and unit-tested; routes compose them |
| Test runner | Vitest 4.x (pure logic) + Supertest 7.x (HTTP routes) | Highest-value tests are the pure traversal/engine/config logic and the OAuth/route contracts |

## Stack Touched in Phase 1

- [x] Project scaffold (TypeScript, Express, React/Vite, ESLint, Vitest) — Plan 01 Task 1
- [x] Routing — `/healthz`, `/auth/onshape`, `/auth/onshape/callback` (Plan 01), `POST /api/check` (Plan 03)
- [x] Real Onshape API read — `getElementsInDocument` (live context) + `getAssemblyDefinition` at "check now" time (Plan 03)
- [x] UI — panel shell with Connect action + origin-validated postMessage handshake (Plan 01), "check now" → report table + Reconnect state (Plan 03)
- [x] Deployment — `render.yaml` for an always-on Render Node service; ngrok HTTPS tunnel + documented dev-run command for local end-to-end (Plan 01)

> Note: the "one real DB read/write" item from the generic skeleton template is intentionally N/A — CADChecker is stateless by design (v1 constraint: no datastore; Onshape is the source of truth). The equivalent "real backend read" proven here is a live Onshape REST read, and the equivalent "real write" is the OAuth session establishment. This substitution is deliberate, not an omission.

## Out of Scope (Deferred to Later Slices)

- **Trustworthy check correctness** — the two Phase 1 checks (occurrence count, FRAME_-tag presence) exist only to prove pluggability and the shared facts path. Real verdicts come in Phases 2-4. The panel carries a "verdicts not yet trusted" banner.
- **Mass-properties API usage** — optional/desirable de-risking left out of Phase 1 to limit API surface (CONTEXT discretion); introduced in Phase 2 for weight.
- **Weight checks / material audit** (WGHT-01..04) — Phase 2.
- **Frame perimeter (2D convex hull) + height** (GEOM-01..03) — Phase 3; reuses this phase's traversal utility.
- **Trust-bar results panel** (RSLT-01..03: full rule citation, "not yet checkable" states, document/tab/config/timestamp disclosure) — Phase 4.
- **v2 features** — webhook auto-refresh (WEBH-01), FeatureScript feature (FSCR-01), assisted tagging (TAG-01), additional checks, historical/multi-doc (all recorded in REQUIREMENTS.md §v2).
- **Explicit user tab selection** — Phase 1 auto-picks the first ASSEMBLY element; explicit selection UI is a later concern.
- **Safari third-party-cookie robustness** — Phase 1 sets SameSite=None+Secure as the minimum and tests Safari explicitly; a robust fix (CNAME first-party subdomain / Storage Access API) is deferred and must be a visible decision, not a silent token-storage swap.

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2 — Trustworthy Weight:** material-default audit gates two occurrence-filtered weight verdicts (R103 robot-only, R408 robot+bumpers), reusing the traversal utility + check engine + season config from this skeleton; introduces mass-properties API usage.
- **Phase 3 — Frame Perimeter & Height:** 2D convex hull (d3-polygon) of floor-projected FRAME_-tagged parts (R101/R104) rendered visually, plus starting-configuration height (R104/R107), reusing the same traversal facts path.
- **Phase 4 — Trust-Bar Results Panel:** upgrades the Phase 1 report table into a full trust bar — every verdict cites rule/limit/measured value, shows explicit "not yet checkable" states, and discloses document/tab/configuration/timestamp.

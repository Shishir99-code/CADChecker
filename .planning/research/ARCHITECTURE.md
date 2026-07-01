# Architecture Research

**Domain:** Onshape OAuth Extension (document-panel app) for CAD rule-checking
**Researched:** 2026-06-30
**Confidence:** HIGH (Onshape App Extension mechanics, OAuth flow, REST endpoints) / MEDIUM (webhook operational details, exact metadata schema) — all confirmed against official Onshape docs, cross-checked with sample apps.

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Onshape Document View (browser)                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  CADChecker Panel (<iframe>, embedded via App Extension)         │  │
│  │  - loaded with ?documentId=&workspaceId=&elementId=&server=...  │  │
│  │  - posts keepAlive handshake to Onshape on load                 │  │
│  │  - "Check Now" button (v1) / auto-refresh on webhook (later)    │  │
│  │  - renders pass/fail list, each row cites rule number           │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────┼────────────────────────────────────────┘
                                │ HTTPS (fetch, same-origin as backend)
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        CADChecker Backend (server)                    │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────────────┐  │
│  │  Auth module   │  │ Onshape API    │  │   Check Engine           │  │
│  │  - OAuth code  │  │ client         │  │  - registry of rule      │  │
│  │    exchange    │  │ - assemblies   │  │    checks (R101, R104…)  │  │
│  │  - token store │  │ - parts        │  │  - each check: pure fn   │  │
│  │    (session)   │  │ - mass props   │  │    (facts) -> result     │  │
│  │  - refresh     │  │ - metadata     │  │  - runs independently,   │  │
│  └───────┬───────┘  └───────┬────────┘  │    aggregates results    │  │
│          │                  │            └─────────────┬────────────┘  │
│          │                  │                           │               │
│          │                  ▼                           │               │
│          │      ┌────────────────────────┐              │               │
│          │      │  Geometry module        │              │               │
│          │      │  - floor-plane projection│◄────────────┘               │
│          │      │  - 2D convex hull        │                             │
│          │      │  - occurrence transforms │                             │
│          │      └────────────────────────┘                             │
│          │                                                              │
│          ▼                                                              │
│  ┌────────────────────────┐         ┌───────────────────────────────┐  │
│  │  Rule-config loader     │         │  (v1: none — no datastore)     │  │
│  │  - versioned JSON/YAML  │         │  (later: webhook subscription  │  │
│  │    per season, bundled  │         │   table, cached results, etc.) │  │
│  │    with the app          │        └───────────────────────────────┘  │
│  └────────────────────────┘                                            │
└──────────────────────────────────────────────────────────────────────┘
                                │ HTTPS (OAuth Bearer token)
                                ▼
                     ┌─────────────────────────┐
                     │   Onshape REST API        │
                     │  (cad.onshape.com/api)    │
                     └─────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| **Panel UI** | Renders inside the Onshape document iframe; reads `documentId`/`workspaceId`/`elementId`/`server` from its own load URL query params; posts `keepAlive` handshake to Onshape; triggers backend calls; shows pass/fail list with rule citations | SPA (React/Svelte/plain JS) served as static assets by the backend or a CDN, loaded into Onshape's iframe |
| **Auth module** | OAuth2 authorization-code exchange, token storage (session-scoped in v1), silent refresh before expiry, per-user credential isolation | Session middleware (e.g., `express-session` + signed cookie) holding `{accessToken, refreshToken, expiresAt}`; no DB row in v1 |
| **Onshape API client** | Wraps REST calls to Assemblies/Parts/Metadata/MassProperties endpoints; attaches `Authorization: Bearer <token>`; handles pagination/transient errors | Typed HTTP client (generated from Onshape's OpenAPI spec, or hand-rolled fetch wrapper) |
| **Geometry module** | Projects tagged frame-part geometry onto the floor plane using occurrence transforms; computes 2D convex hull; computes derived measurements (perimeter, height) | Pure functions operating on JSON facts pulled from the API — no CAD kernel needed, since Onshape does the actual solid modeling |
| **Rule-config loader** | Loads the season's numeric limits (frame perimeter, weight, height) from versioned config bundled with the deployed app | Static JSON/YAML file per season (`config/rules/2026.json`), selected by a `season` value (defaulted to current year, overridable) |
| **Check engine** | Runs each rule check independently against a shared "facts" object; each check emits `{ruleNumber, title, status, message}`; aggregates into a report | Registry/array of check modules, each implementing a common interface; engine iterates and collects results, isolating failures per-check |
| **Backend server** | Hosts panel static assets, OAuth endpoints, and a `/api/check` orchestration endpoint that ties auth + Onshape client + geometry + rule-config + check engine together | Single Node.js/TypeScript service (Express/Fastify) — matches Onshape's own sample apps (`app-bom`, `inventory-oauth2-app`) |

## Recommended Project Structure

```
src/
├── server/
│   ├── auth/
│   │   ├── oauth.ts          # authorize redirect, code→token exchange, refresh
│   │   └── session.ts        # session middleware, token get/set helpers
│   ├── onshape/
│   │   ├── client.ts         # low-level fetch wrapper w/ Bearer auth, base URL
│   │   ├── assemblies.ts     # getAssemblyDefinition, occurrences, transforms
│   │   ├── massProperties.ts # part + assembly mass-properties calls
│   │   └── metadata.ts       # part metadata (material, name) calls
│   ├── geometry/
│   │   ├── projection.ts     # apply occurrence transform, project to floor plane
│   │   └── convexHull.ts     # 2D convex hull (e.g., monotone chain algorithm)
│   ├── rules/
│   │   ├── config/
│   │   │   ├── 2026.json     # versioned season limits (frame, weight, height)
│   │   │   └── schema.ts     # zod/type schema for a season config file
│   │   └── loader.ts         # resolves "current season" -> config object
│   ├── checks/
│   │   ├── types.ts          # Check interface: (facts, config) => CheckResult
│   │   ├── registry.ts       # array of all registered checks
│   │   ├── r101-frame-perimeter.ts
│   │   ├── r103-starting-height.ts
│   │   ├── r104-weight.ts
│   │   └── material-default-audit.ts   # internal check, not FRC-numbered
│   ├── engine/
│   │   └── runEngine.ts      # gathers facts, runs checks, aggregates report
│   ├── routes/
│   │   ├── auth.ts           # /oauth/authorize, /oauth/callback
│   │   └── check.ts          # POST /api/check {documentId, workspaceId, elementId}
│   └── index.ts               # server bootstrap
├── panel/                     # frontend SPA loaded in Onshape's iframe
│   ├── context.ts             # parse documentId/workspaceId/elementId/server from URL
│   ├── onshapeMessaging.ts    # postMessage keepAlive handshake with Onshape
│   ├── api.ts                 # calls backend's /api/check
│   └── components/
│       ├── CheckList.tsx      # pass/fail rows, each citing rule number
│       └── CheckNowButton.tsx
└── shared/
    ├── types.ts               # Facts, CheckResult, RuleConfig shared types
    └── ruleIds.ts              # canonical rule-number constants
```

### Structure Rationale

- **`server/onshape/`** isolates every Onshape REST call behind typed functions — when webhooks or FeatureScript arrive later, they reuse this same client rather than duplicating HTTP logic.
- **`server/geometry/`** is deliberately Onshape-agnostic: it takes plain coordinate/transform data and returns a hull. This keeps convex-hull math testable without mocking HTTP.
- **`server/rules/config/`** stores one file per season. The loader resolves "current" but keeps prior years on disk so historical checks and tests remain reproducible as rules change annually.
- **`server/checks/`** — one file per rule, each independently pluggable. Adding a new rule check never touches existing files (open/closed).
- **`panel/`** is a separate deployable concern (static assets) from `server/`, but both live in one repo/monorepo for v1 simplicity — no need for microservices at this scale.

## Architectural Patterns

### Pattern 1: OAuth2 Authorization-Code Flow (server-side, confidential client)

**What:** Onshape uses standard OAuth2. The panel never holds client secrets; the backend performs the code-for-token exchange and stores tokens server-side (session), while the panel only carries a session cookie.

**Flow (confirmed from official docs, onshape-public.github.io/docs/auth/oauth/):**
1. App registered in Onshape Developer Portal (or enterprise Settings) with a **redirect URI** pointing at the backend, e.g. `https://cadchecker.example.com/oauth/callback`.
2. When Onshape first loads the extension iframe (or when the panel detects "not authenticated"), redirect the top-level window (not the iframe) to `https://oauth.onshape.com/oauth/authorize?response_type=code&client_id=...&redirect_uri=...`.
3. User approves; Onshape redirects to the registered `redirect_uri` with `?code=...`.
4. Backend POSTs the code to `https://oauth.onshape.com/oauth/token` with `client_id`/`client_secret` to receive `{access_token, refresh_token, expires_in}`.
5. Backend stores tokens in the server-side session (cookie-keyed), scoped to that Onshape user.
6. Access tokens expire in 60 minutes; **refreshing also rotates the refresh token** — both new values must be persisted every refresh, or the session breaks on the next attempt.
7. On each `/api/check` call, the Onshape API client checks token expiry and silently refreshes before calling Onshape endpoints.

**When to use:** This is Onshape's only supported OAuth flow for App Extensions/Store apps (as opposed to API keys, which are for personal/dev scripts, not multi-user apps).

**Trade-offs:** Requires the app to be a confidential client (client secret held server-side) — cannot be a pure static frontend. Session-only storage (v1) means re-authorizing after server restart or session expiry; acceptable for v1's stateless constraint, but a real UX cost users will notice on cold starts.

**Onshape-specific gotchas confirmed in docs:**
- 3rd-party cookies must be enabled in the browser — some browsers' default privacy settings can silently break the flow inside the iframe; worth an explicit "enable cookies" fallback message in the panel.
- Enterprise/company documents may require a `company_id` selection during authorization.

### Pattern 2: Context Acquisition via Iframe Query Parameters + postMessage Handshake

**What:** Onshape does not "pass context via an API call" — it embeds the panel as an `<iframe>` whose `src` URL is built from the app's registered **Action URL template**, with Onshape substituting `{$documentId}`, `{$workspaceOrVersionId}`, `{$workspaceOrVersion}` (`w` or `v`), `{$elementId}`, plus default params `server`, `companyId`, `userId`, `locale`, `clientId`.

**When to use:** Every App Extension panel/tab must do this on initial page load — it's the only way to know which document is open.

**Example:**
```typescript
// panel/context.ts
export function parseOnshapeContext(): OnshapeContext {
  const params = new URLSearchParams(window.location.search);
  return {
    documentId: params.get('documentId')!,
    workspaceOrVersion: params.get('workspaceOrVersion') ?? 'w', // 'w' | 'v'
    workspaceOrVersionId: params.get('workspaceOrVersionId')!,
    elementId: params.get('elementId')!,
    server: params.get('server')!,   // used to validate postMessage origin
  };
}
```

```typescript
// panel/onshapeMessaging.ts
// Onshape will NOT post messages to the iframe until the app first posts
// a valid message back (the "keepAlive" handshake).
export function startHandshake(ctx: OnshapeContext) {
  window.parent.postMessage({ documentId: ctx.documentId, action: 'keepAlive' }, ctx.server);
  window.addEventListener('message', (e) => {
    if (e.origin !== ctx.server) return; // origin validation is mandatory
    // handle Onshape-initiated messages (selection changes, etc.)
  });
}
```

**Trade-offs:** Context is only as fresh as the iframe's `src` — if the user navigates to a different tab/element inside Onshape without a full reload, the panel may need to listen for Onshape's postMessage updates rather than assume a static context. v1's "manual check now" model sidesteps this: the user re-triggers a check, which re-derives context from the current DOM/query state at click time.

### Pattern 3: Backend Orchestration Endpoint ("Facts Gathering" → Check Engine)

**What:** The panel calls a single backend endpoint (`POST /api/check`) with `{documentId, workspaceOrVersion, workspaceOrVersionId, elementId}`. The backend performs all Onshape API calls, assembles a normalized "facts" object, runs it through the check engine, and returns a report. The panel does zero direct Onshape API calling and zero rule logic — it is a pure renderer.

**When to use:** Always, for this class of app — keeps client secrets and Onshape API complexity server-side, and makes the check engine trivially unit-testable independent of the UI.

**Example:**
```typescript
// server/routes/check.ts
router.post('/api/check', async (req, res) => {
  const { documentId, wv, wvId, elementId } = req.body;
  const token = await getValidAccessToken(req.session);

  const facts = await gatherFacts(token, { documentId, wv, wvId, elementId });
  // facts = { parts, massProperties, taggedFrameParts, occurrenceTransforms, ... }

  const seasonConfig = loadRuleConfig(currentSeason());
  const report = runEngine(facts, seasonConfig); // [{ruleNumber, status, message}, ...]

  res.json(report);
});
```

**Trade-offs:** Every check run re-fetches everything from Onshape (no cache in v1) — simplest correct behavior for a stateless app, at the cost of a few extra seconds per "Check Now" click on large assemblies. This is an acceptable v1 trade because rechecks are user-initiated, not continuous.

## Data Flow

### Request Flow ("Check Now")

```
[User clicks "Check Now" in panel]
    ↓
[panel/api.ts] → POST /api/check {documentId, wv, wvId, elementId}
    ↓
[server/routes/check.ts] → getValidAccessToken() (refresh if needed)
    ↓
[server/onshape/*.ts] → parallel calls:
    - getAssemblyDefinition (occurrences, transforms, part names)
    - getMassProperties (assembly total + per-part)
    - getPartMetadata (material assigned? default material?)
    ↓
[gatherFacts()] → normalize into a single Facts object:
    { partsByTag: {FRAME: [...], BUMPER: [...], MECH: [...]},
      massProperties, materialFlags, occurrenceTransforms }
    ↓
[server/geometry/*.ts] → project FRAME parts to floor plane → 2D convex hull → perimeter
    ↓
[server/rules/loader.ts] → load season config (e.g. 2026.json: {frameMaxIn: 110, weightMaxLbs: 115, heightMaxIn: 30})
    ↓
[server/engine/runEngine.ts] → for each registered check: check(facts, config) → CheckResult
    ↓
[response] ← [{ruleNumber: "R101", title: "Frame Perimeter", status: "pass", message: "104.2 in ≤ 110 in"}, ...]
    ↓
[panel/components/CheckList.tsx] renders pass/fail rows with rule citations
```

### State Management (v1, stateless)

```
[Onshape] ──(source of truth: geometry, tags, mass, material)──► [Backend, per-request]
                                                                        │
[Session cookie] ──(source of truth: OAuth tokens only)───────────────┘
                                                                        │
[Bundled config files] ──(source of truth: season rule limits)────────┘
                                                                        ▼
                                                              [Ephemeral Facts + Report]
                                                              (exists only for the
                                                               duration of one request;
                                                               never persisted)
```

No database in v1. The only "state" the backend holds is the OAuth session (access/refresh token pair), which is disposable and re-derivable via re-authorization. This directly satisfies the PROJECT.md constraint: "Onshape is the source of truth for geometry and name-prefix tags; rule limits ship as versioned per-season config."

### Key Data Flows

1. **Auth flow:** Browser top-level redirect (not iframe) → Onshape consent → redirect_uri code → backend token exchange → session cookie set → panel iframe reloads authenticated.
2. **Context flow:** Onshape iframe `src` query params → panel parses on load → panel includes context in every backend call (never trust a cached/stale context across page loads).
3. **Facts flow:** Backend → Onshape REST (Assemblies + Parts + MassProperties + Metadata) → normalized in-memory Facts object → discarded after response.
4. **Check flow:** Facts + season RuleConfig → each independent check function → CheckResult[] → aggregated Report → panel.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Single team, v1 (manual check) | Exactly as described — stateless request/response, no cache, no DB. One small Node process handles auth + API client + checks. |
| Many teams, still v1 semantics | Still no DB needed — OAuth session per user is the only state, and it's already per-request-scoped. Horizontal scaling just needs sticky sessions or a shared session store (Redis) if running >1 backend instance — this is the first likely bottleneck, not compute. |
| Webhooks added (later phase) | Requires: (a) a publicly reachable HTTPS endpoint with a CA-signed cert to receive Onshape's POST notifications, (b) a place to persist "which documents/users have an active webhook + their tokens" — this is the point where a real datastore becomes necessary, since webhook delivery is asynchronous and disconnected from any live browser session. |
| FeatureScript custom feature (later phase) | Runs inside Onshape's own compute (no external server round-trip for the simple checks it covers) — doesn't change backend scaling at all; it's an independent, parallel surface that reads the same name-prefix tags. |

### Scaling Priorities

1. **First bottleneck:** Session storage when running more than one backend instance (needed for redundancy/deploys, not necessarily "scale" in the traffic sense). Fix: move from in-memory session store to Redis-backed sessions — a drop-in swap, doesn't change any other component.
2. **Second bottleneck (only once webhooks exist):** Correlating an incoming webhook notification (`documentId`/`workspaceId`/`elementId`) back to a specific user's OAuth token to make the follow-up API call. Fix: this is exactly the trigger for introducing a minimal datastore (e.g., a `webhook_subscriptions` table mapping document → user/token-reference), which PROJECT.md already anticipates as a later-phase addition.

## Anti-Patterns

### Anti-Pattern 1: Doing OAuth or Onshape API calls from the panel (frontend) directly

**What people do:** Put the `client_secret` in frontend JS, or call `cad.onshape.com/api/...` directly from the iframe with a token stored in `localStorage`.

**Why it's wrong:** Onshape OAuth apps are confidential clients — the secret must never reach the browser. Also, third-party cookie/iframe storage restrictions in modern browsers make `localStorage` inside an Onshape iframe unreliable across reloads, and CORS is not guaranteed to be open for arbitrary origins to `cad.onshape.com`.

**Do this instead:** Panel only talks to your own backend (`/api/check`, `/oauth/*`). Backend is the only thing that ever holds tokens or calls `cad.onshape.com` directly.

### Anti-Pattern 2: Trying to compute frame perimeter from raw solid geometry / mesh data

**What people do:** Pull a tessellated mesh or STL-like export and attempt to derive the "frame" boundary algorithmically from all geometry in the assembly.

**Why it's wrong:** There's no way to know which geometry constitutes "frame" versus "mechanism" versus "bumper" from geometry alone — R101's frame perimeter must be evaluated only on frame-tagged parts. Pulling full mesh geometry is also unnecessarily heavy compared to using occurrence transforms + part bounding/vertex data already provided by the Assemblies API.

**Do this instead:** Rely on the name-prefix tag convention (`FRAME_`) to filter which parts participate in the hull calculation, and use occurrence transforms + a lightweight representative point set (e.g., part bounding box corners, or vertex/edge data from the Part Studio if higher fidelity is needed) rather than full mesh export.

### Anti-Pattern 3: Hardcoding season rule limits as constants in check code

**What people do:** Write `if (weight > 115)` directly inside a check function.

**Why it's wrong:** FRC changes these numbers annually via the Game Manual — hardcoding forces a code change (and redeploy + retest of check logic) every season, and makes it impossible to validate a design against a prior season's rules for regression testing.

**Do this instead:** Every check function receives `config` as a parameter (`check(facts, config)`); the numeric limit always comes from the loaded season config file, never a literal in the check body.

### Anti-Pattern 4: One monolithic "runAllChecks()" function with inline if/else per rule

**What people do:** A single large function that fetches everything and inline-evaluates every rule in sequence, mixing data-fetching, geometry math, and pass/fail logic together.

**Why it's wrong:** Impossible to unit test one rule in isolation; adding rule #6 means editing a function that already has five other rules' logic in it, risking regressions; a single check's runtime error can crash the entire report instead of degrading gracefully to "this one check errored."

**Do this instead:** Check engine pattern — registry of independent check modules, each `(facts, config) => CheckResult`, engine wraps each call in isolation (catch-and-report errors per check rather than failing the whole request) and aggregates results.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| Onshape OAuth (`oauth.onshape.com`) | Authorization-code flow, confidential client, server-side token exchange/refresh | Access tokens expire in 60 min; refresh rotates both tokens — must persist both every time (confirmed: onshape-public.github.io/docs/auth/oauth/) |
| Onshape REST API (`cad.onshape.com/api`) | Bearer-token authenticated HTTPS calls: Assemblies (`getAssemblyDefinition`), Parts/Metadata (`/metadata/d/.../p/:partid` for material), Mass Properties (`/assemblies/.../massproperties`, `/parts/.../partid/.../massproperties`) | Endpoints confirmed via Onshape API Explorer references; assembly occurrence transforms are absolute (not relative to parent), important for correct floor-plane projection |
| Onshape App Extension embedding | iframe with Action-URL-templated query params (`{$documentId}`, `{$workspaceOrVersionId}`, `{$elementId}`, `server`, etc.) + postMessage handshake | App extension config (URL template, panel location) is set up in the Onshape Developer Portal, not in app code |
| Onshape Webhooks (later phase) | Register subscription with `POST /api/webhooks` for `onshape.model.lifecycle.changed`, scoped to a document (or company for all-docs); Onshape POSTs a JSON notification on change | Requires a publicly reachable HTTPS endpoint with a CA-signed certificate (self-signed rejected); Onshape sends a synchronous trial notification immediately upon registration, so the handler must be live *before* the registration call completes |
| FeatureScript custom feature (later phase) | Runs as user-authored/published FeatureScript inside Onshape's own Part Studio compute; reads the same name-prefix tags via `partQuery`/context | No network call to your backend for this surface — it's a parallel, independent read path against the same tagging convention, so no rework of the backend Facts/Check-engine layers is required |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Panel (frontend) ↔ Backend | HTTPS JSON (`POST /api/check`, `GET/POST /oauth/*`) | Panel never sees Onshape tokens; session cookie is the only credential the browser holds |
| Auth module ↔ Onshape API client | In-process function call (`getValidAccessToken()` returns a fresh Bearer token) | Client always asks Auth for a token rather than reading session state itself — keeps refresh logic in one place |
| Onshape API client ↔ Geometry module | Plain data objects (occurrence transforms, part lists) — no HTTP, no Onshape SDK types leak into geometry code | Geometry module is pure and independently testable with fixture data |
| Rule-config loader ↔ Check engine | Config object passed as a parameter into every check call | Never a global/singleton config — enables running checks against multiple seasons in the same process (useful for tests, and later for "what would this look like under next year's rules" previews) |
| Check engine ↔ each Check module | Common `Check` interface: `{ ruleNumber, title, run: (facts, config) => CheckResult }` | New checks register themselves in `checks/registry.ts`; engine has zero knowledge of individual rule logic |
| Backend ↔ future Webhook receiver | Both call into the same `gatherFacts()` + `runEngine()` code path used by `/api/check` | Webhook handler differs only in *what triggers* the check (Onshape notification vs. user click) and *where the result goes* (needs a delivery mechanism — cached result + panel poll, push via websocket, or stored + shown on next panel load — a webhook-phase design decision, not an architecture rework) |

## Build Order & Phase Sequencing Implications

This section maps directly to how research should shape the roadmap's phase structure.

1. **Foundation: Onshape app registration + OAuth + empty panel.** Register the app in the Onshape Developer Portal, implement the authorization-code flow end-to-end, confirm the panel loads inside a real Onshape document and can read `documentId`/`workspaceId`/`elementId` from the iframe URL, and complete the postMessage `keepAlive` handshake. Nothing else is buildable until context acquisition is proven working inside actual Onshape UI — this is the highest-uncertainty, highest-priority-to-de-risk step.
2. **Onshape API client + Facts gathering.** Implement `getAssemblyDefinition`, mass-properties calls, and part metadata (material) calls against a real test document. Prove you can retrieve name-tagged parts (`FRAME_`, `BUMPER_`, `MECH_`) and their transforms/masses. This is where the "read existing tags via standard Parts API" decision gets validated against a real document.
3. **Rule-config loader + season config schema.** Small and low-risk, but should exist before checks are written, since every check signature depends on `config` being available.
4. **Check engine skeleton + first simple check (weight).** Build the registry/aggregation pattern with the simplest rule (total weight vs. limit, straight from mass-properties) to validate the `Check` interface before investing in geometry.
5. **Geometry module (convex hull) + frame perimeter check.** The highest-complexity, highest-value v1 check — do this once the plumbing (facts → engine → panel) is already proven with the weight check, so geometry bugs are isolated from integration bugs.
6. **Remaining v1 checks (material-default audit, starting height) + panel polish.** These reuse all existing plumbing; should be cheap once steps 1-5 are solid.
7. **(Later phase) Webhooks.** Slots in without rework because it reuses `gatherFacts()`/`runEngine()` unchanged — the new work is: a public HTTPS receiver, a subscription-to-token mapping (first real datastore need), and a decision on how results reach an already-open panel (poll-on-open vs. push).
8. **(Later phase) FeatureScript custom feature.** Fully independent surface (different runtime, different language/environment) reading the same tag convention — does not touch the backend/panel architecture at all; can be developed and shipped in parallel with any later backend phase.

## Sources

- [Onshape App Extensions docs](https://onshape-public.github.io/docs/app-dev/extensions/) — iframe embedding, Action URL parameters, postMessage handshake, origin validation. HIGH confidence (official docs).
- [Onshape OAuth docs](https://onshape-public.github.io/docs/auth/oauth/) — authorization-code flow, redirect URI formats, token refresh/rotation, 60-minute expiry, cookie requirements. HIGH confidence (official docs).
- [Onshape Webhooks docs](https://onshape-public.github.io/docs/app-dev/webhook/) — HTTPS/CA-cert requirement, trial notification behavior, payload fields. HIGH confidence (official docs).
- [Onshape Assemblies API docs](https://onshape-public.github.io/docs/api-adv/assemblies/) — `getAssemblyDefinition`, occurrences array, absolute occurrence transforms. HIGH confidence (official docs).
- [Onshape REST API introduction](https://onshape-public.github.io/docs/api-intro/) — general API conventions. HIGH confidence (official docs).
- [Onshape Documents API docs](https://onshape-public.github.io/docs/api-adv/documents/) — document/workspace/version identifiers. HIGH confidence (official docs).
- [app-bom sample app (GitHub, onshape-public)](https://github.com/onshape-public/app-bom) — reference architecture: Node.js backend, Redis session store, routes/views/public structure, iframe context passing. MEDIUM confidence (community/official sample, not exhaustively read line-by-line).
- [inventory-oauth2-app sample (GitHub, onshape-public)](https://github.com/onshape-public/inventory-oauth2-app) — reference OAuth2 extension integration example. MEDIUM confidence (referenced, not deeply inspected).
- Mass-properties endpoints (Part, PartStudio, Assembly) — confirmed via Onshape API Explorer references and community forum discussion threads (forum.onshape.com/discussion/14940, /11354, /23808). MEDIUM confidence (endpoint paths confirmed by multiple independent forum threads and the Java API client docs, but not fetched directly from the live API Explorer in this research pass — verify exact response schema during Foundation phase implementation).
- Part metadata / material endpoint (`/metadata/d/.../p/:partid`) — confirmed via forum.onshape.com/discussion/24354 and general metadata API pattern. MEDIUM confidence — exact material-schema fields should be verified against a live test document early in the Facts-gathering phase.

---
*Architecture research for: Onshape OAuth Extension / FRC CAD rule-checker*
*Researched: 2026-06-30*

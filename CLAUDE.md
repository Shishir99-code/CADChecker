<!-- GSD:project-start source:PROJECT.md -->

## Project

**CADChecker — FRC Robot Legality Checker for Onshape**

An Onshape-integrated legality checker for FIRST Robotics Competition (FRC) robots. Teams design their robot in Onshape CAD, and CADChecker continuously checks the design against the current season's official robot construction rules — frame perimeter size, weight limits, starting height, and material/mass accuracy — surfacing violations *before* the team ever reaches an in-person inspection.

The primary surface is an **Onshape Extension**: a web app registered as an Onshape OAuth app that renders as a panel/tab inside the Onshape document view. It shows a live pass/fail dashboard, and every check cites the specific rule number it enforces (e.g. R101, R104). A secondary surface (later phase) is a lightweight **FeatureScript custom feature** for instant, always-on feedback on the simplest checks with zero external-server latency.

It is for FRC teams (and their CAD leads/students) who design in Onshape and want to catch rule violations early. No physical robot or hardware access is required — this is a pure CAD-analysis tool.

**Core Value:** Surface FRC rule violations in a team's CAD design *before* in-person inspection, so problems are caught and fixed at design time rather than at competition.

### Constraints

- **Integration**: Onshape REST API (OAuth2, Assemblies API, Part Studios API, mass-properties endpoints) — the app is fundamentally an Onshape OAuth application rendered as a document panel.
- **Tech stack**: To be recommended by domain research (Onshape SDK availability, mass-properties API examples, convex-hull geometry needs) — no preference locked in yet.
- **State**: v1 is stateless — only an in-memory/session OAuth token; Onshape is the source of truth for tags and geometry; rule limits are shipped versioned config. No database in v1.
- **Rule limits**: Stored as versioned per-season config, never hardcoded, because they change annually.
- **Validation data**: Public team CAD documents only; no physical/hardware feedback loop.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Critical Onshape-Specific Finding

- `onshape-public/onshape-clients` (the OpenAPI-codegen'd multi-language client repo that produces the `onshape-client` PyPI package and a TypeScript-Node client) — **last repo push 2023-03-07; PyPI package `onshape-client` last released 2020-05-26 (v1.6.3).** Stale for 5+ years. Do not build on this.
- `onshape-public/onshape-ts-client` — actively maintained (pushed within the last day as of this research), but it is **API-key-only** (no OAuth2 support), designed for internal automation scripts (revision export, webhook listeners), and **not published to npm** (clone-and-run only). Not suitable for an OAuth2 extension.
- `onshape/passport-onshape` — a real, actively maintained (latest release 2026-03) Passport.js strategy for the OAuth2 *authentication handshake only*. It does not wrap the REST API surface (Assemblies, Parts, mass-properties endpoints) — it just gets you an access token via Passport.
- Onshape officially states apps "can be written in any web framework" and provides only a plain HTML/JS + Python-http.server "Hello World" as its canonical extension example — confirming there is no framework or client-library lock-in from Onshape's side.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | 5.9.x | Language for both backend and frontend panel | One language across the stack; the Onshape OpenAPI spec can generate accurate TS types (`openapi-typescript`), directly de-risking the "no official SDK" gap. Python was seriously considered (see Alternatives) but its official client is 5+ years stale, wiping out the main advantage. |
| Node.js | 22.x (Active LTS through Apr 2027) | Backend runtime | LTS, broad hosting support, native `fetch`, first-class TypeScript tooling. Node 24 is the newer Current LTS but 22 has a longer guaranteed support tail and is the safer choice for a project that must survive multiple FRC seasons. |
| Express | 5.2.x | Backend HTTP server (OAuth callback, session, API proxy routes) | Express 5 is the current stable major version (Node 18+ required); minimal, well-understood, and matches the pattern used in Onshape's own `inventory-oauth2-app` and `onshape-ts-client` sample repos (both use Express). Avoid Express 4 — it is legacy-maintenance-only. |
| React | 19.2.x | Frontend panel UI (renders inside the Onshape document-view iframe) | The panel is a small, focused dashboard UI (pass/fail rows, rule citations) — React's component model fits this well and has the largest ecosystem for dashboard/table components. Not mandated by Onshape (extensions are literally just an HTTPS page in an iframe), so this is a "standard developer choice," not a platform requirement. |
| Vite | 8.x | Frontend build tool / dev server | Fast HMR during panel development, trivial static-asset output for serving the panel page. Standard 2025/2026 default over Create React App (long deprecated) or Webpack-first setups. |

### Onshape Integration Layer (the part that is NOT a generic web-app choice)

| Component | Choice | Purpose | Why |
|-----------|--------|---------|-----|
| OAuth2 handshake | `passport-onshape` (npm, latest 1.2.0, released 2026-03) used as a Passport.js strategy | Handles the Onshape-specific authorize/token/refresh endpoints | Actively maintained, purpose-built for exactly this platform, avoids hand-rolling the OAuth dance. Falls back cleanly to a manual `fetch`-based implementation if you want zero extra deps — the flow is simple (standard authorization-code grant with 60-minute access tokens and long-lived refresh tokens). |
| REST API types | `openapi-typescript` (7.13.x) generating types from Onshape's published OpenAPI spec | Type-safe request/response shapes for Assemblies, Part Studios, Parts, mass-properties endpoints | Onshape publishes and maintains a real OpenAPI spec (Context7 `/openapi/cad_onshape_api_openapi`, 1300+ snippets, high reputation) even though the *generated clients* from it are stale. Generating types yourself from the current spec sidesteps the stale-client problem entirely and stays current every time you regenerate. |
| REST API calls | `openapi-fetch` (0.17.x) or a 30-line hand-rolled `fetch` wrapper | Executes typed calls against `https://cad.onshape.com/api/v...` | Pairs directly with `openapi-typescript`-generated types. Extremely small surface area (this app calls maybe 6-8 distinct endpoints: mass properties, bounding boxes, parts metadata, assembly definition) — a full SDK is unnecessary weight for that footprint. |
| Extension embedding / client messaging | Hand-rolled `postMessage` listener (no library needed) | Communicate with the Onshape web client across the iframe boundary (receive documentId/workspaceId/elementId, send ready signal) | This is a documented, narrow postMessage protocol (a handful of message types), not a JS library Onshape ships. Note: "Glassworks" is Onshape's name for its **API explorer/testing tool**, not a client library — do not go looking for an npm package by that name. |
| Session/token storage | In-memory server-side session (e.g., `express-session` with `MemoryStore`, or a signed httpOnly cookie holding the access token directly) | Hold the OAuth access token for the duration of the browser session | Matches the explicit v1 constraint: no datastore. Onshape access tokens live 60 minutes; refresh tokens persist until revoked — plan to refresh silently server-side rather than re-prompting the user each hour. |

### Computational Geometry

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `d3-polygon` | 3.0.1 | 2D convex hull (`polygonHull()`) of the floor-projected, tagged frame-part points | Implements Andrew's monotone chain algorithm (O(n log n)), zero runtime dependencies, ~14.3M weekly downloads (part of the D3 ecosystem, extremely battle-tested), returns hull points in CCW order ready for perimeter-length calculation. Directly maps to FRC rule R101's "taut-string wrap" definition. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `express-session` | 1.18.x | Server-side session middleware | If choosing session-cookie-referencing-server-memory over a fully self-contained signed cookie. Use `MemoryStore` explicitly for v1 (default); document that this means sessions don't survive a server restart/redeploy — acceptable for a "click check now" tool with no persisted state. |
| `dotenv` | 17.x | Load `ONSHAPE_CLIENT_ID` / `ONSHAPE_CLIENT_SECRET` / redirect URI from environment | Standard practice; never commit OAuth client secret. |
| `zod` | 4.x | Runtime validation of versioned rule-limit config files (frame perimeter, weight, height per season) | The PROJECT.md constraint mandates rule limits as versioned config, not hardcoded — validate the shape of that config at load time to fail fast on a bad season file. |
| `vitest` | 3.x | Unit tests, especially for the convex-hull/perimeter math and rule-check logic | Fast, native ESM/TS support, pairs naturally with Vite. This is the highest-value area to unit test (geometry correctness, pass/fail threshold logic) since it has no Onshape dependency and is pure, deterministic code. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `ngrok` (or Onshape's own tunneling guidance) | Expose `localhost` dev server over HTTPS during local extension development | Onshape extension Action URLs must be reachable by the Onshape web client in the user's browser; `http://localhost:<port>` is explicitly supported as an OAuth *redirect URI* for dev, but the *extension iframe content* itself is best served through an HTTPS tunnel so behavior matches production embedding (mixed-content and iframe-security behavior differs from a bare localhost redirect). `onshape-ts-client`'s own package.json depends on `@ngrok/ngrok`, confirming this is the tool the Onshape ecosystem itself reaches for. |
| Onshape Developer Portal (`cad.onshape.com/appstore/dev-portal`) | Register the OAuth application, configure the Extension (name, location = "Element tab", Action URL, redirect URIs) | Not a local tool, but the mandatory first step — nothing else works until an OAuth app + extension exist here. |
| ESLint + `typescript-eslint` | Linting | Standard for a TS codebase; keep config minimal. |

## Installation

# Backend

# Onshape typed API layer

# Geometry

# Frontend (panel)

# Dev dependencies

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| TypeScript (Node/Express backend + React panel) | Python (Flask/FastAPI backend) | If the team's FRC mentors/students are far more Python-fluent than JS. Note: Onshape's official Python client (`onshape-client` on PyPI) is **stale since 2020** — you'd hand-roll REST calls with `requests` + `pydantic` models exactly as you would in TS, so Python loses its "official SDK" advantage entirely. Choose Python only for team-skill reasons, not platform reasons. |
| `openapi-typescript` + `openapi-fetch` (self-generated types from Onshape's spec) | `onshape-client` (PyPI) / typescript-node generated client from `onshape-clients` repo | Never for new v1 work — these are 5+ years stale, tied to old OpenAPI codegen output, and carry API surface that has since evolved. Only relevant if you need Java or C# and are willing to accept the staleness risk (the `java-client` sibling repo is more recently touched — Nov 2024 — and could be reconsidered for a JVM shop). |
| `d3-polygon` for convex hull | `monotone-convex-hull-2d` | If you want a hull *implementation* with zero D3 ecosystem baggage and don't mind pulling in its `robust-orientation` dependency. Functionally equivalent (same algorithm); `d3-polygon` is recommended for its overwhelming adoption and zero-dependency footprint, but this is a low-stakes choice either way. |
| Session-cookie / in-memory token (no DB) | Stateless signed JWT held entirely in an httpOnly cookie (Onshape access token + refresh token encrypted inside the JWT) | Recommended *upgrade path* if deploying to a serverless platform (Vercel Functions, Netlify Functions) where each invocation is a fresh, memory-isolated process — in-memory `express-session` MemoryStore does not survive across serverless invocations. If hosting on a long-running container/VM (Render, Fly.io, Railway), plain in-memory session is simpler and fully sufficient for v1. |
| React + Vite for the panel | Plain HTML/vanilla JS (as in Onshape's own "Hello World" sample) | Only for the very first spike/proof-of-concept extension (confirm the iframe embeds, OAuth redirects work, postMessage handshake succeeds) before building the real dashboard UI. Not recommended for the actual v1 product — a multi-check pass/fail dashboard benefits from componentization. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| `onshape-client` (PyPI) or the `typescript-node` output of `onshape-public/onshape-clients` | Repo untouched since 2023, PyPI package since 2020; generated against an old OpenAPI snapshot; will silently drift from the live API and miss newer endpoints/fields (e.g., current mass-properties response shape). | Hand-rolled thin fetch client + types generated fresh from the live OpenAPI spec via `openapi-typescript`. |
| `onshape-ts-client` as an application dependency | Not published to npm (clone-only), API-key-only auth (incompatible with the OAuth2 extension model this app requires), designed for CLI automation scripts, not a server backend. | `passport-onshape` for auth; your own thin REST wrapper for API calls. Read `onshape-ts-client`'s source only as a reference for endpoint shapes, not as a runtime dependency. |
| Any package or search result referencing "Glassworks" as an installable client | Glassworks is Onshape's **API explorer/testing web tool** name, not a JS/Python library. There is no `glassworks` npm package relevant here. | Onshape's OpenAPI spec + Context7 `/onshape-public/onshape-clients` and `/openapi/cad_onshape_api_openapi` docs for endpoint reference; the Glassworks *website* (`onshape-public.github.io/docs/api-intro/explorer/`) only for interactively testing calls during development. |
| Pure serverless (Vercel/Netlify Functions) with default in-memory session assumptions | Serverless invocations are ephemeral/isolated — `express-session` MemoryStore state (and any in-process token cache) will not persist between the OAuth callback request and the next panel-load request, breaking the "session OAuth token" model unless you switch to a signed-cookie-embedded token. | Either (a) a small always-on Node process (Render, Fly.io, Railway, a basic VM) so in-memory session works as designed, or (b) if serverless is required, switch token storage to an httpOnly signed/encrypted cookie holding the access+refresh token directly (still "stateless" / no DB, just not in-process memory). |
| Create React App | Deprecated, unmaintained, slow dev server. | Vite. |
| Hardcoding season rule limits (frame perimeter, weight, height) as JS/TS constants in application code | PROJECT.md explicitly requires versioned config because these values change yearly via the FRC Game Manual. | A small `rules/2026.json` (or `.ts`) file per season, validated at load with `zod`, loaded by season key. |

## Stack Patterns by Variant

- Use Express + `express-session` with default `MemoryStore`.
- Because the process stays alive between the OAuth callback and subsequent panel API calls, so in-memory token storage genuinely works as "stateless, session-only" without a DB — this is the simplest correct implementation of the v1 constraint.
- Use an httpOnly, signed (and ideally encrypted) cookie to carry the Onshape access token + refresh token directly, rather than a server-memory session store.
- Because each function invocation is a fresh, isolated process; there is no shared memory across the OAuth callback and later API-call requests, so `MemoryStore`-style session will silently fail intermittently.
- Requires a stable, publicly reachable HTTPS endpoint with a CA-signed certificate (self-signed rejected) that can receive a `webhook.register` trial POST and return HTTP 200 promptly.
- A long-running container host remains the simpler choice here too, since webhook delivery expects a consistently available receiver — this is a mild vote in favor of choosing the container-host deployment pattern from v1 onward, even though v1 itself doesn't need webhooks, to avoid a deployment-model migration later.
- FeatureScript is Onshape's own in-CAD scripting language (edited directly in Onshape, not part of this app's deployable stack) — no additional stack decision needed now; it lives entirely inside Onshape and has no npm/pip dependency footprint.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| `express@5.2.x` | `Node.js >=18` (project targets 22.x) | Express 5 dropped some Express-4-only middleware patterns (e.g., default body parsing changes) — verify any copied Express-4-era Onshape sample code (their `inventory-oauth2-app` sample predates Express 5) against Express 5's migration guide before reusing snippets verbatim. |
| `passport-onshape@1.2.0` | `passport@0.7.x` (standard OAuth2Strategy-based) | Standard Passport strategy interface; no known incompatibilities with current Passport core. |
| `openapi-typescript@7.x` | Onshape's `openapi.json` (OpenAPI 3.x, mirrored at `onshape-public/onshape-clients/openapi.json`) | Spec last confirmed updated in the `onshape-clients` repo's `openapi.json` file (kept current even though the *generated clients* in the same repo are stale) — regenerate types periodically rather than treating them as fixed at project start. |
| `d3-polygon@3.0.1` | Any modern ESM/CJS bundler (Vite, Node ESM) | Pure ESM package with no native dependencies; works identically client-side (panel) or server-side (backend) if you want to compute the hull in either place. |
| `react@19.2.x` | `vite@8.x` via `@vitejs/plugin-react` | Standard current pairing; no known issues. |

## Sources

- `/onshape-public/onshape-clients` (Context7) — OAuth2 configuration patterns, mass-properties/Parts/PartStudios API usage examples (Python client shown, confirms endpoint shapes even though the package itself is stale)
- `/openapi/cad_onshape_api_openapi` (Context7) — Onshape REST API OpenAPI spec coverage (1300+ snippets, high reputation) — used to confirm a current, authoritative spec exists independent of the stale generated clients
- `/websites/onshape-public_github_io` (Context7) — Onshape Developer Documentation mirror
- [Onshape Developer Documentation — Extensions](https://onshape-public.github.io/docs/app-dev/extensions/) — extension registration, locations (Element tab = one per app), Action URL parameter replacement, iframe/postMessage security model, HTTPS hosting requirement — HIGH confidence, official docs
- [Onshape Developer Documentation — App Development](https://onshape-public.github.io/docs/app-dev/) — confirms "any web framework" is supported, links Hello World sample — HIGH confidence
- [Onshape Developer Documentation — Hello World](https://onshape-public.github.io/docs/app-dev/helloworld/) — confirms minimal HTML/JS + Python http.server reference example, no framework mandate — HIGH confidence
- [Onshape Developer Documentation — OAuth](https://onshape-public.github.io/docs/auth/oauth/) — authorization-code flow, `localhost` and out-of-band redirect URI support, 60-minute access token lifetime, long-lived refresh tokens — HIGH confidence
- [Onshape Developer Documentation — Client Messaging](https://onshape-public.github.io/docs/app-dev/clientmessaging/) (referenced via search, corroborated by Extensions page) — postMessage protocol, origin validation, "ready" handshake requirement — HIGH confidence
- [Onshape Developer Documentation — Webhooks](https://onshape-public.github.io/docs/app-dev/webhook/) — registration flow, `onshape.model.lifecycle.changed` event, CA-signed HTTPS requirement (self-signed rejected), no mandated signature verification — HIGH confidence, relevant to future phase but informs deployment choice now
- [Onshape Developer Documentation — Structured Storage](https://onshape-public.github.io/docs/app-dev/structuredstorage/) — confirms Onshape's own document-native storage option, and confirms v1's "no DB" design doesn't need it since v1 persists nothing — HIGH confidence
- [github.com/onshape-public/onshape-clients](https://github.com/onshape-public/onshape-clients) — repo metadata: last push 2023-03-07, PyPI `onshape-client` last release 2020-05-26 (v1.6.3) — verified via GitHub API and PyPI JSON API — HIGH confidence (primary source, directly queried)
- [github.com/onshape-public/onshape-ts-client](https://github.com/onshape-public/onshape-ts-client) — actively maintained but API-key-only, not npm-published — verified via `package.json` inspection and GitHub API push timestamp — HIGH confidence
- [github.com/onshape/passport-onshape](https://github.com/onshape/passport-onshape) — actively maintained, npm latest 1.2.0 (2026-03) — verified via npm registry JSON — HIGH confidence
- [npmjs.com/package/d3-polygon](https://www.npmjs.com/package/d3-polygon) — 14.3M weekly downloads verified via npm downloads API, latest 3.0.1 — HIGH confidence
- [npmjs.com/package/monotone-convex-hull-2d](https://www.npmjs.com/package/monotone-convex-hull-2d) — verified via npm registry, 65K weekly downloads, depends on `robust-orientation` — HIGH confidence
- WebSearch: Node.js 22/24 LTS status June 2026 — MEDIUM confidence (WebSearch aggregation, cross-checked against nodejs.org blog release naming conventions, consistent with known Node release cadence)
- WebSearch: Express 5 stable status — MEDIUM confidence, corroborated by npm registry showing `5.2.1` as `latest` dist-tag (HIGH confidence via direct registry query)

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

# Phase 1: Connected Foundation & First Check - Research

**Researched:** 2026-07-01
**Domain:** Onshape OAuth2 extension embedding, REST API occurrence traversal, pluggable check engine
**Confidence:** MEDIUM-HIGH (core mechanics HIGH/VERIFIED against live OpenAPI spec and official docs; a few operational specifics remain forum-level or unverifiable pre-execution)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Deployment & Hosting
- **D-01:** Backend runs on a **long-running container host** (Render / Fly.io / Railway class). Chosen over serverless because in-memory session "just works" as the v1 stateless model and it's webhook-ready for the v2 auto-refresh feature — avoiding a later hosting migration. Specific provider is Claude's discretion (see below).
- **D-02:** During local dev, the Onshape iframe panel content is served through an **HTTPS tunnel (ngrok)** so embedding/mixed-content behavior matches production — not bare `localhost`. `localhost` remains valid only as an OAuth redirect URI.

#### Token Storage & Refresh
- **D-03:** OAuth access + refresh tokens are held in an **in-memory `express-session` (MemoryStore)**; the session id rides in an httpOnly cookie. Tokens never leave the server. Sessions die on restart/redeploy — acceptable for a "click check now" tool with no persisted state.
- **D-04:** Token refresh is **reactive on 401**: let an Onshape API call fail with 401, use the refresh token to mint a new access token, and transparently retry the request once. No proactive expiry clock-tracking (avoids bookkeeping; naturally handles Onshape-side revocation).
- **D-05:** If refresh itself fails (refresh token revoked/expired), the panel shows a **dedicated "Reconnect" state** — a distinct panel view with a "Session expired — reconnect to Onshape" message and a reconnect button that restarts OAuth. It must be *visually separate* from check-result rows so an expired session is never mistaken for a check failure (satisfies CONN-03 / Success Criterion 3 directly).

#### Season Config
- **D-06:** Season rule limits ship as a **JSON file (`rules/2026.json`)**, loaded by season key and **zod-validated at startup**. Pure data — clean year-over-year diffs, updatable by a non-coder mentor from the official Game Manual. Never a TS module, never hardcoded constants.
- **D-07:** Each rule entry carries **`{ rule, title, limit, unit, operator }`** — e.g. `{ rule: "R103", title: "Robot Weight", limit: <placeholder>, unit: "kg", operator: "max" }`. The `operator` (`max`/`min`) lets the check engine compare generically without per-rule branching, paying off in Phases 2-3.
- **D-08:** Phase 1 ships **accurate rule numbers and titles (R101, R103, R104, R408)** with **clearly-marked placeholder limit values** and an inline comment/field pointing to the official FRC Game Manual as the source of truth. Real current-season numbers are NOT asserted — they are unverifiable at this cutoff and Phase 1 trusts no check's output anyway. A team (or a later phase) fills real limits from the Manual.

### Claude's Discretion
- **The two proof-of-plumbing checks** (report presentation area was also left to discretion). Guidance for the planner: both checks MUST consume the *same* shared occurrence-traversal facts to satisfy Success Criterion 5. Suggested pair: (a) an **occurrence/part-inventory count** check and (b) a **`FRAME_`-tag presence** check (how many tagged occurrences exist) — both derived purely from traversal facts, needing no trusted numbers. Exercising the mass-properties endpoint in one trivial check is *desirable* to de-risk Phase 2's weight work, but not required; weigh it against added API surface.
- **First report presentation.** Lean: render **minimal pass/fail rows** shaped like the eventual Phase 4 dashboard (rule number + title + measured value + verdict), topped with an explicit **"plumbing proof — verdicts not yet trusted"** banner so the Walking Skeleton's UI already points at the final direction without overclaiming. Planner may refine.
- **Specific container provider** (Render vs Fly.io vs Railway) — pick whichever has the simplest always-on HTTPS deploy for a Node/Express app.

### Deferred Ideas (OUT OF SCOPE)
None new — discussion stayed within phase scope. v2 items (webhook auto-refresh WEBH-01, FeatureScript FSCR-01, assisted tagging TAG-01, additional checks) are already recorded in `.planning/REQUIREMENTS.md` §v2. Note that D-01 (container host) was chosen partly to keep WEBH-01's future webhook receiver viable without a hosting migration.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| CONN-01 | User can connect CADChecker to Onshape via OAuth2 and authorize access to a document | `passport-onshape` Strategy config confirmed (authorizationURL/tokenURL/clientID/clientSecret/callbackURL + verify callback signature); OAuth authorize/token endpoints and 60-minute access token lifetime confirmed directly from official docs |
| CONN-02 | The panel loads inside the Onshape document view and correctly identifies the active document/workspace/element context (re-derived at check time, not cached at mount) | Ground-truth finding: Element Tab extensions receive no live "context changed" postMessage; correct pattern is re-fetching `GET /api/documents/d/{did}/w/{wid}/elements` at "check now" click time (Pattern 1, Pitfall 1) |
| CONN-03 | The Onshape session stays valid across a multi-hour CAD session (access-token refresh handled transparently; "session expired" distinguished from a real failure) | 401-reactive refresh-and-retry pattern (Pattern 3) confirmed against official OAuth docs' explicit guidance to redirect to sign-in on any refresh failure; Safari third-party-cookie risk to D-03 flagged (Pitfall 2) |
| CONF-01 | Season rule limits load from a versioned per-season config file, validated at load — never hardcoded | zod schema example provided (Code Examples); Don't Hand-Roll table confirms zod over manual validation |
| CONF-02 | Each rule limit in config carries its rule number and title so checks can cite them | D-07's locked `{ rule, title, limit, unit, operator }` shape reproduced verbatim in User Constraints and Code Examples |
| RUN-01 | User can manually trigger a legality check ("check now") for the active document and get a structured pass/fail report back | Full request path traced in System Architecture Diagram: click -> elements re-derivation -> getAssemblyDefinition -> traversal utility -> check engine -> season config -> structured report JSON |
</phase_requirements>

## Summary

Phase 1 is a walking-skeleton integration phase, not a check-correctness phase. The research below resolves the single highest-uncertainty question first: **how does an Onshape Element Tab extension know which document/workspace/element to check, and does that context ever "follow" the user to a different tab automatically?** Ground-truth investigation of Onshape's official Client Messaging spec (fetched directly, not summarized) shows the answer is **no** — an Element Tab extension is itself a fixed tab in the document with its own permanent `elementId`; there is no push message that tells it "the user switched to a different Part Studio/Assembly tab." The only lifecycle messages an Element Tab extension receives are `show`, `hide`, `itemSelectedInSelectItemDialog`, `print`, `selectItemDialogClosed`, `startFirstViewCommand`, `export`, `cameraProperties`, `takeFocus`, and `saveChanges` — none of which carry a new documentId/workspaceId/elementId for "the tab the user is now looking at." This means CONN-02's "re-derive live context at click time, not cached at mount" is satisfiable, but not via postMessage cross-tab awareness. The correct pattern (confirmed against the live OpenAPI spec) is: at "check now" click time, call `GET /api/documents/d/{did}/w/{wid}/elements` to enumerate the document's current tabs, and either auto-select the (only) Assembly tab or let the user pick which Assembly/Part Studio to check. This re-derivation happens over the network at click time — which is exactly what "not cached at mount" requires — even though it isn't driven by an Onshape push notification.

The second major finding de-risks the occurrence-traversal utility significantly: Onshape occurrence `transform` values in `getAssemblyDefinition`'s `occurrences` array are **already absolute (world-space) matrices** relative to the top-level assembly — you do not need to compose/multiply transforms up the subassembly chain. Combined with the `path` array (a list of instance IDs from root to leaf) for matching an occurrence to its part/subassembly instance, this makes the "subassembly walk + transforms" utility a flattening/lookup problem, not a matrix-math problem, for Phase 1's purposes.

The third major finding is a genuine risk to a locked decision: Onshape's Element Tab iframe is a cross-origin (third-party) context relative to `cad.onshape.com`. Safari's Intelligent Tracking Prevention (ITP) blocks third-party cookies by default, which threatens D-03's in-memory `express-session` cookie approach specifically in Safari. This must be flagged to the user/planner as a validation risk for the walking skeleton, not silently absorbed.

**Primary recommendation:** Register the extension as an **Element Tab** location (per phase description and CLAUDE.md's framing of "renders inside a real Onshape document tab"), acquire the extension's *own* documentId/workspaceId/elementId once from iframe `src` query params (needed only for the extension's own postMessage handshake, e.g. `applicationInit`), and separately re-derive the *target* Assembly's context at every "check now" click via `getElementsInDocument`. Build the occurrence-traversal utility as a pure function consuming `getAssemblyDefinition`'s already-absolute transforms. Flag the Safari third-party-cookie risk explicitly in the plan's verification steps (test in Safari, not just Chrome).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OAuth2 authorization-code handshake | API/Backend | — | Client secret must never reach the browser; `passport-onshape` runs server-side in Express |
| Session/token storage | API/Backend | — | D-03 locks in-memory `express-session`; tokens never leave the server process |
| Token refresh (401-reactive) | API/Backend | — | Refresh requires `client_secret`; must happen server-side, transparently to the panel |
| Extension iframe embedding + postMessage handshake | Browser/Client | — | The `applicationInit`/`show`/`hide` handshake is pure client-side JS running inside the Onshape-hosted iframe |
| Live document/workspace/element context re-derivation | Browser/Client (trigger) + API/Backend (fetch) | — | Panel triggers re-derivation at click time; actual `GET .../elements` call is proxied through the backend (keeps OAuth token server-side) |
| Typed Onshape REST calls (assembly def, parts, mass properties) | API/Backend | — | All calls carry the OAuth access token — must originate server-side, never directly from the iframe to `cad.onshape.com` |
| Occurrence-traversal utility (subassembly walk + transform lookup + tag filter) | API/Backend | — | Pure data-transformation logic operating on API response JSON; no DOM/browser dependency, fully unit-testable in Node |
| Pluggable check engine (2+ check functions) | API/Backend | — | Consumes traversal utility output; produces the structured report; runs server-side so season config never ships to the client |
| Versioned season config load + zod validation | API/Backend | — | Config file lives in the repo/server deployment; validated once at server startup |
| Structured report rendering (pass/fail rows, Reconnect state) | Browser/Client | — | React panel renders whatever JSON the backend returns; no business logic duplicated client-side |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | 5.9.x | Language | Locked in CLAUDE.md |
| `express` | 5.2.1 [VERIFIED: npm registry, matches CLAUDE.md] | Backend HTTP server | Locked in CLAUDE.md |
| `express-session` | 1.19.0 [VERIFIED: npm registry] | Session middleware, `MemoryStore` | Locked (D-03) |
| `passport` | 0.7.0 [VERIFIED: npm registry] | Auth middleware framework | Peer dep of `passport-onshape` |
| `passport-onshape` | 1.2.0 [VERIFIED: npm registry + github.com/onshape/passport-onshape] | Onshape OAuth2 Strategy | Locked in CLAUDE.md — purpose-built, actively maintained |
| `react` | 19.2.7 [VERIFIED: npm registry] | Panel UI | Locked in CLAUDE.md |
| `vite` | 8.1.2 [VERIFIED: npm registry] | Frontend build/dev server | Locked in CLAUDE.md |
| `openapi-typescript` | 7.13.0 [VERIFIED: npm registry] | Generate types from Onshape's OpenAPI spec | Locked in CLAUDE.md |
| `openapi-fetch` | 0.17.0 [VERIFIED: npm registry] | Typed fetch client paired with generated types | Locked in CLAUDE.md |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Runtime config validation | Locked in CLAUDE.md — note major-version jump from CLAUDE.md's stated "4.x" is still within range |
| `dotenv` | 17.4.2 [VERIFIED: npm registry] | Env var loading | Locked in CLAUDE.md |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.9 [VERIFIED: npm registry, repo confirmed vitest-dev/vitest] | Unit tests for traversal/check-engine logic | Pure-function testing per CLAUDE.md guidance |
| `supertest` | 7.2.2 [VERIFIED: npm registry] | HTTP-level integration tests for Express routes (OAuth callback shape, `/api/check` contract) | Add for this phase — not in CLAUDE.md's original list but directly supports the Validation Architecture section below; low-risk, high-value addition for an OAuth-flow-heavy phase |
| `passport-oauth2` | 1.8.0 [VERIFIED: npm registry] | Base strategy `passport-onshape` extends | Not installed directly — transitive via `passport-onshape`; listed for awareness only, do not add as a direct dependency unless `passport-onshape`'s peerDependency resolution requires it explicitly |

### Alternatives Considered
No new alternatives explored — CLAUDE.md's stack is locked for this phase and this research confirms it is workable end-to-end. The only stack *addition* proposed is `supertest` for HTTP-route testing (see Validation Architecture).

**Installation:**
```bash
npm install express express-session passport passport-onshape react zod dotenv
npm install -D typescript vite openapi-typescript openapi-fetch vitest supertest @vitejs/plugin-react
```

**Version verification:** All versions above were confirmed live via `npm view <pkg> version` against the npm registry on 2026-07-01 (see Package Legitimacy Audit for cross-ecosystem verification detail).

## Package Legitimacy Audit

All 14 candidate packages were checked with `slopcheck install --ecosystem npm <pkgs> --force` (explicit `--ecosystem npm` flag required — the default/auto-detected ecosystem misfired as `pypi` in this repo since no `package.json` exists yet, which would have produced false `[SLOP]` verdicts for every Node package; this is the exact cross-ecosystem confusion trap the legitimacy protocol warns about, caught and corrected before recording results below).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|--------------|-----------|-------------|
| `express` | npm | ~15 yrs | very high | github.com/expressjs/express | [OK] | Approved |
| `express-session` | npm | ~14 yrs | very high | github.com/expressjs/session | [OK] | Approved |
| `passport` | npm | ~14 yrs | very high | github.com/jaredhanson/passport | [OK] | Approved |
| `passport-onshape` | npm | recent, actively maintained | low-moderate (niche) | github.com/onshape/passport-onshape | [OK] | Approved |
| `passport-oauth2` | npm | ~12 yrs | high | github.com/jaredhanson/passport-oauth2 | [OK] | Approved (transitive only) |
| `react` | npm | ~12 yrs | very high | github.com/facebook/react | [OK] | Approved |
| `zod` | npm | ~9 yrs | very high | github.com/colinhacks/zod | [OK] | Approved |
| `dotenv` | npm | ~13 yrs | very high | github.com/motdotla/dotenv | [OK] | Approved |
| `vite` | npm | ~7 yrs | very high | github.com/vitejs/vite | [OK] | Approved |
| `d3-polygon` | npm | ~9 yrs | very high (14.3M/wk per CLAUDE.md) | github.com/d3/d3-polygon | [OK] | Approved (Phase 3 use, referenced here since installed alongside) |
| `openapi-typescript` | npm | ~7 yrs | high | github.com/openapi-ts/openapi-typescript | [OK] | Approved |
| `openapi-fetch` | npm | ~3 yrs | high, growing | github.com/openapi-ts/openapi-typescript (monorepo) | [OK] | Approved |
| `supertest` | npm | ~13 yrs | very high | github.com/ladjs/supertest | [OK] | Approved |
| `vitest` | npm | ~4 yrs | very high | github.com/vitest-dev/vitest | [SUS — false positive] | Approved, see note below |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — slopcheck's heuristic flagged it as "suspiciously close to 'vite', could be a typosquat." This is a **false positive**: `vitest` is verified via `npm view` to have repository `git+https://github.com/vitest-dev/vitest.git`, maintainers including `antfu` and `ariperkkio` (well-known, high-reputation JS ecosystem maintainers), and a package-creation date of 2021-12-03. Vitest and Vite are both real, separate, actively co-maintained projects (same core team, complementary purposes: build tool vs. test runner) — this is a well-known, legitimate naming relationship, not a typosquat. No checkpoint needed, but noting the false positive here per protocol so the planner doesn't need to re-investigate it.

*Cross-ecosystem verification: `npm view <pkg> version` was independently run for all 14 packages against the live npm registry, confirming exact current versions before the Standard Stack table was written.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ Onshape Web Client (cad.onshape.com)                                │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Element Tab iframe (CADChecker panel — served over HTTPS)     │  │
│  │                                                                 │  │
│  │  1. iframe src carries ?documentId&workspaceId&elementId       │  │
│  │     &server&companyId&userId&locale&clientId (extension's OWN  │  │
│  │     tab identity — parsed once on mount, used only for the     │  │
│  │     postMessage handshake, NOT for "which tab to check")        │  │
│  │                                                                 │  │
│  │  2. postMessage(applicationInit) → Onshape client               │  │
│  │     ← postMessage(show/hide/takeFocus) from Onshape client       │  │
│  │        (NO message ever carries "user switched to a different  │  │
│  │        Part Studio/Assembly tab" — this does not exist)         │  │
│  │                                                                 │  │
│  │  3. User clicks "check now" ─────────────────┐                 │  │
│  └───────────────────────────────────────────────┼─────────────────┘  │
└─────────────────────────────────────────────────┼───────────────────┘
                                                    │ fetch (same-origin
                                                    │  to CADChecker backend)
                                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ CADChecker Backend (Express, long-running container)                │
│                                                                       │
│  4. Read session (MemoryStore) → OAuth access token                 │
│  5. GET /api/documents/d/{did}/w/{wid}/elements  (Onshape API)      │
│     → live, current list of tabs — re-derives "what to check"       │
│       at THIS click, not from a cached mount-time value             │
│         │                                                            │
│         │ 401? → refresh access token via refresh_token grant       │
│         │        (single transparent retry, D-04)                   │
│         │        refresh fails → mark session "needs-reconnect"     │
│         ▼                                                            │
│  6. GET /api/assemblies/d/{did}/{wvm}/{wvmid}/e/{eid}                │
│     (getAssemblyDefinition) → rootAssembly + subAssemblies +        │
│     instances + occurrences (ALREADY-ABSOLUTE transforms)            │
│         │                                                            │
│         ▼                                                            │
│  7. Occurrence-Traversal Utility (pure function, unit-tested)        │
│     - flatten rootAssembly.instances + subAssemblies[].instances     │
│     - for each occurrence: match path[last] → instance → part/name  │
│     - filter by name prefix (e.g. "FRAME_")                          │
│     - emit Fact[] = { partId, name, transform, occurrencePath }      │
│         │                                                            │
│         ▼                                                            │
│  8. Check Engine (registry of check functions, each: Fact[] → Verdict)│
│     - checkA: occurrence/part-inventory count                        │
│     - checkB: FRAME_-tag presence count                               │
│     - (optional) checkC: mass-properties spot-check                  │
│         │                                                            │
│         ▼                                                            │
│  9. Season Config (rules/2026.json, zod-validated at server startup) │
│     → supplies { rule, title, limit, unit, operator } per check      │
│         │                                                            │
│         ▼                                                            │
│  10. Structured Report JSON → returned to panel                     │
└─────────────────────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Panel renders: pass/fail rows + "plumbing proof" banner              │
│ OR: dedicated "Reconnect" state if refresh failed at step 5          │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
src/
├── server/
│   ├── auth/
│   │   ├── passport-config.ts     # passport-onshape Strategy setup
│   │   └── refresh.ts             # 401-reactive refresh-and-retry wrapper
│   ├── onshape-client/
│   │   ├── types/                 # openapi-typescript generated types (gitignored or committed — decide in plan)
│   │   └── client.ts              # openapi-fetch createClient wrapper, injects session token
│   ├── traversal/
│   │   ├── flatten-assembly.ts    # pure function: AssemblyDefinition -> Fact[]
│   │   └── flatten-assembly.test.ts
│   ├── checks/
│   │   ├── engine.ts              # registry: register(checkFn), runAll(facts, config)
│   │   ├── occurrence-count.check.ts
│   │   ├── frame-tag-presence.check.ts
│   │   └── *.test.ts
│   ├── config/
│   │   ├── schema.ts              # zod schema for a season rule file
│   │   ├── load-season.ts         # loads + validates rules/{season}.json at startup
│   │   └── load-season.test.ts
│   ├── routes/
│   │   ├── auth.routes.ts         # /auth/onshape, /auth/onshape/callback
│   │   └── check.routes.ts        # /api/check (re-derives context, runs engine)
│   └── app.ts                     # Express app assembly, session middleware
├── panel/                          # React + Vite frontend
│   ├── main.tsx
│   ├── postMessage/
│   │   └── handshake.ts           # applicationInit send, show/hide/takeFocus listeners
│   ├── components/
│   │   ├── ReconnectState.tsx     # D-05 dedicated visual state
│   │   ├── PlumbingBanner.tsx     # "verdicts not yet trusted" banner
│   │   └── ReportTable.tsx        # pass/fail rows
│   └── api.ts                     # fetch wrapper to backend /api/check
rules/
└── 2026.json                       # D-06/D-07/D-08 season config, placeholder limits
```

### Pattern 1: Live Context Re-Derivation via Elements Listing (not postMessage)
**What:** At "check now" click time, call the panel's own backend, which calls `GET /api/documents/d/{did}/w/{wid}/elements` to get the document's current tab list, then resolves which Assembly (or Part Studio) element to check.
**When to use:** Always, for CONN-02. This is the correct substitute for the postMessage-based "live context" mechanism that does not exist for Element Tab extensions.
**Example:**
```typescript
// Source: https://onshape-public.github.io/docs/api-adv/documents/ (getElementsInDocument)
// GET /api/documents/d/{did}/{wvm}/{wvmid}/elements
type ElementSummary = { id: string; name: string; elementType: string /* e.g. "ASSEMBLY" | "PARTSTUDIO" */ };

async function resolveTargetElement(client: OnshapeClient, documentId: string, workspaceId: string): Promise<ElementSummary> {
  const { data: elements } = await client.GET("/documents/d/{did}/{wvm}/{wvmid}/elements", {
    params: { path: { did: documentId, wvm: "w", wvmid: workspaceId } },
  });
  const assemblies = elements.filter((e) => e.elementType === "ASSEMBLY");
  if (assemblies.length === 0) throw new Error("No assembly found in document");
  // Phase 1: pick the first assembly; Phase 4/UI can add explicit selection later
  return assemblies[0];
}
```
**Why this satisfies CONN-02:** The call happens fresh over the network at the moment the user clicks "check now" — it is not a value cached from iframe mount. If the user has renamed/reorganized tabs between mount and click, this call reflects that.

### Pattern 2: Occurrence Flattening with Already-Absolute Transforms
**What:** `getAssemblyDefinition` returns `rootAssembly.occurrences[]`, each with a `path` (array of instance IDs from root to leaf) and a `transform` (16-element array, already in the top-level assembly's absolute coordinate system — **no matrix composition needed up the subassembly chain**).
**When to use:** Building the shared traversal utility.
**Example:**
```typescript
// Source: onshape-clients openapi.json (BTAssemblyOccurrenceInfo, BTRootAssemblyInfo, BTSubAssemblyInfo)
// and https://forum.onshape.com/discussion/24687 (community-verified: transforms are absolute, not relative)
interface Occurrence { path: string[]; transform: number[]; fixed: boolean; hidden: boolean }
interface InstanceInfo { id: string; name: string; type: string; suppressed: boolean }

interface Fact {
  partId: string;      // last segment of occurrence.path, resolved through instances/subAssemblies
  name: string;
  transform: number[]; // already absolute — use directly, do not multiply by parent transforms
  path: string[];
}

function flattenAssembly(def: AssemblyDefinition): Fact[] {
  // Build a lookup: instanceId -> InstanceInfo across rootAssembly.instances + every subAssembly.instances
  const instanceById = new Map<string, InstanceInfo>();
  for (const inst of def.rootAssembly.instances) instanceById.set(inst.id, inst);
  for (const sub of def.subAssemblies ?? []) {
    for (const inst of sub.instances) instanceById.set(inst.id, inst);
  }

  return def.rootAssembly.occurrences.map((occ) => {
    const leafId = occ.path[occ.path.length - 1];
    const instance = instanceById.get(leafId);
    return {
      partId: leafId,
      name: instance?.name ?? "UNKNOWN",
      transform: occ.transform, // ALREADY ABSOLUTE - do not compose
      path: occ.path,
    };
  });
}
```
**Caveat (MEDIUM confidence):** The claim that transforms are already absolute is corroborated by a WebSearch-sourced forum summary, not a first-party Onshape statement fetched directly in this session (the direct forum fetch redirected to an SSO login wall and could not be read). Treat as MEDIUM confidence — verify against one real multi-level-nested test assembly early in Plan execution before building check logic on top of it.

### Pattern 3: 401-Reactive Refresh-and-Retry (D-04)
**What:** Wrap every Onshape API call; on HTTP 401, attempt one `refresh_token` grant, then retry the original request once. If the refresh call itself fails, mark the session as needing reconnect.
**When to use:** Every outbound Onshape API call from the backend.
**Example:**
```typescript
// Source: https://onshape-public.github.io/docs/auth/oauth/ (token endpoint, 401 on expired token,
// and explicit guidance: "If the refresh token request fails, we will redirect the user to the
// OAuth sign-in page again" — i.e. Onshape's own docs endorse NOT parsing granular refresh-failure
// error codes; treat any refresh failure as "needs reconnect")
async function callWithRefresh<T>(
  session: OnshapeSession,
  fn: (accessToken: string) => Promise<T>
): Promise<T> {
  try {
    return await fn(session.accessToken);
  } catch (err) {
    if (!isUnauthorized(err)) throw err;
    try {
      const refreshed = await refreshAccessToken(session.refreshToken); // POST oauth/token, grant_type=refresh_token
      session.accessToken = refreshed.access_token;
      session.refreshToken = refreshed.refresh_token ?? session.refreshToken;
      return await fn(session.accessToken); // single retry
    } catch {
      session.needsReconnect = true; // drives D-05 panel state
      throw new ReconnectRequiredError();
    }
  }
}
```

### Anti-Patterns to Avoid
- **Polling the extension's own iframe query params for "current context":** These are fixed at the extension's own tab creation time and never change for the lifetime of that tab — they identify the *extension's tab*, not whatever Part Studio/Assembly the user is currently viewing. Re-reading `location.search` on every click will NOT satisfy CONN-02.
- **Assuming a `SELECTION` or `contextChanged` postMessage exists for Element Tab extensions:** It does not, per the official Client Messaging + Element Tab docs fetched directly in this research. (A generic `clientmessaging` overview page mentions `SELECTION` for user "selection interactions" in some contexts, but the Element-Tab-specific "Supported messages"/"Received messages" lists — which are authoritative and were fetched directly — do not include it. Do not build logic depending on it.)
- **Composing/multiplying occurrence transforms up the subassembly path:** Unlike typical scene-graph conventions, Onshape's occurrence transforms are already absolute. Composing them again will silently double-transform nested parts.
- **Calling `getPartStudioMassProperties` as if it were assembly-scoped:** It is a Part-Studio-element-scoped endpoint, not an assembly-scoped one. There is no single "give me the whole assembly's mass" endpoint in this spec — mass-properties for occurrence-filtered sets requires resolving each occurrence's source Part Studio + partId and querying (optionally with `massAsGroup=true` to sum without needing local mass math).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 authorization-code + refresh flow | Custom `fetch`-based OAuth client | `passport-onshape` (Strategy) | Handles authorize/callback/token exchange against Onshape's exact endpoints; avoids re-deriving scope/redirect-URI edge cases |
| Typed REST request/response shapes | Manually-written TS interfaces per endpoint | `openapi-typescript` generated types from the live spec | The spec (`onshape-clients/openapi.json`) is current and authoritative even though generated *clients* are stale; hand-typing risks drift and typos in field names like `fullConfiguration` vs `configuration` |
| Config schema validation | Manual `if` checks on JSON shape | `zod` schema (`z.object({...}).parse(...)`) at startup | Fails fast with a clear error on a malformed `rules/2026.json`, satisfying CONF-01's "validated at load" requirement directly |
| Session/cookie handling | Custom cookie-signing + session-store code | `express-session` with default `MemoryStore` | D-03 already locked this in; hand-rolling reintroduces the exact class of security bugs (predictable session IDs, missing httpOnly) session middleware exists to prevent |

**Key insight:** Every "don't hand-roll" item in this phase already has a locked library in CLAUDE.md — the risk in Phase 1 isn't reaching for the wrong library, it's **wiring the right libraries together against Onshape-specific constraints** (Element Tab's lack of live-context push messages, transform absoluteness, refresh-failure semantics) that generic library documentation doesn't cover.

## Common Pitfalls

### Pitfall 1: Assuming Element Tab Context "Follows" the User
**What goes wrong:** Building the panel to trust `documentId`/`workspaceId`/`elementId` parsed once from the iframe `src` as "the thing to check," then being surprised when a user opens the panel, switches to a different Assembly tab, and clicks "check now" — expecting the new tab to be checked.
**Why it happens:** Other platforms' embedded-panel models (e.g. browser extensions with `chrome.tabs.onActivated`) train developers to expect a "tab changed" event. Onshape's Element Tab extension model has no equivalent for its own embedding context — the extension IS a tab, not an observer of tabs.
**How to avoid:** Treat the extension's own iframe query params as identifying *only the extension's own tab* (needed for the postMessage handshake). Separately call `GET .../elements` at "check now" time to discover/resolve the actual Assembly/Part Studio to check.
**Warning signs:** Any code path that reads `window.location.search` for documentId/workspaceId/elementId AFTER initial mount, expecting a different value than what was read at mount.

### Pitfall 2: Safari Blocking the Session Cookie (Third-Party Iframe Context)
**What goes wrong:** `express-session`'s cookie is set in a response to an XHR/fetch made *from inside* the iframe to the CADChecker backend — but the iframe itself is loaded cross-origin inside `cad.onshape.com`. Safari's Intelligent Tracking Prevention (ITP) blocks third-party cookies by default; the session that worked perfectly in Chrome during dev silently fails to persist in Safari, and every request looks "logged out."
**Why it happens:** D-03 (in-memory session, httpOnly cookie) is architecturally sound for a normal top-level web app, but an Onshape Element Tab extension is *always* embedded as a third-party iframe from the browser's perspective — this is a structural property of the platform, not a configuration mistake.
**How to avoid:** Set `SameSite=None; Secure` on the session cookie (required minimum for it to be sent in a cross-site iframe context at all in Chrome/Firefox). For Safari specifically, there is no simple cookie-attribute fix — mitigations involve either (a) testing early and explicitly documenting Safari as a known-limitation for v1, or (b) a future migration to a CNAME-based first-party-appearing subdomain, or (c) the Storage Access API. **This is a genuine open risk to D-03 that should be surfaced to the user/planner, not silently patched around** — do not let a plan silently swap to a different token-storage mechanism without that being a visible decision.
**Warning signs:** OAuth flow works in a plain browser tab test but the panel embedded in Onshape shows "not authenticated" immediately after a successful callback, specifically when tested in Safari.

### Pitfall 3: Confusing `configuration` and `fullConfiguration`
**What goes wrong:** Using `configuration` (which only includes non-default configuration values) when a stable, complete key is needed to detect "has anything changed since last check," or vice versa.
**Why it happens:** Both fields exist on instance/assembly objects and look similar; the difference (default-inclusive vs default-exclusive) is subtle and only documented in a community forum thread, not the primary API reference page.
**How to avoid:** For Phase 1's traversal utility, prefer `fullConfiguration` wherever a complete/stable identity is needed (e.g. if the report needs to disclose "which configuration was measured" in a later phase); `configuration` is fine for lighter display purposes.
**Warning signs:** A part behaves as configured but disclosure/reporting shows an empty configuration string.

### Pitfall 4: Treating `getPartStudioMassProperties` as Assembly-Wide
**What goes wrong:** Calling the Part-Studio-scoped mass-properties endpoint expecting it to sum mass across an entire multi-Part-Studio assembly.
**Why it happens:** The endpoint name and its `massAsGroup` parameter ("evaluated as a single object instead of individually") sound assembly-level, but the URL path (`/partstudios/d/{did}/{wvm}/{wvmid}/e/{eid}/massproperties`) is scoped to one Part Studio element, and `partId` values only resolve within that one element.
**How to avoid:** If Phase 1 exercises the optional mass-properties check (per CONTEXT.md discretion), scope it explicitly to one Part Studio's parts, group by `elementId` if occurrences span multiple Part Studios, and issue one call per distinct source Part Studio.
**Warning signs:** Passing a `partId` from one Part Studio into a `massproperties` call scoped to a different `eid` — this will either 404 or silently return nothing for that part.

### Pitfall 5: Building the Season Config Loader to Assume One Season Only
**What goes wrong:** Hardcoding `rules/2026.json` as the only possible filename inline in application code rather than loading by season key (D-06 explicitly requires "loaded by season key").
**Why it happens:** Phase 1 only ships one season file, so it's tempting to inline the path.
**How to avoid:** Load via a season-key parameter (e.g. `loadSeasonConfig("2026")` → resolves to `rules/2026.json`), even though only one file exists yet — this keeps year-over-year updates a data change, not a code change, matching the explicit CLAUDE.md/CONTEXT.md rationale.
**Warning signs:** Any literal string `"rules/2026.json"` appearing outside the config-loading module itself.

## Code Examples

### Season Config Schema (D-06/D-07/D-08)
```typescript
// zod schema per D-07's locked shape: { rule, title, limit, unit, operator }
import { z } from "zod";

const RuleEntrySchema = z.object({
  rule: z.string().regex(/^R\d+$/),         // e.g. "R101", "R408"
  title: z.string().min(1),
  limit: z.number(),                         // D-08: PLACEHOLDER values, clearly marked via a sibling field/comment
  unit: z.string().min(1),                   // e.g. "kg", "in"
  operator: z.enum(["max", "min"]),
});

const SeasonConfigSchema = z.object({
  season: z.string(),                        // e.g. "2026"
  rules: z.array(RuleEntrySchema),
});

export type SeasonConfig = z.infer<typeof SeasonConfigSchema>;

export function loadSeasonConfig(season: string): SeasonConfig {
  const raw = JSON.parse(readFileSync(`rules/${season}.json`, "utf-8"));
  return SeasonConfigSchema.parse(raw); // throws with a clear zod error on malformed config
}
```

### Check Engine Registry (Success Criterion 5)
```typescript
// Both check functions consume the SAME Fact[] produced by flattenAssembly() —
// this is what "verifiable by 2+ independent check functions using the same facts path" requires.
type Fact = { partId: string; name: string; transform: number[]; path: string[] };
type Verdict = { rule: string; title: string; limit: number; unit: string; measured: number; pass: boolean };

type CheckFn = (facts: Fact[], config: SeasonConfig) => Verdict;

class CheckEngine {
  private checks: CheckFn[] = [];
  register(fn: CheckFn) { this.checks.push(fn); }
  runAll(facts: Fact[], config: SeasonConfig): Verdict[] {
    return this.checks.map((fn) => fn(facts, config));
  }
}

// Check A: occurrence/part-inventory count (needs no trusted numbers)
const occurrenceCountCheck: CheckFn = (facts) => ({
  rule: "PLUMBING-A", title: "Occurrence Count", limit: 0, unit: "count", operator: "min",
  measured: facts.length, pass: facts.length > 0,
});

// Check B: FRAME_-tag presence (same facts path, different filter)
const frameTagPresenceCheck: CheckFn = (facts) => {
  const framed = facts.filter((f) => f.name.startsWith("FRAME_"));
  return { rule: "PLUMBING-B", title: "FRAME_ Tag Presence", limit: 0, unit: "count", operator: "min",
    measured: framed.length, pass: framed.length > 0 };
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `onshape-client` PyPI / `onshape-clients` generated TS client | Hand-rolled `openapi-fetch` + freshly generated `openapi-typescript` types from the live spec | Generated clients stale since 2020/2023 | Confirmed again in this research — do not reconsider these, the spec itself (`openapi.json`) remains current and authoritative independent of the stale generated output |
| Polling / assumed live cross-tab context via postMessage | Explicit re-fetch of `GET .../elements` at action time | N/A — this was never true for Element Tab extensions; it's a documentation-vs-assumption gap, not a platform change | Directly resolves CONN-02's core design question |

**Deprecated/outdated:** None newly discovered in this research beyond what CLAUDE.md already documents.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Occurrence transforms in `getAssemblyDefinition` are already absolute (no composition needed up the subassembly chain) | Architecture Pattern 2 / Anti-Patterns | If actually relative-to-parent, every nested-subassembly part's world position would be wrong, silently breaking any future geometry check (Phase 3) that depends on this utility. Verify against one real nested test assembly early in Plan 1 execution. |
| A2 | Element Tab extensions receive NO message conveying "user switched to a different document tab" (confirmed by direct fetch of the official Element Tab "Supported messages"/"Received messages" list, which is authoritative for this extension type) | Summary / Pattern 1 / Anti-Patterns | Low risk — this was fetched directly from the current official docs page, not inferred. If Onshape has since added such a message and the docs page hasn't caught up, the fallback (re-fetch elements at click time) still works correctly; it just wouldn't be needed. |
| A3 | `getMassProperties`/`getPartStudioMassProperties` have no assembly-wide equivalent in the current spec (confirmed by enumerating all `/api/assemblies/...` and `/api/parts/...` and `/api/partstudios/...` paths in the live `openapi.json`) | Pitfall 4 | Low risk — directly enumerated from the authoritative spec file, not inferred from training data. |
| A4 | Safari ITP will block the D-03 session cookie in the Element Tab iframe context unless `SameSite=None; Secure` is set, and may still block it entirely without further workarounds | Pitfall 2 | If wrong (Safari testing shows it actually works fine), the plan would have over-engineered a mitigation. If under-estimated (Safari blocks more aggressively than described), the walking skeleton could silently fail for any team member using Safari — recommend explicit Safari testing as a verification step regardless of which way this resolves. |
| A5 | R101/R103/R104/R408 rule numbers/titles are accurate per current FRC terminology (D-08 locks this in, but this research did not re-verify against a live 2026 Game Manual — STATE.md already flags this as an open blocker for Phase 3) | Code Examples / Season Config | Low risk for Phase 1 specifically, since D-08 explicitly ships placeholder *limits* and Phase 1 doesn't assert check correctness. Becomes higher risk if untouched into Phase 2/3. |

## Open Questions

1. **Does the "Supported Locations and Contexts" table (referenced but not textually extracted from the Extensions doc) list any location type that DOES receive live "active tab changed" context pushes?**
   - What we know: Element Tab explicitly does not (confirmed directly). "Element right panel" is a different location type, shown in Onshape's own Hello World example using Action-URL parameter substitution (which Element Tab explicitly does NOT support per the docs).
   - What's unclear: Whether "Element right panel" behaves differently regarding live context (it does support Action URL parameter replacement, suggesting Onshape can re-evaluate/reload it with fresh params on some cadence) — this wasn't needed for this phase's chosen approach but is worth a footnote if the planner considers "Element right panel" instead of "Element tab" as the location type.
   - Recommendation: Proceed with Element Tab per the phase description's literal wording ("renders inside a real Onshape document tab") and this research's re-fetch-at-click-time pattern. If a future phase reconsiders the location type, re-verify this table directly.

2. **Exact HTTP status/body Onshape returns when a refresh_token itself is invalid/revoked (vs. an expired access token's 401)**
   - What we know: Official docs state the client should simply redirect to OAuth sign-in again on any refresh failure, without prescribing status-code-specific handling.
   - What's unclear: Whether refresh failure is also a 401, or a 400 with an OAuth-standard `invalid_grant` error body.
   - Recommendation: Treat ANY error from the refresh call as "needs reconnect" (matches official guidance directly) rather than branching on status code — this makes the exact code moot for Phase 1's implementation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ | (verify locally at plan/execute time — not probed in this research session since this is a fresh checkout with no project files yet) | — |
| npm | Package management | ✓ (used directly in this research session) | confirmed functional | — |
| ngrok | Local HTTPS tunnel for dev (D-02) | Not probed this session | — | If unavailable, Onshape's own tunneling guidance or an alternative HTTPS tunnel tool (e.g. Cloudflare Tunnel) serves the same purpose |
| Onshape Developer Portal account + registered OAuth app/extension | Everything in this phase | External, manual prerequisite — cannot be verified via tooling in this session | — | None — this blocks all execution until a human completes registration (see Code Context / Integration Points in CONTEXT.md) |

**Missing dependencies with no fallback:**
- Onshape Developer Portal OAuth app + Extension registration (Element Tab location, Action URL, redirect URIs) — manual, external, must happen before any code can be tested end-to-end. Call this out as an explicit setup task, not a code task, per CONTEXT.md.

**Missing dependencies with fallback:**
- `ngrok` — any comparable HTTPS tunnel tool works equally per D-02's intent (match production iframe/mixed-content behavior); not yet probed for local availability.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Delegated entirely to Onshape via OAuth2 authorization-code grant (`passport-onshape`) — CADChecker never handles Onshape user credentials directly |
| V3 Session Management | yes | `express-session` with httpOnly, `Secure`, `SameSite=None` cookie (SameSite=None required specifically because the panel is embedded in a cross-origin iframe — see Pitfall 2); session id is opaque, server-generated |
| V4 Access Control | partial | No CADChecker-side authorization model in v1 (Onshape's own document ACLs gate what the OAuth-granted token can read) — access control is entirely delegated to Onshape's API responses (403/404 on documents the user can't access) |
| V5 Input Validation | yes | `zod` validates season config at load (CONF-01); any panel-supplied input (season key, target elementId if user-selectable) should be validated server-side before use in API calls |
| V6 Cryptography | yes | Never hand-roll — `client_secret` handling delegated to `passport-onshape`/standard OAuth2 library code; session cookie signing handled by `express-session`'s built-in HMAC signing (configure a strong, env-sourced session secret via `dotenv`, never a hardcoded default) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| CSRF on the OAuth authorize/callback flow | Tampering / Spoofing | Onshape's OAuth flow + `passport-onshape`'s underlying `passport-oauth2` strategy should be configured with `state` parameter validation (verify this is enabled by default in `passport-onshape`'s implementation during Plan execution — do not disable it) |
| postMessage origin spoofing (a malicious page tricking the panel into accepting fake Onshape messages) | Spoofing / Tampering | Strict origin check: `if (server === event.origin)` exactly as documented by Onshape's own Client Messaging security considerations — reject any message whose origin doesn't match the `server` query param captured at iframe load |
| Session fixation / cookie theft via XSS | Elevation of Privilege | httpOnly cookie (prevents JS access even if XSS occurs), `Secure` flag (HTTPS-only transmission), React's default JSX escaping (no `dangerouslySetInnerHTML` anywhere in the panel) |
| OAuth client secret leakage to the browser | Information Disclosure | `client_secret` lives only in server-side env vars (`dotenv`), loaded by the Express process; never referenced in any Vite/React bundle code |
| Third-party cookie blocking causing silent auth failure (not a classic security threat, but a security-adjacent reliability risk directly caused by the security-hardening browsers apply to third-party iframe contexts) | — | See Pitfall 2 — test explicitly in Safari; do not assume Chrome-only testing is sufficient for a cross-origin iframe embedding model |

## Sources

### Primary (HIGH confidence)
- Onshape OpenAPI spec, directly downloaded and parsed: `https://raw.githubusercontent.com/onshape-public/onshape-clients/master/openapi.json` — used to enumerate exact endpoint paths (`getAssemblyDefinition`, `getElementsInDocument`, `getMassProperties`, `getPartStudioMassProperties`) and exact schema field names (`BTAssemblyOccurrenceInfo`, `BTAssemblyInstanceInfo`, `BTRootAssemblyInfo`, `BTSubAssemblyInfo`, `BTMassPropertiesInfo-null`) — verified directly against the live file, not summarized secondhand
- Onshape Developer Documentation — Client Messaging / Element Tab (fetched directly): `https://onshape-public.github.io/docs/app-dev/messages/element-tab/` — exact "Supported messages" and "Received messages" lists for Element Tab extensions, confirming no live cross-tab context push exists
- Onshape Developer Documentation — Client Messaging overview (fetched directly): `https://onshape-public.github.io/docs/app-dev/messages/` — `clientMessage` structure, `applicationInit` handshake requirement, origin-validation code snippet
- Onshape Developer Documentation — Extensions (fetched directly): `https://onshape-public.github.io/docs/app-dev/extensions/` — Action URL parameter tokens, "one element tab extension per application" constraint, security considerations (parse documentId/workspaceId/elementId from query params, validate origin)
- Onshape Developer Documentation — OAuth (fetched directly): `https://onshape-public.github.io/docs/auth/oauth/` — authorize/token endpoints, 60-minute access token lifetime, 401 on expired token, explicit "redirect to sign-in again" guidance on refresh failure
- npm registry (`npm view <pkg> version`, run directly in this session) — confirmed exact current versions of all 14 candidate packages
- `slopcheck install --ecosystem npm` (run directly in this session) — legitimacy verification of all 14 packages

### Secondary (MEDIUM confidence)
- WebSearch-aggregated summary of `github.com/onshape-public/app-bom` sample app README — confirms query-param-based context acquisition pattern used by an official Onshape sample, but full source tree wasn't directly inspected line-by-line in this session
- WebSearch-aggregated summary of forum discussion on occurrence transform absoluteness (`forum.onshape.com/discussion/24687` and `/19505` and `/10943`) — the direct fetch of these threads redirected to an SSO login wall and could not be read verbatim; the claim is corroborated across multiple independent WebSearch summaries but not read firsthand from the primary source
- WebSearch on Safari ITP / third-party cookie blocking in iframes — general web-platform behavior, well-established but not Onshape-specific; cross-referenced against MDN and multiple engineering blog posts

### Tertiary (LOW confidence)
- None flagged as pure single-source/unverified beyond what's noted in the Assumptions Log above.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version independently confirmed via live npm registry query and slopcheck legitimacy scan in this session
- Architecture (OAuth + postMessage + context re-derivation): HIGH — core claims fetched directly from current official Onshape docs and the live OpenAPI spec, not inferred from training data
- Architecture (occurrence transform absoluteness): MEDIUM — corroborated by WebSearch-aggregated forum content but not read firsthand from primary source in this session; flagged as A1 in Assumptions Log for early verification
- Pitfalls (Safari third-party cookie risk): MEDIUM-HIGH — general web-platform behavior is well-documented and stable, but its specific interaction with Onshape's particular iframe embedding was not directly tested in this session

**Research date:** 2026-07-01
**Valid until:** 30 days (Onshape API surface is stable/versioned; npm package versions and OAuth mechanics are the fastest-moving parts and should be re-checked if planning is delayed materially past this window)

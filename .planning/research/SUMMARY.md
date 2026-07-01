# Project Research Summary

**Project:** CADChecker — FRC Robot Legality Checker for Onshape
**Domain:** Onshape OAuth Extension (document-panel web app) with REST API integration and 2D computational geometry
**Researched:** 2026-06-30
**Confidence:** HIGH

## Executive Summary

CADChecker is an Onshape OAuth Extension that surfaces FRC robot-legality violations (frame perimeter, weight, starting height) directly inside a team's CAD document, before they ever reach in-person inspection. No dedicated product like this exists in the FRC ecosystem today — teams currently self-check with manual spreadsheets and eyeballed bounding boxes. The addressable rule surface from CAD alone is narrow by nature (only R1xx dimensional/mass rules and a subset of R4xx bumper geometry are geometrically inferable at all), and that narrowness is a deliberate, defensible scope boundary rather than a shortcoming — attempting electrical, motor, pneumatic, or safety checks would produce unverifiable, trust-destroying "guesses."

The recommended approach: a TypeScript/Node.js (Express) backend that performs the OAuth2 authorization-code flow and all Onshape REST calls (no official, current OAuth-capable Onshape SDK exists — hand-roll a thin typed client from Onshape's OpenAPI spec instead), paired with a React/Vite panel rendered inside Onshape's iframe. Parts are tagged via a name-prefix convention (FRAME_/BUMPER_/MECH_) read through the standard Parts API — deliberately avoiding Onshape custom properties, which require admin tiers many FRC teams lack. v1 is fully stateless: Onshape is the source of truth for geometry/tags, rule limits ship as versioned per-season config, and OAuth tokens live only in a server session.

The dominant risk category is silent-but-plausible wrongness, not crashes: Onshape's mass-properties calculation silently omits parts with no material from the mass total (not zero-fills them), naive assembly-level mass queries conflate bumper/battery-included and -excluded weight, a 3D convex hull instead of a floor-projected 2D hull will subtly misstate frame perimeter, and "starting configuration" is not automatically the currently-open CAD tab. Every one of these produces a confidently wrong pass/fail rather than an error, which for a legality tool is worse than no tool at all — mitigation (gating weight verdicts on a material audit, explicit occurrence-filtered queries, 2D-projection-before-hull, and disclosing which configuration was measured) must be built into Phase 1, not retrofitted.

## Key Findings

### Recommended Stack

TypeScript across the whole stack (Node 22 LTS + Express 5 backend, React 19 + Vite 8 panel) is recommended because there is no maintained, OAuth-capable official Onshape API client in any language — the generated clients are 5+ years stale. Instead, generate typed request/response shapes directly from Onshape's live OpenAPI spec (openapi-typescript + openapi-fetch), use passport-onshape purely for the OAuth handshake, and hand-roll the ~6-8 REST calls this app actually needs. Frame-perimeter geometry uses d3-polygon's battle-tested 2D convex hull (polygonHull()), directly matching R101's "taut-string wrap" definition. Rule limits are validated at load with zod from versioned per-season JSON config files. No datastore in v1 — session-only OAuth token storage (in-memory on a long-running host is the simplest correct implementation; a signed cookie is the fallback if deploying serverless).

**Core technologies:**
- TypeScript + Node 22 + Express 5 — backend runtime/server; avoids SDK staleness by generating types from Onshape's OpenAPI spec instead of depending on generated clients
- React 19 + Vite 8 — panel UI rendered in Onshape's iframe; not platform-mandated, but fits a dashboard-style checklist UI well
- passport-onshape — actively maintained OAuth2 handshake strategy (auth only, not REST wrapper)
- d3-polygon — 2D convex hull for frame perimeter, zero-dependency, 14M+ weekly downloads
- zod — runtime validation of versioned season rule-limit config

### Expected Features

No existing product performs CAD-based FRC legality checking; the gap is currently closed by manual, late-cycle, error-prone spreadsheet work. The addressable rule surface is narrow: only mass/dimension rules (R101 perimeter, R103/R408 weight, R104/R107 height) and a slice of bumper geometry are CAD-inferable; electrical, motors, pneumatics, cost, and safety rules have no geometric signature and must remain permanently out of scope, not just deferred.

**Must have (table stakes) — Phase 1:**
- OAuth2 connection to a single Onshape document
- Weight check vs. season limit (R103)
- Material-default audit — gates the weight check's trustworthiness (Onshape silently zero-mass's unset-material parts)
- Frame perimeter check (R101/R104) via 2D convex hull of tagged frame parts
- Starting-configuration height check
- Pass/fail results panel citing rule numbers, with explicit "check unavailable — tags missing" states (never a silent pass)
- Versioned per-season rule-limit config

**Should have (competitive, v1.x+):**
- Robot+bumpers weight check (R408)
- Webhooks/auto-refresh (onshape.model.lifecycle.changed)
- Guided rename-assist tagging flow (heuristic-assisted, never auto-classifies without confirmation)
- Bumper extension-from-perimeter check (R403)

**Defer (v2+):**
- Extension-limit checks across configurations (R105-R108) — needs Configurations API enumeration
- Bumper coverage/gap analysis (R401/R405/R406) — segment/gap curve math
- FeatureScript custom feature — separate runtime/language, parallel surface
- Historical trend tracking — requires a datastore, conflicts with stateless v1
- Multi-document/whole-team dashboard

**Explicit anti-features:** auto-inferring "frame" from geometry heuristics alone (no substitute for tagging), attempting electrical/motor/pneumatic/software checks, treating a green dashboard as inspection-equivalent, auto-fixing violations, and using Onshape custom properties for tagging.

### Architecture Approach

The system is a two-part app: a React panel embedded via iframe inside the Onshape document view (context acquired via Action-URL query params + a mandatory postMessage keepAlive handshake), and a Node/Express backend that is the only thing holding OAuth tokens or calling Onshape's REST API. The panel calls a single orchestration endpoint (POST /api/check); the backend gathers facts (assembly definition, mass properties, part metadata) from Onshape, runs them through an independent, pluggable check-registry engine against versioned season config, and returns a structured pass/fail report. No database — Onshape holds geometry/tags, config files hold rule limits, and the session holds only the disposable OAuth token pair.

**Major components:**
1. **Auth module** — OAuth2 authorization-code exchange, session-scoped token storage, proactive refresh (tokens expire in 60 min and refresh rotates both tokens)
2. **Onshape API client** — typed wrapper around Assemblies/Parts/Metadata/MassProperties REST endpoints
3. **Geometry module** — pure, Onshape-agnostic functions: floor-plane projection of tagged frame parts to 2D convex hull to perimeter
4. **Rule-config loader** — versioned per-season JSON, validated with zod, injected as a parameter into every check (never hardcoded)
5. **Check engine** — registry of independent (facts, config) => CheckResult functions, isolates failures per-check, aggregates into a report
6. **Panel UI** — pure renderer; no direct Onshape API calls, no rule logic, zero client secrets

Recommended build order: (1) OAuth + empty panel proving iframe/context/handshake work against real Onshape UI — highest uncertainty, do first; (2) Onshape API client + facts gathering against a real tagged document; (3) rule-config loader; (4) check-engine skeleton + simplest check (weight); (5) geometry module + frame-perimeter check (highest complexity, do once plumbing is proven); (6) remaining v1 checks + panel polish. Webhooks and FeatureScript slot in later without backend rework.

### Critical Pitfalls

1. **Silent mass omission from unset materials** — Onshape excludes no-material parts from mass totals entirely (not zero-fills them); the material audit must gate the weight verdict ("UNKNOWN — N parts missing material"), never run as an independent, ignorable sibling check.
2. **Naive unfiltered assembly mass-properties calls** — the aggregate endpoint doesn't break mass down by tag; R103 (excluding bumpers/battery) and R408 (including bumpers) require two separately-filtered occurrence-scoped queries built on a single shared, tested traversal utility, not ad hoc per-check logic.
3. **3D hull instead of floor-projected 2D hull for frame perimeter** — R101 requires projecting tagged frame-part geometry onto the floor plane first, then computing the 2D hull; skipping the projection step or assuming CAD origin = floor produces a plausible-looking but wrong number. Surface the computed hull visually so teams can sanity-check it.
4. **"Starting configuration" is not "whatever tab is currently open"** — Onshape has no platform concept of "FRC starting configuration"; v1 must disclose which configuration was measured on every height/perimeter verdict rather than silently trusting the active tab.
5. **Rule number/text/terminology drift year to year** — rule IDs, names, and text must be versioned data (not hardcoded strings) per season, since FIRST has already renamed "FRAME PERIMETER" to "ROBOT PERIMETER" for 2026 while keeping the R101 number; a re-verification process is needed every Kickoff.
6. **OAuth 60-minute token expiry during multi-hour CAD sessions** — refresh-token exchange must be implemented from day one (proactive refresh at 45-50 min), with UI clearly distinguishing "session expired" from a real domain failure.
7. **Stale documentId/workspaceId/elementId cached at panel mount** — must be re-derived from the current iframe context at the moment "check now" is clicked, or the tool silently checks the wrong tab/document after in-Onshape navigation.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Onshape App Foundation (OAuth + Empty Panel)
**Rationale:** Highest-uncertainty, highest-priority-to-de-risk step per architecture research — nothing else is buildable until context acquisition (iframe embedding, OAuth handshake, postMessage keepAlive) is proven against real Onshape UI.
**Delivers:** Registered Onshape OAuth app, working authorization-code flow with refresh-token handling, an empty panel that loads inside a real document and reads documentId/workspaceId/elementId correctly (including re-derivation on each interaction, not cached at mount).
**Addresses:** "OAuth2 connection to a single Onshape document" (table stakes)
**Avoids:** Pitfall 6 (token expiry), Pitfall 7 (stale context caching)

### Phase 2: Onshape API Client + Facts Gathering
**Rationale:** Must prove real-document data retrieval (assembly definition, mass properties, tagged-part metadata) before any check logic is written; validates the "read existing name-prefix tags via Parts API" decision against a real test document.
**Delivers:** Typed Onshape REST client (generated from OpenAPI spec), a shared occurrence-traversal utility (recursive subassembly walk + transforms + tag filtering) reused by every later check.
**Uses:** openapi-typescript/openapi-fetch, hand-rolled fetch wrapper
**Implements:** Onshape API client + Geometry module's data inputs

### Phase 3: Rule-Config Loader + Check Engine Skeleton
**Rationale:** Small and low-risk but a hard prerequisite — every check signature depends on config being injected, and the registry/aggregation pattern should be validated with the simplest possible check before investing in geometry.
**Delivers:** Versioned per-season config files (zod-validated), a pluggable check-registry engine, and the first working check (total weight vs. limit) wired end-to-end from panel click to result.
**Addresses:** "Versioned per-season rule-limit config" (table stakes)
**Avoids:** Pitfall 5 (rule number/text hardcoding), Anti-Pattern (monolithic runAllChecks)

### Phase 4: Material Audit + Weight Checks (R103/R408)
**Rationale:** Material audit and weight checks must ship together per both FEATURES.md and PITFALLS.md — the audit is a precondition for a trustworthy weight number, not an independent sibling.
**Delivers:** Material-default audit (gates weight verdicts), R103 (excl. bumpers/battery) and R408 (incl. bumpers) as two distinct, separately-filtered verdicts.
**Addresses:** "Material-default audit", "Total assembly weight check" (table stakes)
**Avoids:** Pitfall 1 (silent mass omission), Pitfall 2 (unfiltered assembly mass query), Pitfall 8 (implausible-but-present material density, documented as a known limitation)

### Phase 5: Frame Perimeter + Starting-Height Checks
**Rationale:** Highest-complexity, highest-value v1 check; sequenced after plumbing (facts -> engine -> panel) is already proven with the weight check, so geometry bugs are isolated from integration bugs.
**Delivers:** Floor-plane projection + 2D convex hull (via d3-polygon) of FRAME_-tagged parts, frame perimeter check (R101/R104), starting-configuration height check, with the computed hull rendered visually for sanity-checking and explicit disclosure of which configuration was measured.
**Addresses:** "Frame perimeter check", "Starting-configuration height check" (table stakes)
**Avoids:** Pitfall 3 (3D-hull-instead-of-2D-projection), Pitfall 4 (starting-configuration ambiguity)

### Phase 6: Results Panel Polish + Rule Citations
**Rationale:** Cheap once steps 1-5 are solid; this is how users trust the tool, so it closes out the MVP rather than being cosmetic.
**Delivers:** Pass/fail results panel citing rule number + title + limit + actual value per check, explicit "not yet checkable — tags missing" states, document/tab/config/timestamp shown alongside every verdict.
**Addresses:** "Results panel listing each check as pass/fail with the cited rule number" (table stakes)
**Avoids:** UX Pitfalls (bare pass/fail with no context, silent skip on missing tags)

### Phase Ordering Rationale

- Foundation (OAuth/panel) must come first because it's the highest-uncertainty integration point — every later phase assumes context acquisition works.
- The shared occurrence-traversal utility (Phase 2) is built once and reused by both weight and perimeter checks, avoiding the divergent-logic pitfall architecture research flags.
- The simplest check (weight, Phase 4) is built before the hardest check (perimeter, Phase 5) to validate the check-engine interface with low geometry risk first.
- Material audit and weight checks are explicitly co-located in one phase because research unanimously confirms they must ship together, not staged.
- This ordering directly mirrors PROJECT.md's v1 scope and the Architecture research's "Build Order & Phase Sequencing Implications" section — no deviation needed.
- Later phases (webhooks, FeatureScript, guided tagging, extension-limit checks, bumper coverage) are correctly deferred per all four research files and require no v1 architecture rework.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Onshape API Client + Facts Gathering):** Assembly-level mass-properties response shape and recursive subassembly traversal were only confirmed via community forum threads, not raw OpenAPI spec inspection — verify exact JSON schema against a live test document before finalizing the client.
- **Phase 5 (Frame Perimeter):** Floor-plane determination and the minor-protrusion (<=1/4 in) exception have no clean API answer — needs experimentation against real team CAD to settle the "what counts as floor" heuristic and how strictly to implement the exception.

Phases with standard patterns (skip research-phase):
- **Phase 1 (OAuth Foundation):** Onshape's OAuth flow, extension embedding, and postMessage handshake are HIGH-confidence, officially documented, standard patterns.
- **Phase 3 (Rule-Config + Check Engine):** Standard versioned-config + plugin-registry patterns, no Onshape-specific uncertainty.
- **Phase 6 (Panel Polish):** Standard React dashboard UI work, no domain-specific risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (platform mechanics) / MEDIUM (client library ecosystem) | Onshape OAuth/extension docs are official and current; the "no maintained OAuth-capable SDK" finding is verified directly via GitHub/npm/PyPI metadata, but the ecosystem gap itself is a moving target worth re-checking periodically |
| Features | MEDIUM-HIGH | Rule taxonomy and Onshape API behavior (mass-properties material omission) verified via official docs and forum; exact current-season rule numbers should be re-pinned against the live 2026 Game Manual PDF at implementation time (PDF text-extraction failed in this research pass) |
| Architecture | HIGH (OAuth/extension mechanics, REST endpoints) / MEDIUM (webhook operational details, exact metadata schema) | Confirmed against official Onshape docs and cross-checked with sample apps; assembly mass-properties response schema not directly fetched from a live API Explorer call |
| Pitfalls | HIGH (Onshape API mechanics, FRC rule text) / MEDIUM (some API response-shape details) | Cross-verified via Context7/official docs, Onshape forum, and frcmanual.com; assembly mass-properties JSON fields only verified via community forum posts |

**Overall confidence:** HIGH

### Gaps to Address

- Exact 2026 Game Manual rule numbers/text were not directly extracted from the official PDF (binary parsing failed in research); do a direct text-extraction pass during Phase 3 config authoring to pin exact R-numbers, names, and limit values before shipping.
- Assembly-level mass-properties JSON response shape (fields, units behavior, null vs. omitted semantics) is only forum-verified; confirm against a live test document early in Phase 2.
- Floor-plane/"starting configuration" conventions have no platform-level flag — Phase 5 will need to define and document an explicit team-facing convention (e.g., requiring a named "Starting" configuration) and validate it against several real public team CAD documents (Chief Delphi/GrabCAD), per PROJECT.md's validation strategy.
- Deployment target (long-running container host vs. serverless) affects session-storage design (in-memory vs. signed cookie); STACK.md recommends deciding this early and leaning toward a long-running host to avoid a later migration when webhooks are added.

## Sources

### Primary (HIGH confidence)
- Onshape Developer Documentation — Extensions, OAuth, App Development, Client Messaging, Webhooks, Assemblies API, Documents API, Structured Storage (onshape-public.github.io/docs)
- Onshape Help — Mass Properties Tool, Material Library, Units (cad.onshape.com/help)
- GitHub/npm/PyPI registry metadata — onshape-public/onshape-clients (stale), onshape-public/onshape-ts-client (API-key only), onshape/passport-onshape (maintained), d3-polygon
- /openapi/cad_onshape_api_openapi (Context7) — Onshape REST API OpenAPI spec

### Secondary (MEDIUM confidence)
- Onshape forum threads — assembly mass-properties behavior, material override, refresh-token lifetime, rate limits, extension context query params
- onshape-public/app-bom and inventory-oauth2-app sample repos — reference architecture patterns
- FRCManual.com, FRCTools.com — 2026 rule taxonomy/numbering (community mirrors of the Game Manual)

### Tertiary (LOW confidence)
- WebSearch aggregation — Node.js 22/24 LTS status, Express 5 stability (cross-checked against npm registry, elevated to effectively HIGH via direct registry query)
- 2026 FRC Game Manual PDF — binary parsing failed; rule numbers cross-verified via community mirrors instead, recommend direct re-verification at implementation time

---
*Research completed: 2026-06-30*
*Ready for roadmap: yes*

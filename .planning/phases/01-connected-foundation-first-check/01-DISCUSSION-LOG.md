# Phase 1: Connected Foundation & First Check - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 1-connected-foundation-first-check
**Areas discussed:** Deploy target + token storage, Season config schema + values

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy target + token storage | Container vs serverless; in-memory session vs signed cookie | ✓ |
| The 2 proof-of-plumbing checks | Which two trivial-but-real checks prove the pluggable engine | (→ discretion) |
| Season config schema + values | Config format, per-rule fields, real vs placeholder limits | ✓ |
| First report presentation | Raw dump vs pass/fail rows; how explicitly labeled as plumbing-proof | (→ discretion) |

---

## Deploy Target + Token Storage

### Backend runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Long-running container | Render/Fly/Railway; in-memory session works; webhook-ready for v2 | ✓ |
| Serverless functions | Vercel/Netlify; isolated invocations force signed-cookie tokens | |
| Local dev only for Phase 1 | Defer hosting decision; leaves "dev deployment" partially unproven | |

**User's choice:** Long-running container (Recommended)
**Notes:** Matches CLAUDE.md's recommendation; keeps v2 webhook auto-refresh viable without a hosting migration.

### Token storage

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory express-session | MemoryStore + httpOnly session cookie; tokens stay server-side | ✓ |
| Signed/encrypted httpOnly cookie | Tokens carried in encrypted cookie; fully stateless; required if serverless | |

**User's choice:** In-memory express-session (Recommended)

### Refresh trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Reactive on 401 | Fail → refresh → retry once transparently; no clock-tracking | ✓ |
| Proactive before expiry | Track issue time, refresh at ~55 min; still needs 401 fallback | |
| Both proactive + 401 fallback | Most robust, most code; overkill for a Walking Skeleton | |

**User's choice:** Reactive on 401 (Recommended)

### Expired-session UX

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated "Reconnect" state | Distinct panel view + reconnect button; visually separate from check rows | ✓ |
| Inline banner above results | Warning banner atop results; risks blurring auth-broke vs check-failed | |

**User's choice:** Dedicated "Reconnect" state (Recommended)
**Notes:** Directly satisfies CONN-03 / Success Criterion 3 (expired must be distinct from a real failure).

---

## Season Config Schema + Values

### Format

| Option | Description | Selected |
|--------|-------------|----------|
| JSON file (rules/2026.json) | Pure data, zod-validated at load; clean yearly diffs; mentor-editable | ✓ |
| TypeScript module (rules/2026.ts) | Compile-time types but mixes yearly data into source; needs rebuild | |

**User's choice:** JSON file, e.g. rules/2026.json (Recommended)

### Per-rule schema

| Option | Description | Selected |
|--------|-------------|----------|
| number, title, limit, unit, operator | operator (max/min) enables generic comparison in the check engine | ✓ |
| Just number, title, limit, unit | Minimal CONF-02; each check hardcodes max/min later | |

**User's choice:** Number, title, limit, unit, operator (Recommended)

### Limit values shipped in Phase 1

| Option | Description | Selected |
|--------|-------------|----------|
| Real rule #s/titles, placeholder limits | Accurate R101/R103/R104/R408 + marked placeholders + Game Manual pointer | ✓ |
| Real numbers throughout | Actual season limits now; risky if 2026 values not on hand | |
| Only what the 2 proof-checks need | Minimal config; defer real-rule entries to Phases 2–3 | |

**User's choice:** Real rule #s/titles, placeholder limits (Recommended)
**Notes:** 2026 FRC numbers are unverifiable at this cutoff and Phase 1 trusts no check output; a team/later phase fills real limits from the Manual.

---

## Claude's Discretion

- **The two proof-of-plumbing checks** — both must consume the shared occurrence-traversal facts (Success Criterion 5). Lean: occurrence/part-inventory count + `FRAME_`-tag presence; optionally exercise the mass-properties endpoint in one trivial check to de-risk Phase 2.
- **First report presentation** — lean: minimal pass/fail rows shaped like the Phase 4 dashboard, with an explicit "plumbing proof — verdicts not yet trusted" banner.
- **Specific container provider** (Render vs Fly.io vs Railway) — pick the simplest always-on HTTPS Node/Express deploy.

## Deferred Ideas

None new — discussion stayed within phase scope. v2 items (WEBH-01, FSCR-01, TAG-01, additional checks) already tracked in REQUIREMENTS.md §v2.

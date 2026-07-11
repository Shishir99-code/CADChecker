---
phase: quick/260711-gvl-scaffold-phase-3-frame-perimeter-verific
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/verify-frame-perimeter.ts
  - package.json
  - .planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md
autonomous: true
requirements: [GEOM-01, GEOM-02, GEOM-03]

must_haves:
  truths:
    - "Running the offline harness exercises the REAL createCheckRouter and prints a PASS report + exits 0 when CR-01/CR-02 are closed"
    - "The harness exits NON-ZERO if the R101 perimeter verdict regresses to UNKNOWN (CR-01) or if the hull omits a reused FRAME_ occurrence (CR-02)"
    - "The harness proves R104 starting-height computes a real measured value"
    - "A non-CAD user can follow 03-LIVE-VERIFICATION.md to confirm the fix against a public Onshape document without modeling anything"
  artifacts:
    - path: "scripts/verify-frame-perimeter.ts"
      provides: "Standalone runnable offline verification harness exercising the shipped route"
      min_lines: 120
    - path: ".planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md"
      provides: "Non-CAD-user live-verification runbook with CR-01 smoking-gun signature"
      min_lines: 40
  key_links:
    - from: "scripts/verify-frame-perimeter.ts"
      to: "src/server/routes/check.routes.ts"
      via: "import { createCheckRouter } and supertest POST /api/check"
      pattern: "createCheckRouter"
---

<objective>
Scaffold Phase 3 frame-perimeter verification without touching shipped product code. The CR-01 (instance-id vs CAD-partId join) and CR-02 (reused FRAME_ occurrence collapse) bugs were CODE-FIXED in plan 03-04, but proven only by unit fixtures the verification report warns can mask this exact bug class. The project owner cannot CAD, so a real Onshape document cannot be hand-built right now.

Deliver two artifacts:
1. An offline verification harness — a single runnable script that builds a high-fidelity synthetic Onshape assembly and drives it through the ACTUAL shipped `createCheckRouter`, printing a human-readable report and exiting non-zero on any regression (usable as a CI gate).
2. A live-verification runbook — a markdown doc walking a non-CAD user through confirming the fix against a real, public FRC team CAD document.

Purpose: Give the owner a trustworthy, repeatable proof that the R101 perimeter check produces a real PASS/FAIL hull (not permanent UNKNOWN) and that a reused frame rail contributes every occurrence to the hull — a proof that stays honest if the route later regresses, because it imports and exercises the real route rather than reimplementing it.

Output: `scripts/verify-frame-perimeter.ts`, a `verify:frame` npm script, and `.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@src/server/routes/check.routes.ts
@src/server/routes/check.routes.test.ts
@src/server/traversal/flatten-assembly.ts
@src/server/traversal/facts.ts
@src/server/checks/frame-perimeter.check.ts
@src/server/checks/starting-height.check.ts
@src/server/onshape-client/client.ts
@rules/2026.json
@.planning/phases/03-frame-perimeter-height/03-VERIFICATION.md
@.planning/phases/03-frame-perimeter-height/03-04-SUMMARY.md
</context>

<constraints>
- MUST NOT modify any file under `src/server/` product code, `src/panel/`, or `rules/`. The harness is a NEW `scripts/` file plus a `package.json` script entry only.
- MUST NOT change check behavior. If the harness surfaces a real regression, that is a FINDING to report back — never a code change made in this plan.
- The harness MUST import and drive the REAL `createCheckRouter` (via supertest, mirroring `check.routes.test.ts`'s `buildTestApp` idiom). It MUST NOT reimplement route/traversal/check logic.
- Follow CLAUDE.md conventions: TypeScript, `node --experimental-strip-types`, `.ts` import extensions, ESM.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Offline verification harness driving the real route</name>
  <files>scripts/verify-frame-perimeter.ts, package.json</files>
  <action>
Create `scripts/verify-frame-perimeter.ts`, a standalone runnable script (not a vitest case) that builds a supertest app around the REAL `createCheckRouter` — mirror the `buildTestApp` pattern in `check.routes.test.ts` (express + express-session + a session-injecting middleware that sets `req.session.accessToken`, then `app.use(createCheckRouter({ onshapeEnv, clientFactory: () => fakeClient }))`). Do NOT import vitest; use plain `async` functions and Node `assert` (or hand-rolled throw-on-mismatch) plus `process.exit`.

Build a HIGH-FIDELITY synthetic assembly definition at realistic FRC drivetrain scale (Onshape units are METERS — 28in ≈ 0.7112m, 32in ≈ 0.8128m). Requirements for the synthetic fixture, both guarding the two regressions:
- CR-01 guard: every instance's `id` (the occurrence-path leaf) MUST be a DISTINCT string from its CAD `partId` (e.g. instance id "occ-rail-left" resolving to partId "RAIL_LONG"), exactly the shape `stubAssemblyDefinition` uses — never alias the two id spaces. `parts[]` entries carry the real CAD partIds; `rootAssembly.instances[].partId` resolves each occurrence to its CAD partId.
- CR-02 guard: at least one FRAME_-tagged CAD part MUST be reused at 2+ occurrences with DIFFERENT transforms (e.g. one "RAIL_LONG" side-rail placed at the left edge and again translated +X to the right edge of the ~28x32in footprint). `parts[]` holds ONE deduplicated entry for that partId (mirror `stubTwoOccurrenceAssembly`).
Compose a full rectangular frame footprint from FRAME_-tagged rails so the floor-projected hull is a realistic ~28in x 32in rectangle. Name planner's-discretion which exact frame size, but the chosen size determines the expected R101 status — assert whichever status (PASS if perimeter < 110in, FAIL if > 110in) the chosen footprint deterministically yields. Set the assembly-level `getAssemblyBoundingBoxes.highZ` to a realistic sub-limit value (e.g. 0.5m ≈ 19.7in) so R104 is a real PASS.

Provide a fake `OnshapeClient` satisfying the full interface in `client.ts` (`getElementsInDocument`, `getAssemblyDefinition`, `getPartStudioMassProperties`, `getPartsMetadata`, `getBoundingBoxes`, `getAssemblyBoundingBoxes`) — reuse the stub shapes from `check.routes.test.ts` as reference. `getBoundingBoxes` returns LOCAL corners (the route applies the per-occurrence transform); `getAssemblyBoundingBoxes` returns the world-space whole-robot box. Mass/material stubs can return empty `bodies`/`[]` — this harness targets the 5c/5d geometry paths.

POST to `/api/check` via supertest, capture `res.body.verdicts`, and assert (throwing + `process.exit(1)` on ANY failure, per D-02 "prefer a loud failure"):
  1. CR-01 CLOSED — `verdicts.find(v => v.geometry)` (select by geometry presence, NOT `rule === "R101"`, because occurrenceCountCheck also positionally cites R101 — see the note in `check.routes.test.ts`) is defined, its `status` is "PASS" or "FAIL" (NOT "UNKNOWN"), `geometry.hullVertices.length >= 3`, and `measuredCount` is a positive number.
  2. CR-02 CLOSED — collect the hull vertices' X values; the hull X-extent (max − min) MUST span BOTH reused-rail placements (materially wider than a single rail — i.e. approximately the full frame width, not one rail's width). Assert min-X near the left placement and max-X near the right placement.
  3. R104 real value — `verdicts.find(v => v.rule === "R104")` has `status` "PASS"/"FAIL" (NOT "UNKNOWN") and a positive numeric `measuredCount`.

Print a HUMAN-READABLE report to stdout: the measured perimeter vs the 110in R101 limit and the resolved status; the hull X-extent with both placement bounds annotated ("reused RAIL_LONG contributes both occurrences"); the measured height vs the 30in R104 limit; and a final "ALL GUARDS PASSED" line. On success `process.exit(0)`; on any assertion failure print which guard failed (naming CR-01 or CR-02) and `process.exit(1)`.

Add a `"verify:frame": "node --experimental-strip-types scripts/verify-frame-perimeter.ts"` entry to package.json `scripts` (mirroring the existing `--experimental-strip-types` idiom). Do not touch any other package.json field.
  </action>
  <verify>
    <automated>node --experimental-strip-types /Users/shishirraj/CADChecker/scripts/verify-frame-perimeter.ts; test $? -eq 0</automated>
  </verify>
  <done>`npm run verify:frame` (and the direct node invocation) prints a PASS report and exits 0 against the current fixed code; the script would exit non-zero if the perimeter verdict were UNKNOWN or the hull omitted a reused occurrence. No file under src/ or rules/ was modified.</done>
</task>

<task type="auto">
  <name>Task 2: Live-verification runbook for a non-CAD user</name>
  <files>.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md</files>
  <action>
Write `.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md` — a runbook walking a NON-CAD user through confirming the CR-01/CR-02 fix against a REAL Onshape document. It MUST cover, in plain language:

1. No modeling required — the user can open a PUBLIC FRC team CAD document (the project validates against "public team CAD documents only") in their own Onshape account. Explain that a FRAME_ "tag" is NOT CAD modeling: it is simply RENAMING an assembly instance in the assembly feature tree so its name begins with `FRAME_` (e.g. rename a drivetrain side rail to `FRAME_rail_left`). Tag a few parts that form the outer frame perimeter. Note explicitly that the R104 height check needs NO tagging at all — it measures the whole assembly.

2. Run the app locally — `npm run dev`, open the Onshape panel/extension, connect via OAuth, and click "check now" (the POST /api/check flow). Reference that the panel re-derives live context on each click.

3. Exactly what to look for — in the panel / `/api/check` JSON `verdicts`:
   - The R101 verdict (the one carrying a `geometry` field / rendered HullRender SVG) should be a REAL PASS or FAIL, showing the measured perimeter vs the 110in limit, with a drawn hull polygon.
   - The R104 verdict should show a measured height vs the 30in limit.
   - Sanity check for CR-02: the drawn hull should visibly enclose the FULL frame footprint (all tagged rails), not collapse to a single rail — if a rail type is used at multiple corners, every placement should be inside the hull.

4. The CR-01 SMOKING-GUN signature — spell out the concrete symptom: if EVERY FRAME_-tagged part comes back unresolved and the R101 verdict is stuck at UNKNOWN with the caveat "perimeter geometry could not be read for N part(s)" (or "not yet checkable") DESPITE the parts being correctly renamed to `FRAME_`, then the live instance→CAD-partId resolution assumption is wrong for that document and CR-01 must be RE-OPENED. Tell the user this is the exact failure the offline harness guards against, and that seeing it live (but not offline) means the real Onshape `instances[].partId` shape differs from the synthetic fixture — a finding to report, not something to fix in CAD.

Keep it discoverable and skimmable (numbered steps, a short "what good looks like" vs "what a regression looks like" contrast). Cross-reference the offline harness (`npm run verify:frame`) as the fast pre-check to run before attempting the live check.
  </action>
  <verify>
    <automated>test -f /Users/shishirraj/CADChecker/.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md && grep -q "FRAME_" /Users/shishirraj/CADChecker/.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md && grep -qi "UNKNOWN" /Users/shishirraj/CADChecker/.planning/phases/03-frame-perimeter-height/03-LIVE-VERIFICATION.md</automated>
  </verify>
  <done>The runbook exists, explains that a FRAME_ tag is an assembly-instance rename (not CAD modeling), tells a non-CAD user to use a public FRC document, describes exactly what a real PASS/FAIL R101 hull + R104 height look like, and names the CR-01 smoking-gun (permanent UNKNOWN despite correct tagging) as a re-open finding.</done>
</task>

</tasks>

<verification>
- `node --experimental-strip-types scripts/verify-frame-perimeter.ts` exits 0 and prints "ALL GUARDS PASSED" against the current (03-04-fixed) code.
- Manually confirm the harness would FAIL loudly on regression: it selects the perimeter verdict by `geometry` presence and asserts status is not UNKNOWN (CR-01) and the hull X-extent spans both reused-rail placements (CR-02).
- No file under `src/` or `rules/` is modified (only `scripts/` + the `package.json` scripts entry + the runbook doc).
- `03-LIVE-VERIFICATION.md` exists and is discoverable inside the phase directory.
</verification>

<success_criteria>
- A single runnable harness drives the REAL `createCheckRouter` (imported, not reimplemented) with distinct instance-id/CAD-partId strings and a reused two-occurrence FRAME_ part.
- The harness proves R101 resolves to a real PASS/FAIL hull (CR-01 closed), the hull includes every occurrence of the reused rail (CR-02 closed), and R104 computes a real measured height — exiting non-zero on any regression.
- The runbook lets a non-CAD user confirm the same three properties against a real public Onshape document and recognize the CR-01 smoking-gun.
- Zero changes to shipped product code or check behavior.
</success_criteria>

<output>
Create `.planning/quick/260711-gvl-scaffold-phase-3-frame-perimeter-verific/260711-gvl-SUMMARY.md` when done.
</output>

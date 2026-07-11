/**
 * Offline verification harness — Phase 3 frame-perimeter (R101) + starting-
 * height (R104), guarding against regression of CR-01/CR-02.
 *
 * CONTEXT: the CR-01 (instance-id vs CAD-partId join) and CR-02 (reused
 * FRAME_ occurrence collapsed to a single placement) bugs were CODE-FIXED in
 * Phase 03 Plan 04, but proven only by unit fixtures that 03-VERIFICATION.md
 * warns can mask this exact bug class. This script gives a repeatable,
 * runnable proof that stays honest if the route later regresses, because it
 * IMPORTS and DRIVES the REAL `createCheckRouter` (via supertest, mirroring
 * check.routes.test.ts's `buildTestApp` idiom) rather than reimplementing any
 * route/traversal/check logic.
 *
 * It builds a HIGH-FIDELITY synthetic Onshape assembly — a realistic
 * FRC-drivetrain-scale rectangular frame — and POSTs it through the real
 * /api/check handler, then asserts:
 *
 *   1. CR-01 CLOSED — the R101 perimeter verdict (selected by `geometry`
 *      presence, not `rule === "R101"` — see the note in
 *      check.routes.test.ts about occurrenceCountCheck's positional R101
 *      citation) is a real PASS/FAIL, never UNKNOWN, with a real hull and a
 *      positive measuredCount.
 *   2. CR-02 CLOSED — the hull's X-extent spans BOTH placements of the
 *      reused RAIL_LONG part (left edge AND right edge), not just one.
 *   3. R104 REAL VALUE — the starting-configuration height verdict is a real
 *      PASS/FAIL with a positive measuredCount, from a single
 *      getAssemblyBoundingBoxes call.
 *
 * ── How to run ────────────────────────────────────────────────────────────
 *   npm run verify:frame
 *   # or directly:
 *   node --experimental-strip-types scripts/verify-frame-perimeter.ts
 *
 * Exits 0 and prints "ALL GUARDS PASSED" when every guard holds. Exits
 * non-zero and names the failing guard (CR-01 / CR-02 / R104) on any
 * regression — safe to wire into CI as a gate.
 *
 * CONSTRAINT: this file (and its package.json `verify:frame` script entry)
 * are the ONLY files this plan touches. It must never reimplement
 * route/traversal/check logic — every assertion here is only as good as the
 * REAL createCheckRouter it drives.
 * ───────────────────────────────────────────────────────────────────────────
 */

import assert from "node:assert/strict";
import express, { type Express } from "express";
import session from "express-session";
import request from "supertest";
import { createCheckRouter } from "../src/server/routes/check.routes.ts";
import type { OnshapeClient } from "../src/server/onshape-client/client.ts";

// ---------------------------------------------------------------------------
// Synthetic fixture — a realistic FRC drivetrain-scale rectangular frame.
// Onshape's bounding-box/transform values are SI meters regardless of
// document display units (03-BOUNDING-BOX-CONTRACT.md A4): 28in = 0.7112m,
// 32in = 0.8128m (exact, 0.0254 m/in).
// ---------------------------------------------------------------------------

const IN_TO_M = 0.0254;
const M_TO_IN = 39.37007874;

const FRAME_WIDTH_IN = 32; // X extent (front/back cross-rail length)
const FRAME_DEPTH_IN = 28; // Y extent (left/right side-rail length)
const FRAME_WIDTH_M = FRAME_WIDTH_IN * IN_TO_M; // 0.8128
const FRAME_DEPTH_M = FRAME_DEPTH_IN * IN_TO_M; // 0.7112
const RAIL_THICKNESS_M = 0.05;
const RAIL_HEIGHT_M = 0.1;
const ROBOT_HEIGHT_M = 0.5; // ~19.7in, comfortably under the 30in R104 limit
const PERIMETER_LIMIT_IN = 110;
const HEIGHT_LIMIT_IN = 30;

const DOCUMENT_ID = "doc-verify-1";
const WORKSPACE_ID = "ws-verify-1";
const ASSEMBLY_ELEMENT_ID = "asm-verify-1";
const PART_STUDIO_ELEMENT_ID = "ps-verify-1";

// CR-02 guard: RAIL_LONG is a SINGLE CAD part reused at TWO occurrences (the
// left edge and the right edge, translated +X) with a SINGLE deduplicated
// parts[] entry — mirrors check.routes.test.ts's stubTwoOccurrenceAssembly.
const RAIL_LONG_PART_ID = "RAIL_LONG";
// A second (non-reused) CAD part forming the front/back cross-rails, so the
// synthetic assembly composes a FULL rectangular frame footprint rather than
// two disconnected side rails.
const RAIL_CROSS_PART_ID = "RAIL_CROSS";

function translateTransform(tx = 0, ty = 0, tz = 0): number[] {
  // Row-major 4x4, translation in columns 3/7/11 — the same shape
  // check.routes.test.ts's fixtures and flatten-assembly.ts consume.
  return [1, 0, 0, tx, 0, 1, 0, ty, 0, 0, 1, tz, 0, 0, 0, 1];
}

function stubElements() {
  return [{ id: ASSEMBLY_ELEMENT_ID, elementType: "ASSEMBLY", name: "Verify Assembly" }];
}

/**
 * Assembly definition for the synthetic frame.
 *
 * CR-01 guard: every instance's `id` (the occurrence-path leaf) is a
 * DISTINCT string from its CAD `partId` — never aliased. "occ-rail-left"
 * resolves to CAD partId "RAIL_LONG", exactly the shape
 * check.routes.test.ts's `stubAssemblyDefinition` uses.
 *
 * CR-02 guard: RAIL_LONG (a FRAME_-tagged side rail) is reused at two
 * occurrences with DIFFERENT transforms — left edge (identity) and right
 * edge (translated +X by the frame width minus rail thickness).
 */
function stubAssemblyDefinition() {
  const railRightTx = FRAME_WIDTH_M - RAIL_THICKNESS_M; // right-edge placement
  const crossBackTy = FRAME_DEPTH_M - RAIL_THICKNESS_M; // back-edge placement

  return {
    rootAssembly: {
      instances: [
        { id: "occ-rail-left", name: "FRAME_rail_left", type: "Part", partId: RAIL_LONG_PART_ID },
        { id: "occ-rail-right", name: "FRAME_rail_right", type: "Part", partId: RAIL_LONG_PART_ID },
        { id: "occ-cross-front", name: "FRAME_cross_front", type: "Part", partId: RAIL_CROSS_PART_ID },
        { id: "occ-cross-back", name: "FRAME_cross_back", type: "Part", partId: RAIL_CROSS_PART_ID },
      ],
      occurrences: [
        { path: ["occ-rail-left"], transform: translateTransform(0, 0, 0) },
        { path: ["occ-rail-right"], transform: translateTransform(railRightTx, 0, 0) },
        { path: ["occ-cross-front"], transform: translateTransform(0, 0, 0) },
        { path: ["occ-cross-back"], transform: translateTransform(0, crossBackTy, 0) },
      ],
    },
    subAssemblies: [],
    // parts[] is deduplicated per unique CAD partId (02-MASS-PROPERTIES-
    // CONTRACT.md rule 3) — ONE entry for RAIL_LONG even though it has two
    // occurrences above.
    parts: [
      { documentId: DOCUMENT_ID, elementId: PART_STUDIO_ELEMENT_ID, partId: RAIL_LONG_PART_ID },
      { documentId: DOCUMENT_ID, elementId: PART_STUDIO_ELEMENT_ID, partId: RAIL_CROSS_PART_ID },
    ],
  };
}

/**
 * LOCAL (untransformed) bounding boxes, keyed by CAD partId. The route
 * applies each occurrence's own transform on top of these (5c enrichment) —
 * never transformed here. Side rails run along Y (length = frame depth);
 * cross rails run along X (length = frame width); together the four
 * occurrences compose a full rectangular frame footprint.
 */
function stubGetBoundingBoxes() {
  return async (
    _documentId: string,
    _wvm: string,
    _wvmid: string,
    _elementId: string,
    partId: string,
  ) => {
    if (partId === RAIL_LONG_PART_ID) {
      return {
        lowX: 0,
        lowY: 0,
        lowZ: 0,
        highX: RAIL_THICKNESS_M,
        highY: FRAME_DEPTH_M,
        highZ: RAIL_HEIGHT_M,
      };
    }
    if (partId === RAIL_CROSS_PART_ID) {
      return {
        lowX: 0,
        lowY: 0,
        lowZ: 0,
        highX: FRAME_WIDTH_M,
        highY: RAIL_THICKNESS_M,
        highZ: RAIL_HEIGHT_M,
      };
    }
    throw new Error(`stubGetBoundingBoxes: unexpected partId "${partId}"`);
  };
}

/** Assembly-level (already world-space) whole-robot bounding box for R104
 * (5d). highZ = 0.5m ≈ 19.68in, comfortably under the 30in R104 limit. */
function stubGetAssemblyBoundingBoxes() {
  return async () => ({
    lowX: 0,
    lowY: 0,
    lowZ: 0,
    highX: FRAME_WIDTH_M,
    highY: FRAME_DEPTH_M,
    highZ: ROBOT_HEIGHT_M,
  });
}

/** Full OnshapeClient interface (client.ts). Mass/material stubs return
 * empty bodies/[] — this harness targets the 5c/5d geometry paths, not
 * weight/material checks. */
function buildFakeClient(): OnshapeClient {
  return {
    getElementsInDocument: async () => stubElements() as never,
    getAssemblyDefinition: async () => stubAssemblyDefinition() as never,
    getPartStudioMassProperties: async () => ({ bodies: {} }) as never,
    getPartsMetadata: async () => [] as never,
    getBoundingBoxes: stubGetBoundingBoxes() as OnshapeClient["getBoundingBoxes"],
    getAssemblyBoundingBoxes: stubGetAssemblyBoundingBoxes() as OnshapeClient["getAssemblyBoundingBoxes"],
  };
}

/**
 * Builds a supertest app around the REAL createCheckRouter — mirrors
 * check.routes.test.ts's `buildTestApp`: express + express-session + a
 * session-injecting middleware that sets req.session.accessToken, then
 * app.use(createCheckRouter(...)) with an injected fake client. NEVER
 * reimplements route/traversal/check logic.
 */
function buildHarnessApp(fakeClient: OnshapeClient): Express {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "verify-frame-perimeter-harness",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax" },
    }),
  );
  app.use((req, _res, next) => {
    req.session.accessToken = "fake-access-token";
    req.session.refreshToken = "fake-refresh-token";
    next();
  });
  app.use(
    createCheckRouter({
      onshapeEnv: { clientID: "verify-id", clientSecret: "verify-secret" },
      clientFactory: () => fakeClient,
    }),
  );
  return app;
}

interface HarnessVerdict {
  rule: string;
  status: "PASS" | "FAIL" | "UNKNOWN";
  measuredCount?: number;
  geometry?: { hullVertices: Array<[number, number]> };
}

async function main(): Promise<void> {
  const fakeClient = buildFakeClient();
  const app = buildHarnessApp(fakeClient);

  const res = await request(app)
    .post("/api/check")
    .send({ documentId: DOCUMENT_ID, workspaceId: WORKSPACE_ID });

  assert.equal(
    res.status,
    200,
    `Expected 200 from /api/check, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  const verdicts = res.body.verdicts as HarnessVerdict[];
  assert.ok(Array.isArray(verdicts) && verdicts.length > 0, "Expected a non-empty verdicts array from /api/check.");

  // --- CR-01 guard: real perimeter verdict, never UNKNOWN -----------------
  // Selected by `geometry` presence, NOT `rule === "R101"` — the
  // pre-existing occurrenceCountCheck (Phase 1) also positionally cites
  // R101 (deferred-items.md); this is the exact ambiguity
  // check.routes.test.ts's tests document.
  const perimeterVerdict = verdicts.find((v) => v.geometry);
  assert.ok(
    perimeterVerdict,
    "CR-01 REGRESSION: no verdict carries a `geometry` field — the R101 perimeter check never ran or its output shape changed.",
  );
  assert.notEqual(
    perimeterVerdict!.status,
    "UNKNOWN",
    "CR-01 REGRESSION: the R101 perimeter verdict is UNKNOWN — the instance-id/CAD-partId join is broken again " +
      "(FRAME_ parts are going unresolved despite being present and correctly tagged).",
  );
  assert.ok(
    perimeterVerdict!.geometry!.hullVertices.length >= 3,
    `CR-01 REGRESSION: hull has only ${perimeterVerdict!.geometry!.hullVertices.length} vertices — insufficient geometry to form a real perimeter.`,
  );
  assert.equal(
    typeof perimeterVerdict!.measuredCount,
    "number",
    "CR-01 REGRESSION: the perimeter verdict has no numeric measuredCount.",
  );
  assert.ok(
    perimeterVerdict!.measuredCount! > 0,
    `CR-01 REGRESSION: perimeter measuredCount (${perimeterVerdict!.measuredCount}) is not positive.`,
  );

  // --- CR-02 guard: hull spans BOTH reused RAIL_LONG placements -----------
  const hullXs = perimeterVerdict!.geometry!.hullVertices.map(([x]) => x);
  const hullMinX = Math.min(...hullXs);
  const hullMaxX = Math.max(...hullXs);
  const expectedLeftPlacementM = 0; // occ-rail-left
  const expectedRightPlacementM = FRAME_WIDTH_M; // occ-rail-right (right edge of frame)
  const TOLERANCE_M = 0.01;

  assert.ok(
    Math.abs(hullMinX - expectedLeftPlacementM) < TOLERANCE_M,
    `CR-02 REGRESSION: hull min-X (${hullMinX.toFixed(4)}m) is not near the left RAIL_LONG placement ` +
      `(${expectedLeftPlacementM}m) — the left occurrence's footprint may have been dropped.`,
  );
  assert.ok(
    Math.abs(hullMaxX - expectedRightPlacementM) < TOLERANCE_M,
    `CR-02 REGRESSION: hull max-X (${hullMaxX.toFixed(4)}m) is not near the right RAIL_LONG placement ` +
      `(${expectedRightPlacementM}m) — the hull only spans ONE reused occurrence's footprint, not both ` +
      `(the classic per-partId collapse regression).`,
  );
  const hullXExtentIn = (hullMaxX - hullMinX) / IN_TO_M;
  assert.ok(
    hullXExtentIn > FRAME_WIDTH_IN * 0.9,
    `CR-02 REGRESSION: hull X-extent (${hullXExtentIn.toFixed(2)}in) is materially narrower than the full frame ` +
      `width (${FRAME_WIDTH_IN}in) — looks like only one RAIL_LONG placement contributed to the hull.`,
  );

  // --- R104 guard: real starting-height verdict ---------------------------
  const heightVerdict = verdicts.find((v) => v.rule === "R104");
  assert.ok(heightVerdict, "R104 REGRESSION: no R104 verdict present in the response.");
  assert.notEqual(
    heightVerdict!.status,
    "UNKNOWN",
    "R104 REGRESSION: the starting-configuration-height verdict is UNKNOWN — the single assembly-level " +
      "bounding-box fetch (5d) is broken.",
  );
  assert.equal(
    typeof heightVerdict!.measuredCount,
    "number",
    "R104 REGRESSION: the height verdict has no numeric measuredCount.",
  );
  assert.ok(
    heightVerdict!.measuredCount! > 0,
    `R104 REGRESSION: height measuredCount (${heightVerdict!.measuredCount}) is not positive.`,
  );

  // --- Human-readable report ------------------------------------------------
  const expectedPerimeterIn = 2 * (FRAME_WIDTH_IN + FRAME_DEPTH_IN);
  console.log("");
  console.log("=== Frame Perimeter Verification Report ===");
  console.log("");
  console.log("R101 Frame Perimeter (CR-01 guard):");
  console.log(
    `  Measured: ${perimeterVerdict!.measuredCount!.toFixed(2)}in  (limit: ${PERIMETER_LIMIT_IN}in max, ` +
      `expected ~${expectedPerimeterIn}in for the ${FRAME_WIDTH_IN}x${FRAME_DEPTH_IN}in synthetic frame)`,
  );
  console.log(`  Status:   ${perimeterVerdict!.status} (never UNKNOWN — CR-01 closed)`);
  console.log(`  Hull vertices: ${perimeterVerdict!.geometry!.hullVertices.length}`);
  console.log(
    `  Hull X-extent (CR-02 guard): ${(hullMinX / IN_TO_M).toFixed(2)}in .. ${(hullMaxX / IN_TO_M).toFixed(2)}in ` +
      `— reused RAIL_LONG contributes BOTH the left-edge and right-edge occurrences`,
  );
  console.log("");
  console.log("R104 Starting-Configuration Height:");
  console.log(
    `  Measured: ${heightVerdict!.measuredCount!.toFixed(2)}in  (limit: ${HEIGHT_LIMIT_IN}in max, ` +
      `expected ~${(ROBOT_HEIGHT_M * M_TO_IN).toFixed(2)}in for the synthetic ${ROBOT_HEIGHT_M}m robot height)`,
  );
  console.log(`  Status:   ${heightVerdict!.status} (never UNKNOWN — real measured value)`);
  console.log("");
  console.log("ALL GUARDS PASSED");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("");
    console.error("VERIFICATION FAILED");
    console.error(err instanceof Error ? err.message : String(err));
    console.error("");
    process.exit(1);
  });

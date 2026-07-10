import { describe, it, expect, vi } from "vitest";
import express, { type Express } from "express";
import session from "express-session";
import request from "supertest";
import { createCheckRouter } from "./check.routes.ts";
import { ReconnectRequiredError } from "../auth/refresh.ts";
import { OnshapeApiError, type OnshapeClient } from "../onshape-client/client.ts";
import { CheckEngine } from "../checks/engine.ts";
import type { Fact } from "../traversal/facts.ts";

const ASSEMBLY_ELEMENT_ID = "asm-element-1";

// Same-document Part Studio (lives in the assembly's own document, "doc-1")
// -- readable via w/{workspaceId}.
const SAME_DOC_ELEMENT_ID = "ps-element-1";
// Referenced-document Part Studio (lives in a DIFFERENT document, "doc-ref")
// -- unreadable via w/{workspaceId}; needs v/{documentVersion} addressing and
// still 403s here (02-MASS-PROPERTIES-CONTRACT.md F3, other-owner library).
const REF_DOC_ID = "doc-ref";
const REF_DOC_ELEMENT_ID = "ps-element-ref";
const REF_DOC_VERSION = "ref-version-1";

function stubElements() {
  return [
    { id: SAME_DOC_ELEMENT_ID, elementType: "PARTSTUDIO", name: "Part Studio 1" },
    { id: ASSEMBLY_ELEMENT_ID, elementType: "ASSEMBLY", name: "Main Assembly" },
  ];
}

/**
 * Assembly definition stub covering the three merge cases (F1/F2/F3):
 * (a) inst-1: same-document part with a real mass and a material.
 * (b) inst-2: same-document part with NO material -- and, mirroring F1,
 *     omitted from the mass `bodies` map entirely (not mass: 0).
 * (c) inst-3: referenced-document part (different documentId, with a
 *     populated documentVersion) whose mass/material calls 403.
 */
function stubAssemblyDefinition() {
  return {
    rootAssembly: {
      instances: [
        { id: "inst-1", name: "FRAME_rail" },
        { id: "inst-2", name: "MECH_gearbox" },
        { id: "inst-3", name: "MECH_referenced_part" },
      ],
      occurrences: [
        // inst-1 (FRAME_rail) carries a non-trivial translation so the 5c
        // enrichment test below can confirm transformPoint is actually
        // applied to its bounding-box corners (03-BOUNDING-BOX-CONTRACT.md
        // A1/A3), not just passed through untransformed.
        { path: ["inst-1"], transform: [1, 0, 0, 10, 0, 1, 0, 20, 0, 0, 1, 30, 0, 0, 0, 1] },
        { path: ["inst-2"], transform: new Array(16).fill(0) },
        { path: ["inst-3"], transform: new Array(16).fill(0) },
      ],
    },
    subAssemblies: [],
    parts: [
      { documentId: "doc-1", elementId: SAME_DOC_ELEMENT_ID, partId: "inst-1" },
      { documentId: "doc-1", elementId: SAME_DOC_ELEMENT_ID, partId: "inst-2" },
      {
        documentId: REF_DOC_ID,
        elementId: REF_DOC_ELEMENT_ID,
        partId: "inst-3",
        documentVersion: REF_DOC_VERSION,
      },
    ],
  };
}

/** Fake getPartStudioMassProperties branching on the incoming documentId. */
function stubGetPartStudioMassProperties() {
  return vi.fn(async (documentId: string) => {
    if (documentId === "doc-1") {
      // inst-1 has a real mass; inst-2 is omitted from `bodies` entirely
      // (F1: unmaterialized parts are omitted, not mass: 0).
      return { bodies: { "inst-1": { mass: [2.9, 2.9, 2.9] } } };
    }
    if (documentId === REF_DOC_ID) {
      throw new OnshapeApiError(403, "Forbidden -- other-owner referenced document unreadable");
    }
    return { bodies: {} };
  });
}

/** Fake getPartsMetadata branching on the incoming documentId. */
function stubGetPartsMetadata() {
  return vi.fn(async (documentId: string) => {
    if (documentId === "doc-1") {
      return [
        { partId: "inst-1", material: { displayName: "Aluminum" } },
        { partId: "inst-2" }, // material absent -- unmaterialized
      ];
    }
    if (documentId === REF_DOC_ID) {
      throw new OnshapeApiError(403, "Forbidden -- other-owner referenced document unreadable");
    }
    return [];
  });
}

/** Fake getBoundingBoxes -- only the FRAME_-tagged part (inst-1) is ever
 * expected to be requested; returns a 1m unit-cube LOCAL box. */
function stubGetBoundingBoxes() {
  return vi.fn(async () => ({ lowX: 0, lowY: 0, lowZ: 0, highX: 1, highY: 1, highZ: 1 }));
}

/** Fake getAssemblyBoundingBoxes -- the single whole-robot world-space box
 * (5d). highZ = 0.5m -> ~19.68in, comfortably under the 30in R104 limit. */
function stubGetAssemblyBoundingBoxes() {
  return vi.fn(async () => ({ lowX: -1, lowY: -1, lowZ: 0, highX: 1, highY: 1, highZ: 0.5 }));
}

function buildTestApp(fakeClient: Partial<OnshapeClient>, options: { withSession?: boolean } = {}): Express {
  const { withSession = true } = options;
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax" },
    }),
  );

  if (withSession) {
    app.use((req, _res, next) => {
      req.session.accessToken = "fake-access-token";
      req.session.refreshToken = "fake-refresh-token";
      next();
    });
  }

  app.use(
    createCheckRouter({
      onshapeEnv: { clientID: "test-id", clientSecret: "test-secret" },
      clientFactory: () => fakeClient as OnshapeClient,
    }),
  );

  return app;
}

describe("POST /api/check", () => {
  it("returns 401 when no authenticated session exists", async () => {
    const app = buildTestApp({}, { withSession: false });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    expect(res.status).toBe(401);
  });

  it("re-derives live context via getElementsInDocument on THIS request and returns 7 verdicts", async () => {
    const getElementsInDocument = vi.fn().mockResolvedValue(stubElements());
    const getAssemblyDefinition = vi.fn().mockResolvedValue(stubAssemblyDefinition());
    const getPartStudioMassProperties = stubGetPartStudioMassProperties();
    const getPartsMetadata = stubGetPartsMetadata();

    const app = buildTestApp({
      getElementsInDocument,
      getAssemblyDefinition,
      getPartStudioMassProperties,
      getPartsMetadata,
    });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    expect(res.status).toBe(200);
    expect(getElementsInDocument).toHaveBeenCalledTimes(1);
    expect(getElementsInDocument).toHaveBeenCalledWith("doc-1", "ws-1");
    expect(getAssemblyDefinition).toHaveBeenCalledWith("doc-1", "w", "ws-1", ASSEMBLY_ELEMENT_ID);

    expect(res.body.verdicts).toHaveLength(7);
    expect(res.body.measuredContext).toEqual({
      documentId: "doc-1",
      workspaceId: "ws-1",
      elementId: ASSEMBLY_ELEMENT_ID,
    });
    for (const verdict of res.body.verdicts) {
      expect(verdict).toHaveProperty("rule");
      expect(verdict).toHaveProperty("title");
      expect(verdict).toHaveProperty("limit");
      expect(verdict).toHaveProperty("status");
      expect(verdict).toHaveProperty("caveats");
    }
    expect(res.body.verdicts.some((v: { rule: string }) => v.rule === "MAT-AUDIT")).toBe(true);
    expect(res.body.verdicts.some((v: { rule: string }) => v.rule === "R103")).toBe(true);
    expect(res.body.verdicts.some((v: { rule: string }) => v.rule === "R408")).toBe(true);
    // No FRAME_ bbox stub is configured on this fakeClient, so
    // framePerimeterCheck gates UNKNOWN here (no geometry field) -- the
    // dedicated 5c enrichment test below covers the PASS/FAIL/geometry path.
    // This assertion only confirms the 6th (new) verdict is present, still
    // citing R101 per the season config (see that test for the pre-existing
    // rule-citation collision note, deferred-items.md).
    expect(res.body.verdicts.filter((v: { rule: string }) => v.rule === "R101")).toHaveLength(2);
    // No getAssemblyBoundingBoxes stub is configured on this fakeClient
    // either, so startingHeightCheck (5d, the 7th/new verdict) also gates
    // UNKNOWN here -- the dedicated 5d enrichment test below covers the
    // PASS path.
    expect(res.body.verdicts.some((v: { rule: string }) => v.rule === "R104")).toBe(true);
  });

  it("merges mass/material per-group with cross-document addressing and degrades gracefully on a referenced-document 403", async () => {
    const getElementsInDocument = vi.fn().mockResolvedValue(stubElements());
    const getAssemblyDefinition = vi.fn().mockResolvedValue(stubAssemblyDefinition());
    const getPartStudioMassProperties = stubGetPartStudioMassProperties();
    const getPartsMetadata = stubGetPartsMetadata();

    const runAllSpy = vi.spyOn(CheckEngine.prototype, "runAll");

    const app = buildTestApp({
      getElementsInDocument,
      getAssemblyDefinition,
      getPartStudioMassProperties,
      getPartsMetadata,
    });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    // One group's 403 does not fail the whole request.
    expect(res.status).toBe(200);

    expect(runAllSpy).toHaveBeenCalledTimes(1);
    const enrichedFacts = runAllSpy.mock.calls[0]?.[0] as Fact[];
    const byPartId = new Map(enrichedFacts.map((f) => [f.partId, f]));

    // (a) same-document part with a real mass and a material.
    expect(byPartId.get("inst-1")?.massKg).toBe(2.9);
    expect(byPartId.get("inst-1")?.materialAssigned).toBe(true);

    // (b) same-document part with NO material -- and no mass entry (F1).
    expect(byPartId.get("inst-2")?.massKg).toBeUndefined();
    expect(byPartId.get("inst-2")?.materialAssigned).toBe(false);

    // (c) referenced-document part that 403'd -- UNRESOLVED, never 0/false.
    expect(byPartId.get("inst-3")?.massKg).toBeUndefined();
    expect(byPartId.get("inst-3")?.materialAssigned).toBeUndefined();

    // Per-group wvm selection: "w" for the same-document group (server-derived
    // ids), "v" (with the referenced part's documentVersion) for the
    // referenced group -- never a client-supplied value.
    expect(getPartStudioMassProperties).toHaveBeenCalledWith(
      "doc-1",
      "w",
      "ws-1",
      SAME_DOC_ELEMENT_ID,
      expect.arrayContaining(["inst-1", "inst-2"]),
      undefined,
    );
    expect(getPartStudioMassProperties).toHaveBeenCalledWith(
      REF_DOC_ID,
      "v",
      REF_DOC_VERSION,
      REF_DOC_ELEMENT_ID,
      ["inst-3"],
      undefined,
    );
    expect(getPartsMetadata).toHaveBeenCalledWith("doc-1", "w", "ws-1", SAME_DOC_ELEMENT_ID);
    expect(getPartsMetadata).toHaveBeenCalledWith(REF_DOC_ID, "v", REF_DOC_VERSION, REF_DOC_ELEMENT_ID);

    runAllSpy.mockRestore();
  });

  it("enriches FRAME_-tagged facts with transformed world-space bbox corners (5c) and leaves non-FRAME_ facts untouched", async () => {
    const getElementsInDocument = vi.fn().mockResolvedValue(stubElements());
    const getAssemblyDefinition = vi.fn().mockResolvedValue(stubAssemblyDefinition());
    const getPartStudioMassProperties = stubGetPartStudioMassProperties();
    const getPartsMetadata = stubGetPartsMetadata();
    const getBoundingBoxes = stubGetBoundingBoxes();

    const runAllSpy = vi.spyOn(CheckEngine.prototype, "runAll");

    const app = buildTestApp({
      getElementsInDocument,
      getAssemblyDefinition,
      getPartStudioMassProperties,
      getPartsMetadata,
      getBoundingBoxes,
    });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    expect(res.status).toBe(200);

    const enrichedFacts = runAllSpy.mock.calls[0]?.[0] as Fact[];
    const byPartId = new Map(enrichedFacts.map((f) => [f.partId, f]));

    // Only inst-1 (FRAME_rail) is FRAME_-tagged -- getBoundingBoxes is
    // called exactly for it, addressed via the same server-derived
    // documentId/wvm/wvmid/elementId as the 5b mass fetch.
    expect(getBoundingBoxes).toHaveBeenCalledTimes(1);
    expect(getBoundingBoxes).toHaveBeenCalledWith(
      "doc-1",
      "w",
      "ws-1",
      SAME_DOC_ELEMENT_ID,
      "inst-1",
      undefined,
    );

    // The occurrence transform (translation by [10, 20, 30]) MUST be applied
    // to the LOCAL 1m unit-cube box -- corners land at X/Y/Z in [10,11],
    // [20,21], [30,31] respectively, never the raw untransformed [0,1] range
    // (A1/A3).
    const frameCorners = byPartId.get("inst-1")?.bboxCornersWorld;
    expect(frameCorners).toHaveLength(8);
    for (const [x, y, z] of frameCorners ?? []) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(11);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(21);
      expect(z).toBeGreaterThanOrEqual(30);
      expect(z).toBeLessThanOrEqual(31);
    }

    // Non-FRAME_ facts (inst-2, inst-3) never get a bboxCornersWorld entry --
    // getBoundingBoxes is never called for them.
    expect(byPartId.get("inst-2")?.bboxCornersWorld).toBeUndefined();
    expect(byPartId.get("inst-3")?.bboxCornersWorld).toBeUndefined();

    // The unit-cube's 8 corners floor-project to exactly 4 unique XY points
    // (a 1m x 1m square) -- perimeter ~157.48in exceeds the 110in R101
    // limit, so this end-to-end enrichment path resolves to FAIL with hull
    // geometry attached (fine-grained hull-shape behavior is covered by
    // frame-perimeter.check.test.ts; this test only confirms the route's 5c
    // enrichment reaches the check correctly).
    //
    // Selected by `v.geometry` presence, NOT `v.rule === "R101"`: the
    // pre-existing Phase-1 occurrenceCountCheck positionally cites whatever
    // config.rules[0] currently is (now that rules/2026.json's R101 entry is
    // VERIFIED, that check ALSO reports rule "R101" for an unrelated
    // occurrence-count measurement -- see deferred-items.md). This is the
    // exact ambiguity 03-02-PLAN.md's Task 3 anticipates by recommending
    // `verdicts.find(v => v.geometry)` over a rule-string lookup.
    const perimeterVerdict = res.body.verdicts.find((v: { geometry?: unknown }) => v.geometry);
    expect(perimeterVerdict).toBeDefined();
    expect(perimeterVerdict.rule).toBe("R101");
    expect(perimeterVerdict.status).toBe("FAIL");
    expect(perimeterVerdict.geometry?.hullVertices).toHaveLength(4);

    runAllSpy.mockRestore();
  });

  it("enriches every fact with the whole-robot robotMaxZWorld (5d) from a single getAssemblyBoundingBoxes call", async () => {
    const getElementsInDocument = vi.fn().mockResolvedValue(stubElements());
    const getAssemblyDefinition = vi.fn().mockResolvedValue(stubAssemblyDefinition());
    const getPartStudioMassProperties = stubGetPartStudioMassProperties();
    const getPartsMetadata = stubGetPartsMetadata();
    const getAssemblyBoundingBoxes = stubGetAssemblyBoundingBoxes();

    const runAllSpy = vi.spyOn(CheckEngine.prototype, "runAll");

    const app = buildTestApp({
      getElementsInDocument,
      getAssemblyDefinition,
      getPartStudioMassProperties,
      getPartsMetadata,
      getAssemblyBoundingBoxes,
    });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    expect(res.status).toBe(200);

    // Called exactly once (not per-group/per-part), addressed via the
    // assembly's own server-derived documentId/workspaceId/elementId.
    expect(getAssemblyBoundingBoxes).toHaveBeenCalledTimes(1);
    expect(getAssemblyBoundingBoxes).toHaveBeenCalledWith("doc-1", "w", "ws-1", ASSEMBLY_ELEMENT_ID);

    const enrichedFacts = runAllSpy.mock.calls[0]?.[0] as Fact[];
    // ALL facts (not just FRAME_) carry the SAME whole-robot scalar (D-05).
    for (const f of enrichedFacts) {
      expect(f.robotMaxZWorld).toBe(0.5);
    }

    const heightVerdict = res.body.verdicts.find((v: { rule: string }) => v.rule === "R104");
    expect(heightVerdict.status).toBe("PASS");
    expect(heightVerdict.measuredCount).toBeCloseTo(0.5 * 39.37007874, 2);

    runAllSpy.mockRestore();
  });

  it("returns a distinct needsReconnect signal (not a 500, not a check-failure verdict) when the client throws ReconnectRequiredError", async () => {
    const getElementsInDocument = vi.fn().mockRejectedValue(new ReconnectRequiredError());

    const app = buildTestApp({ getElementsInDocument });

    const res = await request(app)
      .post("/api/check")
      .send({ documentId: "doc-1", workspaceId: "ws-1" });

    expect(res.status).not.toBe(500);
    expect(res.body.needsReconnect).toBe(true);
    expect(res.body.verdicts).toBeUndefined();
  });

  it("returns 400 when documentId/workspaceId are missing or malformed", async () => {
    const app = buildTestApp({});

    const res = await request(app).post("/api/check").send({});

    expect(res.status).toBe(400);
  });
});

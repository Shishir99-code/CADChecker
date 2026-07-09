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
        { path: ["inst-1"], transform: new Array(16).fill(0) },
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

  it("re-derives live context via getElementsInDocument on THIS request and returns 2 verdicts", async () => {
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

    expect(res.body.verdicts).toHaveLength(2);
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

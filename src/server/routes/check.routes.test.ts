import { describe, it, expect, vi } from "vitest";
import express, { type Express } from "express";
import session from "express-session";
import request from "supertest";
import { createCheckRouter } from "./check.routes.ts";
import { ReconnectRequiredError } from "../auth/refresh.ts";
import type { OnshapeClient } from "../onshape-client/client.ts";

const ASSEMBLY_ELEMENT_ID = "asm-element-1";

function stubElements() {
  return [
    { id: "ps-element-1", elementType: "PARTSTUDIO", name: "Part Studio 1" },
    { id: ASSEMBLY_ELEMENT_ID, elementType: "ASSEMBLY", name: "Main Assembly" },
  ];
}

function stubAssemblyDefinition() {
  return {
    rootAssembly: {
      instances: [
        { id: "inst-1", name: "FRAME_rail" },
        { id: "inst-2", name: "MECH_gearbox" },
      ],
      occurrences: [
        { path: ["inst-1"], transform: new Array(16).fill(0) },
        { path: ["inst-2"], transform: new Array(16).fill(0) },
      ],
    },
    subAssemblies: [],
  };
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

    const app = buildTestApp({ getElementsInDocument, getAssemblyDefinition });

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
      expect(verdict).toHaveProperty("measured");
      expect(verdict).toHaveProperty("pass");
    }
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

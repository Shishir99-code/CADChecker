import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { buildApp } from "./app.ts";

function testApp(panelDir?: string) {
  return buildApp({
    sessionOptions: {
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax" },
    },
    onshapeEnv: {
      clientID: "test-client-id",
      clientSecret: "test-client-secret",
      callbackURL: "https://example.test/auth/onshape/callback",
    },
    panelDir,
  });
}

describe("GET /healthz", () => {
  it("returns 200 with status ok (proves the Express app boots and serves)", async () => {
    const app = testApp();
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /auth/onshape", () => {
  it("redirects (302) to Onshape's authorize endpoint with a CSRF state parameter", async () => {
    const app = testApp();
    const res = await request(app).get("/auth/onshape");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/onshape\.com/);
    expect(res.headers.location).toMatch(/state=/);
  });

  it("sets an httpOnly session cookie on the initial request (state stored server-side)", async () => {
    const app = testApp();
    const res = await request(app).get("/auth/onshape");
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
    expect(cookieHeader).toMatch(/HttpOnly/i);
  });
});

describe("static panel mount does not shadow API/auth/health routes", () => {
  let panelDir: string;

  beforeAll(() => {
    panelDir = mkdtempSync(join(tmpdir(), "cadchecker-panel-"));
    writeFileSync(
      join(panelDir, "index.html"),
      "<!doctype html><title>CADChecker Panel</title>",
    );
  });

  afterAll(() => {
    rmSync(panelDir, { recursive: true, force: true });
  });

  it("GET /healthz still returns 200 JSON, not the panel HTML", async () => {
    const app = testApp(panelDir);
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /auth/onshape still redirects to Onshape (auth route wins over static)", async () => {
    const app = testApp(panelDir);
    const res = await request(app).get("/auth/onshape");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/onshape\.com/);
  });

  it("a non-existent API path is not served the panel index.html", async () => {
    const app = testApp(panelDir);
    const res = await request(app).get("/api/does-not-exist");
    expect(res.text).not.toContain("CADChecker Panel");
  });
});

describe("serves the built panel when a panel dir exists", () => {
  let panelDir: string;

  beforeAll(() => {
    panelDir = mkdtempSync(join(tmpdir(), "cadchecker-panel-"));
    writeFileSync(
      join(panelDir, "index.html"),
      "<!doctype html><title>CADChecker Panel</title>",
    );
  });

  afterAll(() => {
    rmSync(panelDir, { recursive: true, force: true });
  });

  it("GET / returns 200 with the panel index served", async () => {
    const app = testApp(panelDir);
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("CADChecker Panel");
  });

  it("GET /some/client/route falls back to the panel index (SPA fallback)", async () => {
    const app = testApp(panelDir);
    const res = await request(app).get("/some/client/route");
    expect(res.status).toBe(200);
    expect(res.text).toContain("CADChecker Panel");
  });
});

describe("no panel mount when panel dir is absent (dev/test default)", () => {
  it("boots and serves /healthz, but GET / 404s without a static mount or fallback", async () => {
    const nonexistentDir = join(tmpdir(), `cadchecker-nonexistent-${Date.now()}`);
    const app = testApp(nonexistentDir);

    const healthRes = await request(app).get("/healthz");
    expect(healthRes.status).toBe(200);

    const rootRes = await request(app).get("/");
    expect(rootRes.status).toBe(404);
  });
});

import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "./app.ts";

function testApp() {
  return buildApp({
    sessionOptions: {
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax" },
    },
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
    // RED at Task 1: no auth router is wired into buildApp() yet — this is the intended
    // failing end-to-end entry point for the auth slice. Task 2 wires passport-onshape's
    // OnshapeStrategy + authRouter and turns this GREEN.
    const app = testApp();
    const res = await request(app).get("/auth/onshape");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/onshape\.com/);
    expect(res.headers.location).toMatch(/state=/);
  });
});

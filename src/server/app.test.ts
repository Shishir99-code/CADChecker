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
    onshapeEnv: {
      clientID: "test-client-id",
      clientSecret: "test-client-secret",
      callbackURL: "https://example.test/auth/onshape/callback",
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

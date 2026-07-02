import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import session from "express-session";
import passport from "passport";
import request from "supertest";

/**
 * Regression guard for the OAuth session-loss bug (auth.routes.ts).
 *
 * Passport 0.6+ regenerates the session inside req.logIn() as session-fixation
 * protection. Our OAuth verify callback writes accessToken/refreshToken onto
 * req.session BEFORE req.logIn runs, so without `keepSessionInfo: true` those
 * tokens are wiped by regeneration and every later /api/check sees an empty
 * session (401 "Not authenticated") even though OAuth "succeeded". These tests
 * pin the behavior in both directions so the flag can't be dropped silently.
 */
function buildLoginTestApp(loginOptions: { keepSessionInfo: boolean }): Express {
  const app = express();
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, secure: false, sameSite: "lax" },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  passport.serializeUser((user, done) => done(null, user as { id: string }));
  passport.deserializeUser((user, done) => done(null, user as { id: string }));

  // Mirrors passport-config.ts + auth.routes.ts: tokens written to the session
  // in the "verify" step, THEN req.logIn (which regenerates the session).
  app.get("/login", (req, res, next) => {
    (req.session as unknown as { accessToken?: string }).accessToken = "tok-123";
    req.logIn({ id: "u1" }, loginOptions, (err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  app.get("/token", (req, res) => {
    res.json({ accessToken: (req.session as unknown as { accessToken?: string }).accessToken ?? null });
  });

  return app;
}

describe("OAuth login preserves session tokens across passport regeneration", () => {
  it("keepSessionInfo: true retains accessToken written before req.logIn", async () => {
    const agent = request.agent(buildLoginTestApp({ keepSessionInfo: true }));
    await agent.get("/login").expect(200);
    const res = await agent.get("/token").expect(200);
    expect(res.body.accessToken).toBe("tok-123");
  });

  it("without keepSessionInfo the token is wiped (documents why the flag is required)", async () => {
    const agent = request.agent(buildLoginTestApp({ keepSessionInfo: false }));
    await agent.get("/login").expect(200);
    const res = await agent.get("/token").expect(200);
    expect(res.body.accessToken).toBeNull();
  });
});

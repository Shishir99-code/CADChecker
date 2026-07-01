import express, { type Express } from "express";
import session, { type SessionOptions } from "express-session";
import passport from "passport";
import { configureOnshapeStrategy, type OnshapeOAuthEnv } from "./auth/passport-config.ts";
import { authRouter } from "./routes/auth.routes.ts";

export interface BuildAppOptions {
  /** express-session options; caller (index.ts) supplies the real secret/cookie config. */
  sessionOptions: SessionOptions;
  /**
   * Onshape OAuth client credentials. Optional so app.test.ts's /healthz-only
   * tests can build the app without requiring real Onshape env vars; when
   * omitted, the OAuth strategy/routes are not mounted.
   */
  onshapeEnv?: OnshapeOAuthEnv;
}

/**
 * Express app factory. Returns a configured app with:
 * - JSON body parsing
 * - session + passport middleware
 * - GET /healthz
 * - GET /auth/onshape and GET /auth/onshape/callback (when onshapeEnv is supplied)
 */
export function buildApp(options: BuildAppOptions): Express {
  const app = express();

  app.use(express.json());
  app.use(session(options.sessionOptions));
  app.use(passport.initialize());
  app.use(passport.session());

  if (options.onshapeEnv) {
    configureOnshapeStrategy(passport, options.onshapeEnv);
  }

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  if (options.onshapeEnv) {
    app.use(authRouter);
  }

  return app;
}

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

  // The app runs behind a TLS-terminating proxy in every deployed context:
  // ngrok -> Vite dev proxy -> Express in local dev, and Render's edge in prod.
  // Without trusting the proxy, Express sees req.secure === false over the
  // internal HTTP hop and express-session silently refuses to set the
  // `Secure` session cookie -- OAuth would "succeed" but the browser would
  // hold no session (RESEARCH Pitfall 2). Trusting X-Forwarded-Proto fixes it.
  app.set("trust proxy", 1);

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

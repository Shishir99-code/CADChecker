import express, { type Express } from "express";
import session, { type SessionOptions } from "express-session";
import passport from "passport";

export interface BuildAppOptions {
  /** express-session options; caller (index.ts) supplies the real secret/cookie config. */
  sessionOptions: SessionOptions;
  /** Optional hook to mount auth routes; kept injectable so app.test.ts can build the app
   * without requiring real Onshape OAuth env vars for the /healthz-only tests, and Task 2
   * wires the real strategy + router through this same seam. */
  configurePassport?: (passportInstance: typeof passport) => void;
  authRouter?: express.Router;
}

/**
 * Express app factory. Returns a configured app with:
 * - JSON body parsing
 * - session + passport middleware
 * - GET /healthz
 * - auth routes mounted (once supplied via options)
 */
export function buildApp(options: BuildAppOptions): Express {
  const app = express();

  app.use(express.json());
  app.use(session(options.sessionOptions));
  app.use(passport.initialize());
  app.use(passport.session());

  if (options.configurePassport) {
    options.configurePassport(passport);
  }

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  if (options.authRouter) {
    app.use(options.authRouter);
  }

  return app;
}

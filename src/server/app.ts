import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express, { type Express } from "express";
import session, { type SessionOptions } from "express-session";
import passport from "passport";
import { configureOnshapeStrategy, type OnshapeOAuthEnv } from "./auth/passport-config.ts";
import { authRouter } from "./routes/auth.routes.ts";
import { createCheckRouter } from "./routes/check.routes.ts";

// This module sits two levels below the repo root in BOTH dev (src/server/app.ts)
// and prod (dist/server/app.js), so resolving from __dirname (not process.cwd())
// lands on <repoRoot>/dist/panel in either context -- mirroring the repo-root
// idiom used by load-season.ts.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PANEL_DIR = join(__dirname, "..", "..", "dist", "panel");

export interface BuildAppOptions {
  /** express-session options; caller (index.ts) supplies the real secret/cookie config. */
  sessionOptions: SessionOptions;
  /**
   * Onshape OAuth client credentials. Optional so app.test.ts's /healthz-only
   * tests can build the app without requiring real Onshape env vars; when
   * omitted, the OAuth strategy/routes are not mounted.
   */
  onshapeEnv?: OnshapeOAuthEnv;
  /**
   * Overrides the resolved dist/panel directory. Used by tests to point at a
   * temp fixture directory; when omitted, defaults to DEFAULT_PANEL_DIR
   * (<repoRoot>/dist/panel).
   */
  panelDir?: string;
}

/**
 * Express app factory. Returns a configured app with:
 * - JSON body parsing
 * - session + passport middleware
 * - GET /healthz
 * - GET /auth/onshape and GET /auth/onshape/callback (when onshapeEnv is supplied)
 * - the built panel (static assets + SPA fallback), served from the same
 *   origin, when the panel directory exists (mounted after the routes above
 *   so it never shadows them)
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
    // POST /api/check needs only clientID/clientSecret (for token refresh);
    // OnshapeOAuthEnv is a structural superset (adds callbackURL), so it can
    // be passed directly.
    app.use(createCheckRouter({ onshapeEnv: options.onshapeEnv }));
  }

  // Serve the built panel from the same origin as /auth and /api so Render's
  // single-service deploy (no Vite in prod) doesn't 404 at GET /. Mounted
  // strictly after /healthz, /auth, and /api above, and guarded by existsSync
  // so dev/test without a build (the default here) boots unchanged.
  const panelDir = options.panelDir ?? DEFAULT_PANEL_DIR;
  if (existsSync(panelDir)) {
    app.use(express.static(panelDir));

    // Express 5 (path-to-regexp 8) throws on wildcard routes like app.get("*"),
    // so the SPA fallback is a plain middleware instead of a route pattern. It
    // only serves index.html for GET requests outside the /auth, /api, and
    // /healthz prefixes -- those are already mounted above, but excluding them
    // here keeps a genuine API 404 from being masked by the panel's HTML.
    app.use((req, res, next) => {
      if (
        req.method !== "GET" ||
        req.path.startsWith("/auth") ||
        req.path.startsWith("/api") ||
        req.path.startsWith("/healthz")
      ) {
        next();
        return;
      }
      res.sendFile(join(panelDir, "index.html"));
    });
  }

  return app;
}

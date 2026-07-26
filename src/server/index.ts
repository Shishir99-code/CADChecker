import "dotenv/config";
import { buildApp } from "./app.ts";
import { deriveSessionCookieOptions } from "./session-cookie.ts";
import { initializeDatabase } from "./db/client.ts";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ONSHAPE_CLIENT_ID = process.env.ONSHAPE_CLIENT_ID;
const ONSHAPE_CLIENT_SECRET = process.env.ONSHAPE_CLIENT_SECRET;
const ONSHAPE_REDIRECT_URI = process.env.ONSHAPE_REDIRECT_URI;

if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set. Copy .env.example to .env and generate a strong random value " +
      "(e.g. `openssl rand -hex 32`) — never use a hardcoded default.",
  );
}

if (!ONSHAPE_CLIENT_ID || !ONSHAPE_CLIENT_SECRET || !ONSHAPE_REDIRECT_URI) {
  throw new Error(
    "ONSHAPE_CLIENT_ID / ONSHAPE_CLIENT_SECRET / ONSHAPE_REDIRECT_URI are not set. Register an " +
      "OAuth application + Extension in the Onshape Developer Portal, then copy .env.example to " +
      ".env and fill in the real values.",
  );
}

const app = buildApp({
  sessionOptions: {
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // Env-aware: SameSite=None + Secure for https redirect URIs (required for the
    // session cookie to be sent from inside the cross-origin Onshape Element Tab
    // iframe -- RESEARCH Pitfall 2 / ASVS V3); relaxed to Lax + not-secure for
    // http://localhost dev so the browser actually sets the cookie locally. See
    // session-cookie.ts for the full rationale.
    cookie: deriveSessionCookieOptions(ONSHAPE_REDIRECT_URI),
  },
  onshapeEnv: {
    clientID: ONSHAPE_CLIENT_ID,
    clientSecret: ONSHAPE_CLIENT_SECRET,
    callbackURL: ONSHAPE_REDIRECT_URI,
  },
});

// Initialize database schema on startup (creates tables if they don't exist)
try {
  await initializeDatabase();
} catch (error) {
  console.error("Database initialization failed:", error);
  // Don't crash the server if DB init fails -- the app can still serve checks,
  // they just won't persist. Log loudly and continue.
}

app.listen(PORT, () => {
  console.log(`CADChecker server listening on port ${PORT}`);
});

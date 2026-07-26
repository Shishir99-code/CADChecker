import { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../../dist/server/app.js";
import { deriveSessionCookieOptions } from "../../dist/server/session-cookie.js";
import { initializeDatabase } from "../../dist/server/db/client.js";

// Initialize app and db once per container and reuse across invocations
let app: ReturnType<typeof buildApp> | null = null;
let dbInitialized = false;

async function initializeApp() {
  if (app) return app;

  const SESSION_SECRET = process.env.SESSION_SECRET;
  const ONSHAPE_CLIENT_ID = process.env.ONSHAPE_CLIENT_ID;
  const ONSHAPE_CLIENT_SECRET = process.env.ONSHAPE_CLIENT_SECRET;
  const ONSHAPE_REDIRECT_URI = process.env.ONSHAPE_REDIRECT_URI;

  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set");
  }

  if (!ONSHAPE_CLIENT_ID || !ONSHAPE_CLIENT_SECRET || !ONSHAPE_REDIRECT_URI) {
    throw new Error("Onshape OAuth credentials are not set");
  }

  // Initialize database schema on first invocation
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
    } catch (error) {
      console.error("Database initialization failed:", error);
      // Don't throw - app can still serve even if DB init fails
    }
  }

  app = buildApp({
    sessionOptions: {
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: deriveSessionCookieOptions(ONSHAPE_REDIRECT_URI),
    },
    onshapeEnv: {
      clientID: ONSHAPE_CLIENT_ID,
      clientSecret: ONSHAPE_CLIENT_SECRET,
      callbackURL: ONSHAPE_REDIRECT_URI,
    },
  });

  return app;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    const expressApp = await initializeApp();
    expressApp(req, res);
  } catch (error) {
    console.error("Error initializing app:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

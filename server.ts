import "dotenv/config";
import { buildApp } from "./dist/server/app.js";
import { deriveSessionCookieOptions } from "./dist/server/session-cookie.js";
import { initializeDatabase } from "./dist/server/db/client.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ONSHAPE_CLIENT_ID = process.env.ONSHAPE_CLIENT_ID;
const ONSHAPE_CLIENT_SECRET = process.env.ONSHAPE_CLIENT_SECRET;
const ONSHAPE_REDIRECT_URI = process.env.ONSHAPE_REDIRECT_URI;

if (!SESSION_SECRET || !ONSHAPE_CLIENT_ID || !ONSHAPE_CLIENT_SECRET || !ONSHAPE_REDIRECT_URI) {
  throw new Error("Missing required environment variables");
}

(async () => {
  try {
    await initializeDatabase();
    console.log("✓ Database initialized");
  } catch (error) {
    console.error("✗ Database initialization error:", error);
  }

  const app = buildApp({
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

  app.listen(PORT, () => {
    console.log(`✓ CADChecker server listening on port ${PORT}`);
  });
})();

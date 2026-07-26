import { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../../dist/server/app.js";
import { deriveSessionCookieOptions } from "../../dist/server/session-cookie.js";
import { initializeDatabase } from "../../dist/server/db/client.js";
import { readFileSync } from "fs";
import { join } from "path";

let app: ReturnType<typeof buildApp> | null = null;
let dbInitialized = false;
let panelHtml: string | null = null;

async function getApp() {
  if (app) return app;

  const SESSION_SECRET = process.env.SESSION_SECRET;
  const ONSHAPE_CLIENT_ID = process.env.ONSHAPE_CLIENT_ID;
  const ONSHAPE_CLIENT_SECRET = process.env.ONSHAPE_CLIENT_SECRET;
  const ONSHAPE_REDIRECT_URI = process.env.ONSHAPE_REDIRECT_URI;

  if (!SESSION_SECRET || !ONSHAPE_CLIENT_ID || !ONSHAPE_CLIENT_SECRET || !ONSHAPE_REDIRECT_URI) {
    throw new Error("Missing required environment variables");
  }

  if (!dbInitialized) {
    try {
      await initializeDatabase();
      console.log("✓ Database initialized");
      dbInitialized = true;
    } catch (error) {
      console.error("✗ Database error (continuing):", error);
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

function getPanelHtml() {
  if (panelHtml) return panelHtml;
  try {
    panelHtml = readFileSync(join(__dirname, "../../dist/panel/index.html"), "utf-8");
  } catch (error) {
    console.error("Failed to load panel HTML:", error);
    panelHtml = "<h1>CADChecker</h1><p>Failed to load frontend</p>";
  }
  return panelHtml;
}

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // API routes go to Express
    if (req.url?.startsWith("/api") || req.url?.startsWith("/auth")) {
      const expressApp = await getApp();
      return new Promise<void>((resolve) => {
        expressApp(req, res);
        res.on("finish", () => resolve());
      });
    }

    // Serve index.html for all other requests (SPA fallback)
    if (req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      return res.send(getPanelHtml());
    }

    res.status(404).json({ error: "Not Found" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

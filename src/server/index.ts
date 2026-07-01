import "dotenv/config";
import { buildApp } from "./app.ts";

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
    // SameSite=None + Secure is required for the session cookie to be sent from inside the
    // cross-origin Onshape Element Tab iframe (RESEARCH Pitfall 2 / ASVS V3).
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    },
  },
  onshapeEnv: {
    clientID: ONSHAPE_CLIENT_ID,
    clientSecret: ONSHAPE_CLIENT_SECRET,
    callbackURL: ONSHAPE_REDIRECT_URI,
  },
});

app.listen(PORT, () => {
  console.log(`CADChecker server listening on port ${PORT}`);
});

import "dotenv/config";
import { buildApp } from "./app.ts";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set. Copy .env.example to .env and generate a strong random value " +
      "(e.g. `openssl rand -hex 32`) — never use a hardcoded default.",
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
});

app.listen(PORT, () => {
  console.log(`CADChecker server listening on port ${PORT}`);
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/panel",
  build: {
    outDir: "../../dist/panel",
    emptyOutDir: true,
  },
  server: {
    // Bind to all interfaces (IPv4 + IPv6). ngrok forwards to `localhost:5173`,
    // which resolves to IPv4 127.0.0.1 first; on Node 17+ Vite's default
    // `localhost` bind lands on IPv6 `[::1]` only, so ngrok's IPv4 connection is
    // refused and the browser sees ERR_SSL_PROTOCOL_ERROR at the OAuth callback.
    // Listening on 0.0.0.0 makes 127.0.0.1:5173 reachable for the tunnel.
    host: true,
    // Single-origin dev: the ngrok HTTPS tunnel points at this Vite server,
    // which serves the panel and proxies the backend routes to Express (port
    // 3000). This makes the panel's relative /auth and /api calls, plus the
    // OAuth redirect URI (/auth/onshape/callback), all resolve through one
    // origin -- matching production embedding behavior (D-02).
    // Trailing slashes are REQUIRED so these prefixes don't swallow same-named
    // panel modules: a bare "/api" prefix also matches "/api.ts" (the panel's
    // own api module), which Vite would then wrongly forward to Express (404),
    // breaking the module graph and blanking the panel. "/api/" only matches
    // real backend routes like /api/check. Same reasoning for /auth/.
    proxy: {
      "/auth/": "http://localhost:3000",
      "/api/": "http://localhost:3000",
      "/healthz": "http://localhost:3000",
    },
    // Vite blocks requests whose Host header is not explicitly allowed. The
    // ngrok tunnel forwards its own hostname, so it must be permitted here.
    allowedHosts: [".ngrok-free.dev"],
  },
});

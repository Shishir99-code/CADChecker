# Deferred Items — Phase 02 (trustworthy-weight)

Out-of-scope discoveries logged during execution. NOT fixed by the plan that found them.

| Discovered In | Item | Notes |
|---------------|------|-------|
| 02-01 Task 1 | Pre-existing base-tsconfig type error in `src/server/auth/login-session.test.ts(36,29)`: `LogInOptions` now requires a `session` property, so `{ keepSessionInfo: true }` fails `npx tsc --noEmit` under the root `tsconfig.json`. | Present on HEAD before this plan; unrelated to Phase-2 changes. Server build (`tsc -p tsconfig.server.json`, used by `npm run build`) excludes `*.test.ts`, so the build stays clean. Fix by adding `session: true` to the passport `LogInOptions` in that test, tracked separately. |

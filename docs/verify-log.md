# Verify log

Chronological log of verification runs for the v5 runtime work. Append one row per full verification pass.

| Date (UTC) | Ref | Commands | Result |
| --- | --- | --- | --- |
| 2026-08-26 | zap-v5-session-c (Z3 CLI) | `npm run test:regression` (16 passed, 5 skipped), `npm run cli -- validate`, `npm run cli -- lint`, `npm test` (277 passed, 5 skipped), `npm run typecheck`, `npm run docs:sync`, `tests/no-platform-names.test.ts`, `tests/docs-sync.test.ts` | All green. `doctor --json` in a clean project reports `"payer": "missing"` and exits 0. No live provider calls were made; sandbox behavior verified only against the fake provider (`ZAP_ALLOW_FAKE_SANDBOX=1`); real Box/namespace/e2b providers are assumed to satisfy the `SandboxService` contract from `@wzrdtech/zap-runtime` and are surfaced as `SANDBOX_UNAVAILABLE` until mounted. |

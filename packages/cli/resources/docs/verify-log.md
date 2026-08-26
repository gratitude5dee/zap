# Verify log

Chronological log of verification runs for the v5 runtime work. Append one row per full verification pass.

| Date (UTC) | Ref | Commands | Result |
| --- | --- | --- | --- |
| 2026-08-26 | zap-v5-session-c (Z3 CLI) | `npm run test:regression` (16 passed, 5 skipped), `npm run cli -- validate`, `npm run cli -- lint`, `npm test` (277 passed, 5 skipped), `npm run typecheck`, `npm run docs:sync`, `tests/no-platform-names.test.ts`, `tests/docs-sync.test.ts` | All green. `doctor --json` in a clean project reports `"payer": "missing"` and exits 0. No live provider calls were made; sandbox behavior verified only against the fake provider (`ZAP_ALLOW_FAKE_SANDBOX=1`); real Box/namespace/e2b providers are assumed to satisfy the `SandboxService` contract from `@wzrdtech/zap-runtime` and are surfaced as `SANDBOX_UNAVAILABLE` until mounted. |
| 2026-08-26 | zap-v5-session-h | `npm run build:packages`, `npm run typecheck`, `npx vitest run packages/runtime/tests packages/cloud/tests tests/no-platform-names.test.ts` (81 passed), `npm run test:regression` (16 passed, 5 skipped) | Pass. Assumed provider facts: Thirdweb x402 facilitator authenticates with `x-secret-key` and exposes `verify`/`settle`; CDP facilitator uses bearer auth with the same `verify`/`settle` contract; x402 v2 uses `PAYMENT-SIGNATURE`/`PAYMENT-RESPONSE` and MPP uses `Authorization: Payment`/`Payment-Receipt` (per goal.md §4/§5 protocol tables — not independently verified against live facilitator endpoints; live payment tests remain opt-in). |
| 2026-08-26 | Z6 (session E: gateway + media FS + ffmpeg presets + harness.zap + zap-med) | `npm run typecheck`, `npm run test:regression`, `npm run cli -- validate`, `npm run cli -- lint`, `npm test` (68 files, 305 passed / 5 skipped), `npm run test:runtime` (5 files, 41 passed), `npm run cli -- doctor --json`, `npm run evals` (2 passed, 3 skipped, gates 10/10) | pass |

Provider facts assumed on 2026-08-26 (Z6, pending live verification — no live calls were made):

- Replicate: predictions API at `https://api.replicate.com/v1/models/{owner}/{name}/predictions` accepts a `Prefer: wait` header and an `Idempotency-Key` header; statuses are `starting | processing | succeeded | failed | canceled` (normalized to `queued | running | done | failed`). Evidence: Replicate HTTP API reference (docs read, not exercised live).
- Replicate model defaults chosen for `zap-med-genmedia`: `black-forest-labs/flux-dev` (image), `wan-video/wan-2.2-i2v-fast` (video), `minimax/speech-02-turbo` (speech); pricing rows seeded from the public model pages.
- xAI: OpenAI-compatible chat completions at `https://api.x.ai/v1` with `XAI_API_KEY`, models `grok-4*` (docs read, not exercised live).
- Open Interpreter overlay: native installer `https://www.openinterpreter.com/install`, `interpreter app-server --listen ws://127.0.0.1:9000`, MCP servers in `~/.openinterpreter/config.toml` `[mcp_servers]` (per locked brief; binary not installed in CI).
- fx overlay: installer `https://fx.sh/setup.sh`, config at `~/.fx/settings.json`, MCP at `~/.fx/mcp.json`, driven as `fx ask --json` (per locked brief; binary not installed in CI).

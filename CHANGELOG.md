# Changelog

## 5.0.0-alpha.0 — Unreleased

### Added

- Auth + pay (Z9): fail-closed payer resolution (`missing | byok | managed`), BYOK key resolution with log redaction, device auth and managed session keys stored `0600` with spend caps, a payment client that refuses charges above the cap, meter units/pricing/ledger/balances with daily caps, and the `pay/x402` plugin body.
- Zap Cloud (Z9): Hono control API (`/v1/runtimes`, exec, snapshot/fork, events, gateway proxy, `/v1/pay/quote`, meter ledger/balance, sweep, admin ops) with a payment gate settling x402 v2 and MPP through pluggable facilitators (Thirdweb, CDP) with replay protection, tenant isolation, rate limits, runtime-token gateway auth with token metering, a non-forceful sweeper, Vercel (default) and Cloudflare adapters, and a route-mounting convention for external modules.
- `zap pay` CLI commands (`status`, `login --managed`, `logout`, `quote`), the `/api/cloud/*` app route, and the Studio runtime panel.
- Gateway (Z6): `gateway.core` in `@wzrdtech/zap-runtime` with six LLM routes (`openrouter`, `gateway`, `openai`, `anthropic`, `xai`, `gmi`), media provider services with plan-only pricing and live-only idempotent submission, a deterministic router preserving 0.3.1 semantics, and a Replicate media adapter (`packages/providers/src/replicate.ts`).
- Media filesystem (Z6): content-addressed store at `/zap/media/<kind>/<sha[0:2]>/<sha>.<ext>` with zod-validated sidecars, filtered listing, and hardlinking into project directories (`docs/mediafs.md`).
- FFmpeg presets (Z6): data-defined presets (`transcode-h264`, `extract-audio`, `thumbnail`, `trim`, `scale-720p`, `stitch`, `overlay`, `gen-media-post`) with probe-based CPU-second estimates, executed only through the `ffmpeg` lane and recorded in the media FS.
- `harness.zap` (Z6): the in-VM step executor (plan-only tool planning, read-only execution, MCP and subagent dispatch) plus the caller-side `http-runs` driver, the `POST /v1/runs` + SSE agentd route, and the `interpreter`/`fx` med harness manifests.
- Med templates: `packages/templates/zap-med` (named snapshot base) with the `zap-med-genmedia` alias and `zap-med-interpreter`/`zap-med-fx` overlays, plus docs under `docs/templates/` and `docs/providers/`.
- Seven new workspaces for the composable CPU agent runtime: `@wzrdtech/zap-kernel`, `@wzrdtech/zap-sandbox`, `@wzrdtech/zap-memory`, `@wzrdtech/zap-runtime`, `@wzrdtech/zap-agent`, `@wzrdtech/zap-templates`, and `@wzrdtech/zap-cloud`.
- Kernel (Z1): plugin lifecycle with `definePlugin`/`createRuntime`, `ctx.effect` inverse disposers, fork/isolate contexts, service injection, event bus, and delta reconciliation, with the full acceptance test suite under `packages/kernel/tests/`.
- Typed contracts: sandbox provider/handle/lane contract, memory scopes/service, meter units, runtime spec schema, and the agents-as-code public API surface (`defineAgent`, hooks, connections, secrets).
- Canonical agents-as-code files under `agents/` plus `project.ts`, and the north-star compose fixture.
- Regression harness: `npm run test:regression` with frozen 0.3.1 CLI fixtures, output normalization, docs-snippet checks, and the platform-name denylist test.
- Sandbox (Z2): `sandboxCore` provider registry (Box default) with fake, local, docker, and Box adapters behind the shared conformance suite; Box client maps the reference methods 1:1 with `noEnv:true` on every create/fork, `Idempotency-Key` + SET-NX replay guard, `SandboxStartLimit` on 429, stop without force, post-resume hosted-token re-read, and confirmed-delete headers.
- Runtime (Z2): `zap-agentd` HTTP daemon (`0.0.0.0:8722`, bearer auth, `/v1/health|capabilities|exec|lane|files`), execution lanes with argv-only allowlists (exit 126 before spawn), Hyperlight wasm-lane docs and probes, and the redacting log sink (`packages/runtime/src/redact.ts`).
- Providers (Z4): namespace, selfhost, and microsandbox (pinned 0.6.15) adapters; environment profiles (`ubuntu`, `omarchy`, `macos`) in `packages/runtime/src/environments.ts`.
- Sandboxes + GPU (Z7): first-party `e2b`, `daytona`, and `cloudflare` adapters on the v5 contract (fake-backed conformance in CI, live variants opt-in); the `modal` GPU lane plugin (`purpose:"lane"` only, `gpu_second` pricing per class in `pricing.json`); the GPU lane dispatcher (`packages/runtime/src/lanes/gpu.ts`) that mounts modal only when `Runtime.md.lanes` declares `gpu:<class>` or a media step declares gpu; catalog stubs for Runpod, Blaxel, Freestyle, Orgo, Tensorlake, and Baseten (`acquire()` throws `CATALOG_STUB`, doctor rows `verified:false`); and the generated capability matrix in `docs/isolation.md` with drift checking (`scripts/generate-capability-matrix.mjs --check`).
- Eve bridge: v5 provider ids (`box`, `docker`, `namespace`, `selfhost`, `microsandbox`, `fake`) route through `@wzrdtech/zap-sandbox`; `box-legacy` keeps the previous SDK path.
- Templates and infra: `packages/templates/zap-light` (bake/doctor/systemd units), `env-omarchy` and `env-macos` (coming soon), `infra/box` build/verify scripts, `infra/namespace` (bridge, create-instance, zap-heavy image), `infra/self-host/setup.sh`, provider/template docs, and `docs/verify-log.md` with live Box evidence.

### Changed

- All `@wzrdtech/*` workspaces bumped to `5.0.0-alpha.0` with exact internal dependency pins; `build:packages` now builds in kernel-first dependency order; CI runs typecheck and regression before the main suite.

## 0.3.1 — 2026-07-13

### Fixed

- Traced `@asciidev/eve-box` and the alternate sandbox SDKs into the Eve Vercel function so Box-backed Studio turns can import their runtime in production.
- Deferred thirdweb's wallet-aware button until after hydration, eliminating React mismatch errors while keeping a stable header footprint.
- Rendered structured Zap API failures as actionable text instead of `[object Object]`.
- Made the signed-out header and signed-in Studio workspace responsive without clipped rails or horizontal overflow.

### Changed

- Published the CLI help and bundled troubleshooting guidance as `@wzrdtech/zap@0.3.1`; Node 24 remains required, project-local installs use `npm exec -- zap`, and a bare `zap` command requires a global install.

## 0.3.0 — 2026-07-10

### Added

- Optional thirdweb SIWE in the persistent header with HttpOnly Supabase sessions, Studio gating, and resumable `next=` navigation.
- Wallet-metered WZRD Cloud credentials with atomic Upstash reserve/settle caps; request BYOK and encrypted user-vault credentials remain supported.
- Authenticated Zap Studio authoring, CLI-parity validation, private Convex catalogs, template forks, hosted runs, and generated registry search shared by the web, API, and `zap search`.
- Sprite alpha: six-step sandbox/model/connections/connectors/social/channels manifest, Composio authorization, one-per-wallet Convex storage, and scoped Vercel deployment.
- Slack and Telegram through Vercel Chat SDK plus an HMAC/replay-protected iMessage bridge; one-use wallet links keep unlinked channels plan-only.
- ascii.dev Box is the default sandbox, with swappable Vercel, Daytona, E2B, Docker, and Eve-auto backends plus deterministic and opt-in hosted contract tests.
- Vercel AI Gateway default plus direct OpenAI, Anthropic, and OpenRouter routes; run ledgers record route and model.
- Eve evals, `/.agent`, `/.well-known/agent.json`, public plan and webhook URLs, and an empty protocols block reserved for the future Agent Commerce release.
- `@wzrdtech/zap-mcp` and compiled `@wzrdtech/agent` packages in the release graph.

### Security

- Private zaps, owner run history, Sprite records, asset lookups, and all Convex writes now require a synchronized server-only service token.
- Public Convex functions return only published zaps or sanitized run views; Studio data is wallet scoped through server APIs.
- Provider credential sources cannot mix, managed keys never reach clients, channel webhooks verify provider signatures, and one-time link codes are hashed and atomically consumed.
- Supabase-held managed provider keys are available through a constant-time, server-token-authenticated allow-list function with no browser CORS; sensitive Zap tables are removed from anonymous/authenticated GraphQL grants and pass the scoped Supabase advisors.

### Changed

- Eve is pinned to `0.22.4` and Node.js 24 is required.
- Next.js is updated to `16.2.10`; vulnerable `postcss`, `ws`, and `uuid` transitive versions are overridden with patched releases.
- Anonymous Studio navigation now stays on `/studio` and renders an in-place wallet sign-in gate instead of redirecting back to the landing page.
- Server-side thirdweb SIWE verification now prefers `THIRDWEB_SECRET_KEY` and can fall back to the public thirdweb client id when no server secret is provisioned.
- Convex remains the system of record, Upstash remains queue/idempotency/metering infrastructure, and Vercel-hosted Eve remains the production execution posture after the documented Convex-engine spike.

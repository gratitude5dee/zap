# Changelog

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

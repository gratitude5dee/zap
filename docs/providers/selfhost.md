# Self-host provider (zap-VM)

Run Zap lanes on your own KVM host (Hetzner or any bare-metal/nested-virt
box). Adapter: `packages/sandbox/src/adapters/selfhost/`; setup:
`infra/self-host/setup.sh`.

## What setup.sh installs

- microsandbox (pinned `0.6.15`) — microVM isolation for lanes.
- Optional Rust + `hyperlight-wasm` host — the `wasm` lane
  (`ZAP_BUILD_HYPERLIGHT=1`).
- Node 24 + `@wzrdtech/zap` + `@wzrdtech/zap-runtime`.
- `zap-agentd.service` on `0.0.0.0:8722` (systemd-confined; token loaded via
  a systemd credential, never written into the unit file).
- Caddy TLS in front; ufw allows 443 only.

## Auth and routes

Every request (except `GET /v1/health`) requires
`Authorization: Bearer <ZAP_SELFHOST_TOKEN>`. The adapter refuses to
construct without a token. Routes used: `/v1/health`, `/v1/exec`, `/v1/lane`,
`/v1/files`, `/v1/snapshot`. Filesystem access is rooted at `/zap/fs`.

Lane requests are argv-only (a shell string is rejected); disallowed binaries
return exit code 126 without executing. A dry-run lane request
(`POST /v1/lane {"dryRun": true}`) returns the argv and estimate without
executing.

Tests: `packages/sandbox/tests/selfhost.test.ts`; live conformance against a
real VPS is a manual workflow (see `docs/verify-log.md` items 6–7).

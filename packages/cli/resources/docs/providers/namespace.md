# Namespace provider

Namespace runs Zap runtimes as Linux container instances (the `zap-heavy`
image from `infra/namespace/Dockerfile.zap-heavy`) or native macOS
Apple-silicon instances (the `env-macos` environment). Adapter:
`packages/sandbox/src/adapters/namespace/`.

## Endpoints

- Compute: `https://compute.namespaceapis.com` (instance lifecycle).
- IAM: `https://iam.namespaceapis.com` — `IssueIngressAccessToken` mints the
  ingress token; the adapter caches it for 5 minutes.

## Auth model

Bridge requests carry BOTH headers, so neither token alone reaches the
instance:

- `x-nsc-ingress-auth: <ingress token>` — checked by the Namespace ingress.
- `X-Zap-Bridge-Token: <RUNTIME_TOKEN>` — checked by `zap-agentd` (Linux) or
  the control bridge `infra/namespace/bridge/bridge.py` (native macOS).

## Per-instance env

Every instance is created with `TENANT_ID`, `RUNTIME_ID`, and `RUNTIME_TOKEN`;
missing values fail before any request (tested in
`packages/sandbox/tests/namespace.test.ts`).

## Unverified RPCs

RPC shapes not yet confirmed by verify item 5 (see `docs/verify-log.md`) stay
behind the `allowUnverifiedRpcs` flag and are reported by `doctor()` as
`unverified` — never silently assumed.

## Operator flow

`infra/namespace/create-instance.ts` creates an instance, publishes 8722 with
ingress auth ON, and never prints the runtime token.

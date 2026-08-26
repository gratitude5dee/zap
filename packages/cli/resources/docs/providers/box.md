# Box provider

Box is Zap's default sandbox provider: full VMs with snapshots, fork,
stop/resume, hosted ports (public and private), desktop streaming, SSH, and
Docker inside. Adapter: `packages/sandbox/src/adapters/box/`.

## Capabilities

| capability | value |
| --- | --- |
| isolation | `vm` |
| snapshot / fork / stop / resume | yes |
| ports / privatePorts / desktop / ssh | yes |
| docker | yes |
| kvm / gpu | no |
| sizes | `small`, `default`, `large` |
| maxCommandSeconds | 600 (verify item 3) |

## Security rules (enforced in code, tested in `packages/sandbox/tests/box.test.ts`)

- Every create/fork body carries `noEnv: true` — a box never inherits the
  account's environment.
- Per-box env keys are restricted to the per-runtime allowlist: `TENANT_ID`,
  `RUNTIME_ID`, `RUNTIME_TOKEN`, `GATEWAY_URL`, `GATEWAY_TOKEN`,
  `ZAP_ENVIRONMENT`. Missing required keys fail before any HTTP request.
- Create/fork are idempotent: an `Idempotency-Key` header plus a SET-NX-style
  replay guard — three calls with the same key produce one request.
- `429` with code `start_limit_reached` or `rate_limited` maps to
  `SandboxStartLimit` with `retryAfterSeconds`.
- `stop` never sends `force`.
- Default TTL is 24 h and is re-applied on resume.
- After `resume()` the adapter re-reads every hosted port: hosted `_token`
  values rotate, and neither old nor new tokens ever reach the log (C24 —
  `packages/runtime/src/redact.ts`).

## Method map (1:1 with the reference client)

| reference client method | Zap adapter surface |
| --- | --- |
| `create` | `provider.acquire(spec)` |
| `createFromSnapshot` | `client.createFromSnapshot` / `acquire({ template })` |
| `fork` | `handle.fork(spec)` |
| `get` | `client.get` / `handle.state()` |
| `waitUntilReady` | `client.waitUntilReady` |
| `exec` | `handle.exec(cmd, opts)` |
| `execDetached` | `handle.exec(cmd, { detached: true })` |
| `events` | `client.events` |
| `readFile` / `writeFile` | `handle.fs.read` / `handle.fs.write` |
| `snapshot` | `handle.snapshot(name)` |
| `rename` (truncates to 120 chars) | `client.rename` |
| `stop` (never force) | `handle.stop()` / `handle.release()` |
| `resume` (re-reads hosted tokens) | `handle.resume()` |
| `remove` | `handle.remove()` |
| `desktop` | `handle.desktop()` |

## Templates and operator flows

- Default template: `zap-light` (`packages/templates/zap-light/`).
- Build a snapshot: `infra/box/build-template.sh <template>`.
- Verify a snapshot: `infra/box/verify-template.sh <template>`.
- Webhooks: `packages/sandbox/src/adapters/box/webhook.ts` (HMAC-SHA256,
  5-minute max age, state mapping).

`doctor()` reports whether `BOX_API_KEY` is configured without ever including
the key.

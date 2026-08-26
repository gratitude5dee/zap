# Auth

Zap separates **provider auth** (how a runtime talks to model providers) from
**payer auth** (who pays for usage — see `docs/pay.md`).

## BYOK

In `byok` mode (`ZAP_PAYER_MODE=byok`) the runtime resolves each provider key
in order:

1. Environment variable for the provider (for example `OPENROUTER_API_KEY`).
2. `.zap/credentials.json`.
3. Device-auth tokens in `.zap/device-auth.json`.
4. An injected vault resolver, when one is configured.

If nothing resolves, the run fails closed with `KEY_MISSING`. Every resolved key
is registered with the redaction layer, so it can never appear in logs, run
events, or `--json` output — any occurrence is replaced with `[redacted]`.

## Device auth

`deviceLogin` runs the provider's own device-auth flow (or accepts a key on
stdin for plain API-key providers) and writes the resulting token to
`.zap/device-auth.json` with file mode `0600`.

## Managed sessions

`zap pay login --managed` authenticates your wallet and issues a scoped session
key: a spend cap (default $5), a single target, and a 24-hour expiry. The record
is stored at `.zap/auth.json`, mode `0600`. Zap never holds your primary wallet
key — only the scoped session key, which cannot spend past its cap.

Auth files that are readable by group or world are rejected with
`AUTH_FILE_INSECURE`.

## Redaction

```ts
import { registerSecret, redactingLogger } from "@wzrdtech/zap-runtime";

registerSecret(apiKey);
const log = redactingLogger((line) => process.stdout.write(`${line}\n`));
```

Any registered secret is scrubbed from every line the logger emits.

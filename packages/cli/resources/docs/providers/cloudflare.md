# Cloudflare Sandbox

Container sandboxes on Cloudflare Workers via `@cloudflare/sandbox`.
First-party adapter: `packages/sandbox/src/adapters/cloudflare/index.ts`
(`sandbox.cloudflare` plugin).

- Isolation: **container** (Workers container platform).
- Lifecycle: `getSandbox(env.BINDING, id)` → `exec` → `createBackup()` is the
  snapshot primitive; `restoreBackup(id)` rehydrates a new sandbox from it.
  No stop/resume in the current SDK surface.
- Ports: `exposePort(port)` returns a public preview URL; no private ports.
- Pinned SDK: `@cloudflare/sandbox@0.4.3` (see `docs/verify-log.md`).

```ts
import { createCloudflareProvider } from "@wzrdtech/zap-sandbox/adapters/cloudflare";

const provider = createCloudflareProvider({
  binding: "SANDBOX", // wrangler.toml durable-object binding
  getSandbox: wireCloudflareSdk(env),
});
```

Doctor: `first-party`; `ok:false` without a binding or injected factory.
Live tests need the Cloudflare account from goal.md §3 and stay opt-in;
CI runs the fake-backed variant (`packages/sandbox/tests/adapters/cloudflare.test.ts`).

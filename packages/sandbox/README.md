# @wzrdtech/zap-sandbox

Sandbox provider contract and adapters for CPU-first agent runtimes. The Zap sandbox is the default: one isolated VM per tenant, created with `noEnv: true` and idempotency keys, stopped without `force`.

```bash
npm install @wzrdtech/zap-sandbox
```

Adapters (one shared contract):

- **First-party:** `box` (default), `namespace`, `selfhost`, `microsandbox`, `docker`, `e2b`, `daytona`, `cloudflare`, `modal` (GPU lanes), `local`, `fake` (tests)
- **Catalog stubs:** `runpod`, `blaxel`, `freestyle`, `orgo`, `tensorlake`, `baseten` — clearly labeled manifests, not runnable adapters

```ts
import { boxAdapter, e2bAdapter, CATALOG_MANIFESTS } from "@wzrdtech/zap-sandbox";
```

Every adapter exposes capability constants (e.g. `BOX_CAPABILITIES`, `MODAL_CAPABILITIES`) consumed by `zap doctor --json` and the capability matrix in the repo's `docs/isolation.md`. Provider keys never enter the sandbox environment — the gateway owns them.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

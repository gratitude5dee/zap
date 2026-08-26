# Daytona

Container sandboxes with snapshots and preview links. First-party adapter:
`packages/sandbox/src/adapters/daytona/index.ts` (`sandbox.daytona` plugin).

- Isolation: **container**.
- Lifecycle: create → run → `stop()`/`start()` keep the filesystem;
  `snapshot(name)` produces a reusable image.
- Ports: `getPreviewLink(port)` returns an HTTPS preview URL plus an access
  token. The token is server-side only and never logged (C24) — the adapter
  logs only the sandbox id and port.
- Pinned SDK: `@daytonaio/sdk@0.27.0` (see `docs/verify-log.md`).

```ts
import { createDaytonaProvider } from "@wzrdtech/zap-sandbox/adapters/daytona";

const provider = createDaytonaProvider({
  apiKey, // DAYTONA_API_KEY — injected by the composition, never process.env
  createSandbox: wireDaytonaSdk(apiKey),
});
```

Doctor: `first-party`; `ok:false` without an API key or injected factory.
Live conformance is opt-in (`RUN_HOSTED_SANDBOX_TESTS=1` + `DAYTONA_API_KEY`);
CI runs the fake-backed variant (`packages/sandbox/tests/adapters/daytona.test.ts`).

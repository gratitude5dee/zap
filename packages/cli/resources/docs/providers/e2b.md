# E2B

Firecracker microVM sandboxes. First-party adapter:
`packages/sandbox/src/adapters/e2b/index.ts` (`sandbox.e2b` plugin).

- Isolation: **microvm** (Firecracker).
- Lifecycle: `Sandbox.create` → run → `pause()` (stop) → `Sandbox.connect(id)`
  (resume). `pause` also backs `snapshot()`: it persists the filesystem and
  returns a resumable sandbox id.
- Ports: `getHost(port)` returns a public HTTPS host; no private ports.
- Pinned SDK: `e2b@2.6.4` (see `docs/verify-log.md`).

```ts
import { createE2BProvider } from "@wzrdtech/zap-sandbox/adapters/e2b";

const provider = createE2BProvider({
  apiKey, // E2B_API_KEY — injected by the composition, never process.env
  createSandbox: wireE2BSdk(apiKey),
  connectSandbox: (id) => connectE2BSdk(apiKey, id),
});
```

Doctor: `first-party`; `ok:false` without an API key or injected factory.
Live conformance is opt-in: `RUN_HOSTED_SANDBOX_TESTS=1` + `E2B_API_KEY`;
CI runs the fake-backed variant (`packages/sandbox/tests/adapters/e2b.test.ts`).

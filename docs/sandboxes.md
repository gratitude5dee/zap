# Sandbox Backends

`ZAP_SANDBOX_BACKEND` selects execution without changing a recipe or tool:

- `box` via `@asciidev/eve-box` (default everywhere, including the Vercel-hosted app)
- `vercel` via Vercel Sandbox
- `daytona` via `@daytonaio/sdk`
- `e2b` via `e2b`
- `docker` for local development
- `auto` for Eve's availability-aware default

Vendor SDKs load lazily only after selection. When `ZAP_SANDBOX_BACKEND` is omitted, Zap selects Box. Box uses `BOX_API_KEY` directly or resolves the allow-listed key from the server-authenticated Supabase managed-secret bridge; Daytona uses `DAYTONA_API_KEY`, and E2B uses `E2B_API_KEY`; Vercel uses the deployment OIDC token or a Vercel token. Sessions share the same Eve contract for command execution, byte/text files, process spawning, removal, path anchoring, state capture, and supported network policies.

The deterministic contract suite runs on every CI job with an in-memory driver and exposes opt-in live cases for every hosted backend:

```bash
npm run test:sandboxes
RUN_HOSTED_SANDBOX_TESTS=1 npm run test:sandboxes
RUN_LOCAL_SANDBOX_TESTS=1 npm run test:sandboxes
```

Live cases skip individually when their credential is absent, so CI never creates paid infrastructure by accident.

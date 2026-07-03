# Providers

Zap separates recipe planning from provider execution.

Provider priority for v1:

- `mock`: deterministic zero-cost outputs for docs, tests, and unauthenticated demos.
- `gmi`: primary live image/video provider path.
- `fal`: secondary live provider path.
- `runware`, `prodia`, `openrouter`, `ai_gateway`: BYOK-ready secret types.

Provider keys are never required for mock runs:

```bash
ZAP_PROVIDER=mock npx @zap-md/cli run world-cup-entrance --json
```

Live runs require explicit approval:

```bash
npx @zap-md/cli run world-cup-entrance --live --input SELFIE=./selfie.png
```

Web live runs require wallet auth and user-owned provider keys stored in Supabase:

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_key`
- `openrouter_key`
- `ai_gateway_api_key`

Provider adapters must return run-safe metadata: ids, status, URLs, cost, and errors. They should not return large media blobs to the agent context.

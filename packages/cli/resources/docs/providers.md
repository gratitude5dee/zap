# Providers

Zap separates recipe planning from provider execution.

Production providers for v0.2.0:

- `gmi`: GMI Cloud video generation through the request queue API.
- `fal`: fal queue-backed image, video, and audio generation.
- `prodia`: Prodia async image jobs using `/v2/job`.
- `runware`: Runware async image jobs using `getResponse` polling.
- Judge scoring uses AI Gateway via `AI_GATEWAY_API_KEY` and optional
  `ZAP_JUDGE_MODEL`; without a key, Zap records deterministic `heuristic`
  feedback instead of labeling the score as VLM-backed.

Provider keys are never required for plan-only runs:

```bash
npx @wzrdtech/zap@0.2.0 run world-cup-entrance --json
```

Live runs require explicit approval:

```bash
npx @wzrdtech/zap@0.2.0 run world-cup-entrance --live --input SELFIE=./selfie.png
```

Web live runs require wallet auth and user-owned provider keys stored in Supabase:

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_token`
- `openrouter_key`
- `ai_gateway_api_key`

Provider adapters must return run-safe metadata: ids, status, URLs, cost, and errors. They should not return large media blobs to the agent context.

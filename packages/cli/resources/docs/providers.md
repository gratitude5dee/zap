# Providers

Zap separates recipe planning from provider execution.

Production providers for v0.3.0:

- `aws`: Amazon Bedrock Nova Canvas image generation and Nova Reel async video generation.
- `gmi`: GMI Cloud video generation through the request queue API.
- `fal`: fal queue-backed image, video, and audio generation.
- `prodia`: Prodia async image jobs using `/v2/job`.
- `runware`: Runware async image jobs using `getResponse` polling.
- `vertex`: Google Vertex AI Imagen 4 image generation and Veo 3.1 async video generation.
- Agent and judge LLM traffic defaults to Vercel AI Gateway and can switch to OpenAI, Anthropic, or OpenRouter with `ZAP_LLM_ROUTE`. Media provider selection stays orthogonal.
- Judge scoring uses the selected LLM route and optional `ZAP_JUDGE_MODEL`; without a key, Zap records deterministic `heuristic`
  feedback instead of labeling the score as VLM-backed.
- Aura scoring uses AI Gateway via `AI_GATEWAY_API_KEY` and optional
  `ZAP_AURA_MODEL`; deterministic fallback is labeled `heuristic`.

Provider keys are never required for plan-only runs:

```bash
npx @wzrdtech/zap@0.3.1 run world-cup-entrance --json
```

Live runs require explicit approval:

```bash
npx @wzrdtech/zap@0.3.1 run world-cup-entrance --live --input SELFIE=./selfie.png
```

Web live runs can use request BYOK or user-owned provider keys stored in Supabase. A signed-in wallet may instead select WZRD Cloud, which first reads the server-only `WZRD_CLOUD_PROVIDER_KEYS` bundle and then falls back to the custom-authenticated Supabase `zap-managed-provider-secrets` function. Both paths atomically reserve and settle spend against `WZRD_CLOUD_DAILY_CAP_USD` in Upstash before provider submission.

User vault secret names:

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_token`
- `vertex_project`
- `vertex_location`
- `vertex_api_key` or `vertex_service_account`
- `vertex_output_gcs_uri`
- `aws_access_key_id`
- `aws_secret_access_key`
- `aws_session_token`
- `aws_region`
- `aws_s3_output_uri`
- `openrouter_key`
- `ai_gateway_api_key`

Provider adapters must return run-safe metadata: ids, status, URLs, cost, and errors. They should not return large media blobs to the agent context.

Credential material is isolated per call. Zap never combines a user vault credential with a managed WZRD credential, and ledger rows record the credential mode, wallet principal, LLM route, and model.

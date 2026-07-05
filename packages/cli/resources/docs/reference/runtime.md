# Runtime

Zap separates planning from provider execution.

- Convex stores runs, steps, assets, feedback, and cron logs.
- Upstash stores idempotency keys and provider poll queues.
- Provider adapters submit generation requests and poll status.
- Plan-only runs return quotes and step metadata without submitting provider jobs.
- The poll drain endpoint consumes Upstash jobs and updates Convex when configured.
- Live BYOK runs can reveal provider keys from Supabase only with the user's JWT and the server reveal token.
- Explicit `stitch.engine: hyperframes` steps generate a temporary HyperFrames project, write a Zap visual identity, run `lint`, `validate`, and `inspect`, render with `npx hyperframes render`, and persist the result to Blob when configured.
- If HyperFrames is unavailable or a generated composition check fails, the runtime records the error on the local step and falls back to the first resolved stitch asset.

Live provider spend requires an explicit `live` flag in the API or `--live` in the CLI. Web API live runs also require a wallet-authenticated Supabase bearer token; public creator demos stay plan-only and zero-spend.

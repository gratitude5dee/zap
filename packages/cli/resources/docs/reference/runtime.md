# Runtime

Zap separates planning from provider execution.

- Convex stores runs, steps, assets, feedback, and cron logs.
- Upstash stores idempotency keys and provider poll queues.
- Provider adapters submit generation requests and poll status.
- The mock provider returns deterministic zero-cost outputs for demos and tests.
- The poll drain endpoint consumes Upstash jobs and updates Convex when configured.
- Live BYOK runs can reveal provider keys from Supabase only with the user's JWT and the server reveal token.

Live provider spend requires an explicit `live` flag in the API or `--live` in the CLI.

# Convex

Convex is the source of truth for live Zap runtime state.

Tables:

- `zaps`: installed and discoverable recipe metadata.
- `runs`: run status, creator input summary, budget, and provider mode.
- `steps`: ordered pipeline step state.
- `assets`: generated images, clips, audio, and stitched outputs.
- `feedback`: creator ratings, RLHF notes, and eval signals.
- `cronLogs`: poller and drain execution logs.
- `sprites`: one private Sprite manifest and deployment record per wallet.

Security posture:

- Public Convex functions expose only published public zaps and sanitized run views addressed by an unguessable run id.
- Owner catalogs, run history, Sprite records, asset lookup, and every write require `ZAP_CONVEX_SERVICE_TOKEN`; that token exists only in Vercel and Convex server environments.
- Studio APIs verify a Supabase wallet session before making privileged Convex calls and scope results to that wallet principal.

Runtime flow:

```text
POST /api/zaps/run
  -> validate Zap.md
  -> create run + steps
  -> submit provider job
  -> enqueue Upstash poll job
  -> drain endpoint polls provider
  -> update Convex idempotently
```

Local checks:

```bash
npm run convex:codegen
npm run eve:info
```

Mock CLI runs do not require Convex. Web live runs do.

## Eve-on-Convex execution spike

The v0.3.0 spike evaluated Adam's `world-convex` pattern: compile Eve, vendor the workflow bundle into a `"use node"` Convex action, map queue work to scheduled mutations, and tail streams through reactive queries.

Decision: **no-go as the v0.3.0 default; retain as a 0.3.x experiment behind `ZAP_EXECUTION_MODE=convex`.** Vercel-hosted Eve remains production because it already satisfies provider webhook callbacks and streaming, while the Convex variant adds a bundled-engine cold start, requires a durable callback handoff for long provider jobs, and duplicates the proven Eve stream path. The option becomes a go when its p95 cold start is no worse than the Vercel route, provider callbacks resume an interrupted action without duplicate spend, and the run rail tails token/tool events without polling regressions.

Upstash remains the idempotency, metering, and provider-poll queue layer in both modes; Convex remains the system of record.

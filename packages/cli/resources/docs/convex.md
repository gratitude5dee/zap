# Convex

Convex is the source of truth for live Zap runtime state.

Tables:

- `zaps`: installed and discoverable recipe metadata.
- `runs`: run status, creator input summary, budget, and provider mode.
- `steps`: ordered pipeline step state.
- `assets`: generated images, clips, audio, and stitched outputs.
- `feedback`: creator ratings, RLHF notes, and eval signals.
- `cronLogs`: poller and drain execution logs.

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

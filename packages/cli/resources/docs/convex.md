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

The v0.3.1 spike evaluates Adam's `world-convex` pattern: compile Eve,
vendor the workflow bundle, invoke the workflow handler from a `"use node"`
Convex action, schedule queue delivery with Convex mutations, and expose
workflow streams through reactive queries.

Decision: **NO-GO for the Zap runtime in v0.3.1. Vercel-hosted Eve remains
the production default.** `ZAP_EXECUTION_MODE=convex` selects the executable
assessment only; the application deliberately does not dispatch production
runs to an incomplete backend.

The measured probe is in `experiments/world-convex/`. On 2026-07-12 it ran
with Node 24.14.0, Zap's Eve 0.22.4 bundle, and the Adam input's Eve 0.22.0
bundle. Nine isolated samples produced this result:

| Gate | Result | Evidence |
| --- | --- | --- |
| Structural `world-convex` wiring | Pass | The input selects `world-convex`, includes it in the vendored Eve artifact, and calls the workflow `POST` handler from a Convex Node action. |
| Cold-start lower-bound proxy | Fail | Fresh-process p95 was 139.82 ms for the Zap/Vercel artifact and 173.89 ms for the Adam/world-convex artifact (1.244x). This measures process start plus module import, not Convex Cloud scheduling, so it cannot establish a production p95 by itself. |
| Provider-webhook compatibility | Fail | Zap declares `/providers/:provider/webhook`; the evaluated Convex HTTP router does not expose or authenticate a bridge to it. Provider completion therefore cannot prove interruption-safe resume or exactly-once spend. |
| Stream tailing in Zap's run rail | Fail | Adam provides a reactive `sessionEvents` query, but Zap's run rail does not consume the workflow-world stream or map it to Zap run/step ownership. |
| Convex Cloud bundle loading | Fail | The runner dynamically imports a checkout-local `EVE_BUNDLE_PATH`. That works with local Convex development and is not present in Convex Cloud actions. |

Reproduce the report after building Zap's Eve artifact:

```bash
npm run eve:build
ZAP_EXECUTION_MODE=convex node experiments/world-convex/run-spike.mjs \
  --samples 9 \
  --output experiments/world-convex/results/latest.json
node --test experiments/world-convex/probe.test.mjs
```

Promotion requires all of the following, measured against the same Zap agent
and an actual Convex Cloud deployment:

1. Ship the Eve artifact as a cloud-loadable Node external/package; no local
   filesystem path.
2. Add an authenticated provider-callback HTTP action that preserves Zap's
   Upstash idempotency keys and resumes after an interrupted action without
   duplicate provider spend.
3. Map world run/step/stream identifiers to Zap's owner-scoped Convex records,
   then subscribe the Studio run rail to those reactive updates.
4. Record at least 50 cold invocations of both equivalent deployed paths;
   world-convex p95 must be no slower than the Vercel path.
5. Pass a live provider callback replay and stream-tail acceptance test.

Upstash remains Zap's provider poll queue, idempotency, rate-limit, and
metering layer under either posture. Convex remains the application system of
record. The experiment's internal workflow delivery queue does not authorize
replacing those production responsibilities.

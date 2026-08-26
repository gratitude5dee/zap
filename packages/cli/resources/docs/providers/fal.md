# fal

Generative-media provider `fal`: image and video models behind fal's queue API
(`fal-ai/flux/dev` is the image default in `zap-med-genmedia`).

## Env vars

- `FAL_KEY` — required for live generation (BYOK).

## Compose

```ts
gateway.media("fal", { model: "fal-ai/flux/dev" })
```

## Capability row (`doctor --json`)

`{ "provider": "fal", "kind": "media", "capabilities": ["image.gen", "video.gen"], "key": "FAL_KEY" }`

Plan-only quotes come from the local rate table; submissions are idempotent
(deterministic `runId`/`stepId` idempotency keys). See `docs/verify-log.md`.

# Replicate

Generative-media provider `replicate`: image, video, and speech models with
slash-qualified ids (`black-forest-labs/flux-dev`, `wan-video/wan-2.2-i2v-fast`,
`minimax/speech-02-turbo`). Added in v5 as an additive provider enum member;
the adapter lives in `packages/providers/src/replicate.ts`.

## Env vars

- `REPLICATE_API_TOKEN` — required for live generation (BYOK).

## Compose

```ts
gateway.media("replicate", { model: "black-forest-labs/flux-dev" })
```

## Capability row (`doctor --json`)

`{ "provider": "replicate", "kind": "media", "capabilities": ["image.gen", "video.gen", "audio.gen"], "key": "REPLICATE_API_TOKEN" }`

Submissions send an `Idempotency-Key` derived deterministically from
`runId`/`stepId`; prediction statuses normalize to
`queued | running | done | failed`. Plan-only quotes come from the local rate
table; live calls with an unpriced model fail with `PRICE_UNKNOWN`.
See `docs/verify-log.md`.

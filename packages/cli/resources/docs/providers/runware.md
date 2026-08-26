# Runware

Generative-media provider `runware`: image generation with AIR model ids
(`runware:100@1`).

## Env vars

- `RUNWARE_API_KEY` — required for live generation (BYOK).

## Compose

```ts
gateway.media("runware", { model: "runware:100@1" })
```

## Capability row (`doctor --json`)

`{ "provider": "runware", "kind": "media", "capabilities": ["image.gen"], "key": "RUNWARE_API_KEY" }`

Plan-only quotes come from the local rate table; submissions are idempotent.
See `docs/verify-log.md`.

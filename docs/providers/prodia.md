# Prodia

Generative-media provider `prodia`: fast, low-cost image generation.

## Env vars

- `PRODIA_API_KEY` — required for live generation (BYOK).

## Compose

```ts
gateway.media("prodia", { model: "prodia/sdxl" })
```

## Capability row (`doctor --json`)

`{ "provider": "prodia", "kind": "media", "capabilities": ["image.gen"], "key": "PRODIA_API_KEY" }`

Plan-only quotes come from the local rate table; submissions are idempotent.
See `docs/verify-log.md`.

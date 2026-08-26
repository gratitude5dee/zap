# Google Vertex AI

Generative-media provider `vertex`: Imagen image generation
(`imagen-4.0-generate-001`) and Veo video on Google Cloud.

## Env vars

- `GOOGLE_APPLICATION_CREDENTIALS` / `VERTEX_PROJECT_ID` — required for live
  generation (BYOK service account).

## Compose

```ts
gateway.media("vertex", { model: "imagen-4.0-generate-001" })
```

## Capability row (`doctor --json`)

`{ "provider": "vertex", "kind": "media", "capabilities": ["image.gen", "video.gen"], "key": "GOOGLE_APPLICATION_CREDENTIALS" }`

Plan-only quotes come from the local rate table; submissions are idempotent.
See `docs/verify-log.md`.

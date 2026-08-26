# AWS Bedrock

Generative-media provider `aws`: Amazon Bedrock media models
(`amazon.nova-canvas-v1:0` for images, Nova Reel for video).

## Env vars

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — required for
  live generation (BYOK).

## Compose

```ts
gateway.media("aws", { model: "amazon.nova-canvas-v1:0" })
```

## Capability row (`doctor --json`)

`{ "provider": "aws", "kind": "media", "capabilities": ["image.gen", "video.gen"], "key": "AWS_ACCESS_KEY_ID" }`

Plan-only quotes come from the local rate table; submissions are idempotent.
See `docs/verify-log.md`.

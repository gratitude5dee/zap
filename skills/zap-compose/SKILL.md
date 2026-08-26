---
name: zap-compose
description: Compose a Zap runtime from plugins - sandbox, memory, gateway, harness, payer, channels, and skills.
version: 5.0.0-alpha
metadata:
  zap:
    weight: light
---

# zap-compose

Use this skill when authoring `Runtime.md` or `zap.config.ts`.

## Rules

- A runtime is composed from plugins: `sandbox.*`, `memory.*`, `gateway.*`, `harness.*`, `pay.*`, `channels.*`, `skills.*`, `apistore.*`.
- `zap compose [file] --dry-run --json` resolves the plugin tree without side effects; run it before `zap runtime up`.
- Every plugin registration must have inverse cleanup; plugins use `ctx.effect` and `ctx.provide`.
- Pick the smallest weight that fits: `light`, `med`, or `heavy`. Harness manifests declare `minWeight`.
- Secrets are referenced by env var name in composed config; never inline a secret value in `Runtime.md`, `zap.config.ts`, or generated fragments.
- API-store plugins (`apistore.context7`, `apistore.open-connector`, `apistore.composio`) attach catalog APIs; see `docs/catalog.md`.

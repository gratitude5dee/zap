# zap-providers

Use this skill when editing provider adapters or runtime polling.

## Contract

- Provider submission must be idempotent.
- Upstash poll jobs must include provider, request id, run id, step id, attempts, and timestamp.
- Exhausted jobs move to `zap:poll:dead`.
- Mock provider support must stay available for docs, tests, and unauthenticated demos.

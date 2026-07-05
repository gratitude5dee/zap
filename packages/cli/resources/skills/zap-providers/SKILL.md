# zap-providers

Use this skill when editing provider adapters or runtime polling.

## Contract

- Provider submission must be idempotent.
- Upstash poll jobs must include provider, request id, run id, step id, attempts, and timestamp.
- Exhausted jobs move to `zap:poll:dead`.
- Test fakes must stay isolated to transport fixtures; production providers are GMI, fal, Prodia, and Runware.

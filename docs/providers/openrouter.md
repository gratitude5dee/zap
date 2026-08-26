# OpenRouter

LLM route `openrouter`: one API key for many chat models, OpenAI-compatible
wire format, provider-prefixed model ids (`anthropic/claude-sonnet-4.6`).

## Env vars

- `OPENROUTER_API_KEY` — required for live calls (BYOK).
- `ZAP_LLM_OPENROUTER_MODEL` — optional model override.

## Compose

```ts
gateway.llm("openrouter", { model: "anthropic/claude-sonnet-4.6" })
```

## Capability row (`doctor --json`)

`{ "route": "openrouter", "kind": "llm", "flavor": "openai", "key": "OPENROUTER_API_KEY" }`

Plan-only runs never contact OpenRouter; a missing key fails closed with
`KEY_MISSING` before any request. See `docs/verify-log.md`.

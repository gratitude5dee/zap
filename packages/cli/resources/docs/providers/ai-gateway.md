# Vercel AI Gateway

LLM route `gateway` (the route id is kept from 0.3.1): Vercel's AI Gateway,
OpenAI-compatible wire format at `https://ai-gateway.vercel.sh/v1`, with
provider-prefixed model ids.

## Env vars

- `AI_GATEWAY_API_KEY` — required for live calls (BYOK).
- `ZAP_LLM_GATEWAY_MODEL` — optional model override.

## Compose

```ts
gateway.llm("gateway", { model: "anthropic/claude-sonnet-4.6" })
```

## Capability row (`doctor --json`)

`{ "route": "gateway", "kind": "llm", "flavor": "openai", "key": "AI_GATEWAY_API_KEY" }`

Plan-only runs never contact the gateway; a missing key fails closed with
`KEY_MISSING` before any request. See `docs/verify-log.md`.

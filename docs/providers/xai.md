# xAI

LLM route `xai`: xAI's OpenAI-compatible API, models `grok-4*`.

## Env vars

- `XAI_API_KEY` — required for live calls (BYOK).
- `ZAP_LLM_XAI_MODEL` — optional model override.

## Compose

```ts
gateway.llm("xai", { model: "grok-4" })
```

## Capability row (`doctor --json`)

`{ "route": "xai", "kind": "llm", "flavor": "openai", "key": "XAI_API_KEY" }`

Plan-only runs never contact xAI; a missing key fails closed with
`KEY_MISSING` before any request. See `docs/verify-log.md`.

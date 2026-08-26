# OpenAI

LLM route `openai`: direct OpenAI API. Model ids are bare (`gpt-5.4`);
provider-prefixed ids are rejected with `UNKNOWN_MODEL` on this route.

## Env vars

- `OPENAI_API_KEY` — required for live calls (BYOK or `codex` device auth).
- `ZAP_LLM_OPENAI_MODEL` — optional model override.

## Compose

```ts
gateway.llm("openai", { model: "gpt-5.4" })
```

## Capability row (`doctor --json`)

`{ "route": "openai", "kind": "llm", "flavor": "openai", "key": "OPENAI_API_KEY" }`

Plan-only runs never contact OpenAI; a missing key fails closed with
`KEY_MISSING` before any request. See `docs/verify-log.md`.

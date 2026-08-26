# Anthropic

LLM route `anthropic`: direct Anthropic API (Messages wire format). Model ids
are bare (`claude-sonnet-4.6`); provider-prefixed ids are rejected with
`UNKNOWN_MODEL` on this route.

## Env vars

- `ANTHROPIC_API_KEY` — required for live calls (BYOK or `claude-code` device
  auth via `CLAUDE_CODE_OAUTH_TOKEN`).
- `ZAP_LLM_ANTHROPIC_MODEL` — optional model override.

## Compose

```ts
gateway.llm("anthropic", { model: "claude-sonnet-4.6" })
```

## Capability row (`doctor --json`)

`{ "route": "anthropic", "kind": "llm", "flavor": "anthropic", "key": "ANTHROPIC_API_KEY" }`

Plan-only runs never contact Anthropic; a missing key fails closed with
`KEY_MISSING` before any request. See `docs/verify-log.md`.

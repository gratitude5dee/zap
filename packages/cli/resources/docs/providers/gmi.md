# GMI

Dual-role provider: LLM route `gmi` (OpenAI-compatible) and the default
generative-media provider for video (`seedance-2-0-260128`) and speech.

## Env vars

- `GMI_API_KEY` — required for live calls (BYOK).
- `ZAP_LLM_GMI_MODEL` — optional LLM model override.
- `GMI_SEEDANCE_FAST_USD_PER_SECOND` — operator-supplied rate for
  `seedance-2-0-fast-260128`; without it that model cannot be planned
  (`UNKNOWN_MODEL`).

## Compose

```ts
gateway.llm("gmi", { model: "gmi-default" })
gateway.media("gmi", { model: "seedance-2-0-260128" })
```

## Capability row (`doctor --json`)

`{ "provider": "gmi", "kind": "media", "capabilities": ["video.gen", "audio.gen"], "key": "GMI_API_KEY" }`

Plan-only quotes are computed from the local rate table; live calls with an
unpriced model fail with `PRICE_UNKNOWN`. See `docs/verify-log.md`.

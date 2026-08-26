# harness: openclaw

Gateway on port 18789 (private). Runs are driven through its OpenAI-compatible endpoint (`openai-compat`); managed mode sets `models.providers.zap.baseUrl` in the rendered JSON config.

| field | value |
| --- | --- |
| run adapter | `openai-compat` |
| min weight | `heavy` |
| template | zap-heavy-openclaw (named snapshot) |
| ports | 18789 (api, private) |
| pins | `openclaw@1.2.0` |
| units | `openclaw-gateway.service` |
| state dirs | `~/.openclaw` |
| MCP config | `~/.openclaw/openclaw.json` (json5) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok) |
| managed gateway | `models.providers.zap.baseUrl` in `~/.openclaw/openclaw.json` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `discord`, `telegram`, `slack`, `whatsapp`, `signal`, `email` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

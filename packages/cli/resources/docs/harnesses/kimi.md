# harness: kimi

HTTP runs against its local server on port 58627 (private).

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `heavy` |
| template | zap-heavy-kimi (overlay of zap-heavy) |
| ports | 58627 (api, private) |
| pins | `@moonshot-ai/kimi-code@0.5.1` |
| units | `kimi-web.service` |
| state dirs | `~/.kimi` |
| MCP config | `~/.kimi/mcp.json` (json) |
| LLM auth | `MOONSHOT_API_KEY` (byok) |
| managed gateway | `baseUrl` in `~/.kimi/config.json` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `terminal-ui` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

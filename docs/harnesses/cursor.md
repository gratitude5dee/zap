# harness: cursor

CLI-exec per turn (`cursor-agent -p --output-format json`); no hosted ports.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `heavy` |
| template | zap-heavy-cursor (overlay of zap-heavy) |
| ports | none |
| pins | `cursor-agent@2026.08` |
| units | — |
| state dirs | `~/.cursor`, `/zap/fs/.cursor` |
| MCP config | `/zap/fs/.cursor/mcp.json` (json) |
| LLM auth | `CURSOR_API_KEY` (byok) |
| managed gateway | `baseUrl` in `~/.cursor/cli-config.json` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

# harness: omg

WebSocket JSON-RPC bridge on port 8766 (private); repos live in `/zap/fs/repos`. Managed mode uses `OPENAI_BASE_URL` in `~/.omg/.env`.

| field | value |
| --- | --- |
| run adapter | `ws-jsonrpc` |
| min weight | `heavy` |
| template | zap-heavy-omg (overlay of zap-heavy) |
| ports | 8766 (api, private) |
| pins | `@omg-dev/cli@0.9.3` |
| units | `omg.service` |
| state dirs | `~/.omg`, `/zap/fs/repos` |
| MCP config | `~/.omg/mcp.json` (cli) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok) |
| managed gateway | `OPENAI_BASE_URL` in `~/.omg/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `web-dashboard`, `tmux-attach` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

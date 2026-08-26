# harness: agno

AgentOS HTTP API on port 7777 (private), driven via HTTP runs.

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `heavy` |
| template | zap-heavy-agno (overlay of zap-heavy) |
| ports | 7777 (api, private) |
| pins | `agno@2.1.0` |
| units | `agno-os.service` |
| state dirs | `/opt/zap/agno` |
| MCP config | `/opt/zap/agno/mcp.json` (json) |
| LLM auth | `OPENAI_API_KEY` (byok), `OPENAI_BASE_URL` (managed) |
| managed gateway | `OPENAI_BASE_URL` in `/opt/zap/agno/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `control-plane-ui` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

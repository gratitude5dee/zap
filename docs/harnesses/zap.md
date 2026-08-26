# harness: zap

In-process harness: the Zap kernel drives runs directly over HTTP (`POST /v1/runs`, SSE events). Baseline for the normalized event contract.

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `med` |
| template | zap-med / zap-heavy (in-process) |
| ports | 8722 (api, private) |
| pins | — |
| units | `zap-agentd.service` |
| state dirs | `/zap` |
| MCP config | `/zap/mcp.json` (json) |
| LLM auth | — |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

# harness: devin

Pull-only: the box connects out to its control plane as an Outpost-style worker; `zap harness run` refuses with `HARNESS_PULL_ONLY`. Nothing is hosted inbound.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `heavy` |
| template | zap-heavy-devin (overlay of zap-heavy) |
| ports | none |
| pins | `devin-cli@2026.08` |
| units | `devin-worker.service` |
| state dirs | `~/.devin` |
| MCP config | `~/.devin/mcp.json` (json) |
| LLM auth | — |
| pull-only | yes — no inbound run endpoint |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

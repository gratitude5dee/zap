# harness: frontier

Python (3.12) CLI harness driven per turn via CLI exec; no hosted ports.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `heavy` |
| template | zap-heavy-frontier (overlay of zap-heavy) |
| ports | none |
| pins | `frontier-agent@0.1.5`, `python@3.12` |
| units | — |
| state dirs | `~/.frontier` |
| MCP config | `~/.frontier/mcp.json` (json) |
| LLM auth | `OPENAI_API_KEY` (byok), `OPENAI_BASE_URL` (managed) |
| managed gateway | `OPENAI_BASE_URL` in `~/.frontier/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

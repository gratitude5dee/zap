# harness: prime

Stdio JSONL RPC (`rpc-jsonl`); no hosted ports.

| field | value |
| --- | --- |
| run adapter | `rpc-jsonl` |
| min weight | `heavy` |
| template | zap-heavy-prime (overlay of zap-heavy) |
| ports | none |
| pins | `prime-agent@0.2.0` |
| units | — |
| state dirs | `~/.prime/agent` |
| MCP config | `~/.prime/agent/settings.json` (json) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok) |
| managed gateway | `providers.zap.baseUrl` in `~/.prime/agent/settings.json` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

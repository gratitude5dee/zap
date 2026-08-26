# harness: interpreter

Open Interpreter over WebSocket JSON-RPC; see packages/runtime/src/harness/interpreter.ts.

| field | value |
| --- | --- |
| run adapter | `ws-jsonrpc` |
| min weight | `med` |
| template | zap-med-interpreter (overlay of zap-med) |
| ports | 9000 (api, private) |
| pins | — |
| units | `zap-interpreter.service` |
| state dirs | `~/.openinterpreter` |
| MCP config | `~/.openinterpreter/config.toml` (toml) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

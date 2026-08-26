# harness: fx

fx CLI driven per turn as `fx ask --json`; see packages/runtime/src/harness/fx.ts.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `med` |
| template | zap-med-fx (overlay of zap-med) |
| ports | none |
| pins | — |
| units | — |
| state dirs | `~/.fx` |
| MCP config | `~/.fx/mcp.json` (json) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

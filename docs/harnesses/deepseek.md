# harness: deepseek

CLI-exec overlay of zap-heavy: plan-only runs pass `--plan`; output is JSONL on stdout. Public presets: standard, code, minimal.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `heavy` |
| template | zap-heavy-deepseek (overlay of zap-heavy) |
| ports | none |
| pins | `@deepseek-ai/dsh@0.1.1-rc.2` |
| units | — |
| state dirs | `~/.dsh` |
| MCP config | `~/.dsh/config.json` (json) |
| LLM auth | `DEEPSEEK_API_KEY` (byok), `OPENAI_BASE_URL` (managed) |
| managed gateway | `OPENAI_BASE_URL` in `~/.dsh/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

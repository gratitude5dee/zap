# harness: grok

OpenCode-derived overlay routed to xAI (`XAI_API_KEY` BYOK, or the gateway proxy in managed mode). `doctor.sh` reports xAI-routed status.

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `heavy` |
| template | zap-heavy-grok (overlay of zap-heavy-opencode) |
| ports | 4096 (api, private) |
| pins | `opencode-ai@0.6.4` |
| units | `opencode-serve.service` |
| state dirs | `~/.config/opencode`, `~/.local/share/opencode` |
| MCP config | `~/.config/opencode/opencode.json` (json) |
| LLM auth | `XAI_API_KEY` (byok) |
| managed gateway | `provider.zap.options.baseURL` in `~/.config/opencode/opencode.json` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `tui`, `share` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

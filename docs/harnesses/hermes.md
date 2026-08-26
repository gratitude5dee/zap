# harness: hermes

Follows the airv2 invariants: one user/one box, `noEnv`, filesystem memory under `~/.hermes`, only the `api_server` inbound adapter enabled, per-box `API_SERVER_KEY`, and `hermes-host.service` re-hosting ports 8642/9119 (private) after every stop/resume. Managed mode points `OPENAI_BASE_URL` in `~/.hermes/.env` at the gateway proxy.

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `heavy` |
| template | zap-heavy-hermes (named snapshot) |
| ports | 8642 (api, private), 9119 (dashboard, private) |
| pins | `HERMES_REF@v0.4.1` |
| units | `hermes-gateway.service`, `hermes-dashboard.service`, `hermes-host.service` |
| state dirs | `~/.hermes` |
| MCP config | `~/.hermes/config.yaml` (yaml) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok), `OPENAI_BASE_URL` (managed) |
| managed gateway | `OPENAI_BASE_URL` in `~/.hermes/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway`) |
| disabled inbound | `discord`, `telegram`, `slack`, `whatsapp`, `twitter`, `imessage`, `email` |

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

# harness: exo

exo (`gratitude5dee/exo`) driven through `exo agentd`, its api_server-compatible run surface: `POST /v1/runs`, SSE `GET /v1/runs/{id}/events`, `/stop`, `/approval`, and `/api/sessions`. It is the second Air harness next to Hermes and speaks the identical control-plane contract, so a caller that talks to Hermes talks to exo unchanged — only the hosted URL, token and `API_SERVER_KEY` differ.

Follows the airv2 invariants: one user/one box, `noEnv`, exo state under `~/.exo` (`--root`), only `agentd` inbound bound to `0.0.0.0:8642` behind a per-box `API_SERVER_KEY` and a `--private` hosted route, `exo-host.service` re-hosting after every stop/resume. The unary exoharness substrate (`exo serve`, `POST /request`) and exo's chat adapters never run in the box.

| field | value |
| --- | --- |
| run adapter | `http-runs` |
| min weight | `heavy` |
| template | zap-heavy-exo (named snapshot) |
| ports | 8642 (api, private) |
| pins | `EXO_REF` (+ resolved `EXO_SHA`) recorded at bake |
| units | `exo-agentd.service`, `exo-host.service` |
| state dirs | `~/.exo` |
| skills | `/zap/skills` (shared store, linked into `~/.exo/skills`); exo's own `SKILL.md` catalog is an agent artifact under `~/.exo` |
| MCP config | `~/.exo/mcp.json` (json) |
| LLM auth | `OPENAI_API_KEY` (byok), `ANTHROPIC_API_KEY` (byok), `EXO_MODEL_BASE_URL` (managed) |
| managed gateway | `EXO_MODEL_BASE_URL` in `~/.exo/.env` (openai-flavor proxy at `ZAP_API_URL/v1/runtimes/{id}/gateway/llm/v1`); `exo-render-env` registers the `gateway` model against it at boot |
| disabled inbound | `discord`, `slack`, `whatsapp`, `signal`, `irc`, `exochat`, `agent-cli`, `substrate` |

## Model binding

exo binds a model by name. `exo-render-env` (the `exo-agentd.service` `ExecStartPre`) registers one model called `gateway` for the box's single Zap agent:

- managed: `exo model register gateway --secret ZAP_GATEWAY_TOKEN --base-url ${ZAP_MANAGED_GATEWAY_URL}/llm/v1` — the proxy owns the provider key, the box never sees one;
- BYOK: the allowlisted `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` is copied into the exoharness secret store and bound directly.

## Zap recipes as exo tools

The Zap agent is created with `--tool-module /zap/exo/zap-tools.mjs`, which turns every `Zap.md` under `/zap/skills/zap-*/` into a `recipe:<slug>` tool (plan-only unless the model passes `live: true`) plus `zap_list_recipes`. This is the exo counterpart of `defineRecipeTool` in `@wzrdtech/zap-agent`.

Events from every adapter normalize to the shared `RunEvent` union and are
redacted before they leave the runtime (`packages/runtime/src/harness/adapters.ts`;
goldens in `packages/runtime/tests/fixtures/harness-events/`). Snapshots and
manifests never contain keys; BYOK env is injected per box at create time and
managed mode receives only the gateway proxy URL.

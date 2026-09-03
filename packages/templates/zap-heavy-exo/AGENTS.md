# zap-heavy-exo runtime

This VM is a `zap-heavy` runtime with the exo harness.

- One user, one box: nothing on this VM is shared with another tenant.
- Only `exo agentd` is inbound (0.0.0.0:8642, per-box `API_SERVER_KEY`,
  `--private` hosted route). It speaks the Hermes api_server contract:
  `POST /v1/runs`, SSE `/v1/runs/{id}/events`, `/stop`, `/approval`,
  `/api/sessions`. The unary substrate (`exo serve`) and every chat adapter
  stay off.
- exo state lives under `~/.exo` (`--root`); the Zap agent slug is `zap`.
- The Zap skills store (`/zap/skills`) is linked into `~/.exo/skills` and the
  recipe tool module `/zap/exo/zap-tools.mjs` exposes `recipe:<slug>` tools
  (plan-only unless `live: true`), the exo counterpart of `defineRecipeTool`.
- OpenViking is registered in `~/.exo/mcp.json`.
- Managed mode registers the exo `gateway` model against the runtime's
  gateway proxy (`EXO_MODEL_BASE_URL` in `~/.exo/.env`) — provider keys never
  live on this VM in managed mode.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

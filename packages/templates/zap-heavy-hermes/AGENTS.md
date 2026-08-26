# zap-heavy-hermes runtime

This VM is a `zap-heavy` runtime with the Hermes harness.

- One user, one box: nothing on this VM is shared with another tenant.
- Only `api_server` is inbound (0.0.0.0:8642, per-box `API_SERVER_KEY`,
  `--private` hosted route); every other channel stays disabled.
- The dashboard serves on 9119 behind its own `--private` route.
- Filesystem memory is on; OpenViking is registered as `mcp_servers.openviking`.
- Managed mode sets `OPENAI_BASE_URL` in `~/.hermes/.env` to the runtime's
  gateway proxy — provider keys never live on this VM in managed mode.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

# zap-heavy-openclaw runtime

This VM is a `zap-heavy` runtime with the OpenClaw harness.

- The gateway is the only inbound: 18789, lan bind, per-box `auth.token`,
  `--private` hosted route, chat-completions endpoint enabled.
- All channels stay disabled.
- OpenViking is registered as `mcp.servers.openviking`.
- Managed mode sets `models.providers.zap.baseUrl` to the runtime's gateway
  proxy — provider keys never live on this VM in managed mode.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

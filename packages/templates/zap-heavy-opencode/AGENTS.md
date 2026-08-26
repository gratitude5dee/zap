# zap-heavy-opencode runtime

This VM is a `zap-heavy` runtime with the OpenCode harness.

- `opencode serve` on 0.0.0.0:4096 behind a per-box
  `OPENCODE_SERVER_PASSWORD` and a `--private` hosted route.
- OpenViking is registered as `mcp.openviking`; the Zap default agent
  instructions live at `~/.config/opencode/AGENTS.md`.
- Managed mode sets `provider.zap.options.baseURL` to the runtime's gateway
  proxy — provider keys never live on this VM in managed mode.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

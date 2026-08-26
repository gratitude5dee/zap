# zap-heavy-pi runtime

This VM is a `zap-heavy` runtime with the pi harness (opt-in overlay).

- pi runs per turn over rpc-jsonl; settings live at `~/.pi/agent/settings.json`.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

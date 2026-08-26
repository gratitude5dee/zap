# zap-heavy-prime runtime

This VM is a `zap-heavy` runtime with the prime harness (opt-in overlay).

- prime-agent runs per turn over rpc-jsonl; settings live at `~/.prime/agent/settings.json`.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

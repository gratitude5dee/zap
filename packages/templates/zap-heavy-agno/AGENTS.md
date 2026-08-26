# zap-heavy-agno runtime

This VM is a `zap-heavy` runtime with the agno harness (opt-in overlay).

- The AgentOS app serves on 7777 behind a per-box `OS_SECURITY_KEY` and a `--private` hosted route.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

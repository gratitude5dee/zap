# zap-heavy-grok runtime

This VM is a `zap-heavy-opencode` runtime routed through xAI.

- The default LLM route is `xai` via the gateway; `XAI_API_KEY` is BYOK-only
  and never baked.
- Everything else follows the zap-heavy-opencode rules: server on 4096,
  per-box password, plan-only default, noEnv boxes, no secrets in snapshots.

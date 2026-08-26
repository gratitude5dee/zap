# zap-heavy-deepseek runtime

This VM is a `zap-heavy` runtime with the dsh harness.

- dsh runs headless per turn (`cli-exec`); the web UI is never started.
- Presets: `standard`, `code`, `minimal`.
- Plan-only turns pass `--plan`; live execution requires explicit approval.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

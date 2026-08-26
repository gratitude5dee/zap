# zap-heavy-cursor runtime

This VM is a `zap-heavy` runtime with the cursor harness (opt-in overlay).

- The Cursor agent runs per turn as `agent -p --output-format json`; rules live under `/zap/fs/.cursor/rules`. OpenCode remains available as the fallback harness.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

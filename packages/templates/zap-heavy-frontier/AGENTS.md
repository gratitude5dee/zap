# zap-heavy-frontier runtime

This VM is a `zap-heavy` runtime with the frontier harness (opt-in overlay).

- frontier-agent runs headless per turn as `frontier-agent -p --no-tui` (cli-exec) from a uv-managed Python 3.12 venv.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

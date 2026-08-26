# zap-heavy-kimi runtime

This VM is a `zap-heavy` runtime with the kimi harness (opt-in overlay).

- `kimi web --no-open --port 58627` serves the API behind a `--private` hosted route; `KIMI_CODE_HOME=/zap/fs`.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

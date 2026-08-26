# zap-heavy-omg runtime

This VM is a `zap-heavy` runtime with the omg harness.

- `omg computer` serves ws-jsonrpc on `127.0.0.1:8766` only; ingress goes
  through the `--private` hosted route.
- Repos live under `/zap/fs/repos` (`OMG_REPOS_ROOT`).
- `omg mcp` is registered into the tmux'd CLIs.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

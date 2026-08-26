# zap-heavy-devin runtime

This VM is a `zap-heavy` runtime with the devin harness (opt-in overlay).

- This VM connects outbound as an Outposts worker; work is pulled from its control plane. There is no hosted port and `zap runtime exec` refuses to run against it.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

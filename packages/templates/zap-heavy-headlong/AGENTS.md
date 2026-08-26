# zap-heavy-headlong runtime

This VM is a `zap-heavy` runtime with the headlong harness (opt-in overlay).

- The headlong compose stack stays on the VM loopback and is driven per turn over cli-exec. Docker-in-VM is required.
- All zap-heavy rules apply: plan-only default, noEnv boxes, no secrets in
  the snapshot.

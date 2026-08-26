# env-macos

Native macOS (darwin/arm64) environment on Namespace Apple-silicon instances.
Status: **coming soon** — the environment profile is registered
(`packages/runtime/src/environments.ts`, `provider: namespace`,
`kind: native`) and `doctor` reports it `comingSoon` while Namespace macOS
quota is early-access; it is never silently skipped.

- `bootstrap.sh` — the curl-able first-boot pointer (Namespace has no snapshot
  fork for native instances); clones this repo at a pinned ref and hands over.
- `setup.sh` — brew toolchain, Zap CLI + `zap-agentd` as LaunchAgents
  (`tech.wzrd.zap.<service>`), and the control bridge
  (`infra/namespace/bridge/bridge.py`) on port 8722.

The bridge is reached only through the authenticated Namespace ingress
(`x-nsc-ingress-auth`) AND the per-instance `X-Zap-Bridge-Token`, so neither
token alone reaches the filesystem. Restart semantics are launchd:
`restartCommand()` returns `launchctl kickstart -k gui/501/tech.wzrd.zap.<service>`.

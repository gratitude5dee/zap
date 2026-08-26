# env-macos environment

Native macOS (darwin/arm64) on Namespace Apple-silicon instances. Source:
`packages/templates/env-macos/`. Status: **coming soon** (`doctor` reports
`comingSoon` while Namespace macOS quota is early-access; never silently
skipped). Profile: `provider: namespace`, `kind: native`
(`packages/runtime/src/environments.ts`).

- No snapshot fork for native instances: first boot curls `bootstrap.sh` (the
  pinned template pointer), which clones this repo at a pinned ref and runs
  `setup.sh`.
- `setup.sh` ports the Box conventions: brew instead of apt, per-user
  LaunchAgents labeled `tech.wzrd.zap.<service>` instead of systemd units,
  and the control bridge (`infra/namespace/bridge/bridge.py`) on 8722 instead
  of hosted routes.
- Bridge auth: Namespace ingress (`x-nsc-ingress-auth`) AND the per-instance
  `X-Zap-Bridge-Token` — neither token alone reaches the filesystem.
- Restart semantics: `restartCommand()` returns
  `launchctl kickstart -k gui/501/tech.wzrd.zap.<service>`.

Verification (manual): bootstrap reaches `bridge /v1/health → ready: true`.

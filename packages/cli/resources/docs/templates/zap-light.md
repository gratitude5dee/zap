# zap-light template

The default Box template for light-profile runtimes. Source:
`packages/templates/zap-light/`.

- Toolchain (pinned in `bake.sh`): Node 24, Bun, Python 3.12, ffmpeg,
  imagemagick, libvips, Playwright Chromium.
- `zap-agentd` on `0.0.0.0:8722` behind bearer auth
  (`units/zap-agentd.service`), hosted privately and re-registered at
  boot/resume (`units/zap-host.service`).
- Lanes: `codegen`, `ffmpeg`, `media-workflows`, `browser` (process
  isolation under systemd-run); `wasm` only where the host exposes KVM.
- Manifests: `~/.zap/capabilities.json` and `~/.zap/template.json` — written
  by the bake, read by `doctor` and the control plane. Never contain secrets.

Aliases: `zap-light-ffmpeg`, `zap-light-code` (config-only lane subsets).
Overlay: `zap-light-browser` (`BROWSER_OVERLAY=1`, pinned `browser-use` CLI
plus the `zap-browser-use` wrapper).

Build: `infra/box/build-template.sh zap-light` → snapshot on the Box account,
recorded in `packages/templates/registry.json` and `docs/verify-log.md`.
Verify: `infra/box/verify-template.sh zap-light` (doctor from a fresh box off
the snapshot).

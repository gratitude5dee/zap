# zap-light

The default Zap sandbox template: a Zap sandbox VM baked with the light-profile
toolchain (Node 24, Bun, Python 3.12, ffmpeg/imagemagick/libvips, Playwright
Chromium) plus `zap-agentd` on `0.0.0.0:8722` behind bearer auth and a private
hosted route.

- `bake.sh` — idempotent bake; pins every version; writes
  `~/.zap/capabilities.json` and `~/.zap/template.json`.
- `doctor.sh` — PASS/FAIL health gate; used by `infra/box/verify-template.sh`.
- `units/zap-agentd.service` — the lane executor daemon (NoNewPrivileges,
  ProtectSystem=strict, writable only under `/zap` and `~/.zap`).
- `units/zap-host.service` — re-registers the private hosted route for 8722 at
  boot and resume (hosted tokens rotate on resume).

Aliases: `zap-light-ffmpeg`, `zap-light-code` (config-only lane subsets).
Overlay: `zap-light-browser` (`BROWSER_OVERLAY=1 bake.sh` installs the pinned
`browser-use` CLI in its own venv plus the `zap-browser-use` wrapper).

Baking and verification are operator flows: see `infra/box/build-template.sh`
and `infra/box/verify-template.sh`. Never bake a secret into the template —
per-sandbox env arrives at create time via the §7 allowlist and `noEnv:true`.

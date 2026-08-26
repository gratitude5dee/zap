# env-omarchy

Omarchy (Arch Linux + Hyprland) environment overlay for Box VMs, applied over
a baked `zap-light`/`zap-heavy` template. Status: **coming soon** — the
environment profile is registered (`packages/runtime/src/environments.ts`) and
`doctor` reports it `comingSoon` until the overlay is verified end-to-end.

- `setup.sh` — pacstraps a pinned Arch userland at `/opt/arch` (bind-sharing
  `/home/user`, `/tmp`, `/dev`, `/run`, `/zap` with the host), installs the
  Omarchy package set + the pinned Omarchy checkout, and starts the desktop.
- `packages.omarchy` — Omarchy's package manifest minus hardware-only entries.
- `arch-root.service` / `omarchy-desktop.service` — mount unit + the nested
  Hyprland session on the vkms virtual display.
- `monitors-headless.lua` — fixed 1920x1080 headless monitor config.

Restart semantics are systemd (`restartCommand()` in environments.ts returns
`systemctl` for every Box environment).

# env-omarchy environment

Omarchy (Arch Linux + Hyprland) desktop environment on Box VMs, applied as an
overlay over a baked zap template. Source: `packages/templates/env-omarchy/`.
Status: **coming soon** (`doctor` reports `comingSoon`; the profile is
registered in `packages/runtime/src/environments.ts` with `provider: box`).

- A pinned Arch userland is pacstrapped at `/opt/arch`, bind-sharing
  `/home/user`, `/tmp`, `/dev`, `/run`, `/zap` with the host — the same
  machine seen through Arch tooling, not a second one.
- The Omarchy desktop (pinned checkout at `/usr/share/omarchy`) runs nested on
  the box's existing X display via vkms + Hyprland; Xwayland owns display `:1`.
- `arch-run '<cmd>'` is the only entry point into the Arch userland
  (pacman/yay/omarchy-*).
- Restart semantics: systemd (`restartCommand()` returns `systemctl` for every
  Box environment).

Verification (manual): apply over `zap-light`, confirm the headless Hyprland
unit boots and the template `doctor.sh` passes. Use over `zap-heavy-*` is
verified later (Z10).

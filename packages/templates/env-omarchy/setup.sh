#!/usr/bin/env bash
# env-omarchy: the Omarchy (Arch Linux + Hyprland) environment overlay for a
# Box VM, applied over a baked zap-* template.
#
# An OVERLAY, not a fork: it assumes the base template's bake already ran and
# adds an Arch userland (pacstrap at /opt/arch, sharing /home/user, /tmp,
# /dev, /run with the host) with the Omarchy desktop nested on the box's
# existing X display. The zap runtime, agentd, and lanes cannot drift between
# the two environments — there is exactly one copy of them.
set -euo pipefail

HOME_DIR="${HOME:-/home/user}"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ARCH_ROOT="${ARCH_ROOT:-/opt/arch}"
# Pinned deliberately: a floating bootstrap tarball would silently change what
# an Omarchy box is. Re-pin with a delta review.
ARCH_BOOTSTRAP_DATE="${ARCH_BOOTSTRAP_DATE:-2026.08.01}"
ARCH_BOOTSTRAP_URL="${ARCH_BOOTSTRAP_URL:-https://archive.archlinux.org/iso/$ARCH_BOOTSTRAP_DATE/archlinux-bootstrap-$ARCH_BOOTSTRAP_DATE-x86_64.tar.zst}"
ARCH_MIRROR="${ARCH_MIRROR:-https://geo.mirror.pkgbuild.com/\$repo/os/\$arch}"
OMARCHY_REPO="${OMARCHY_REPO:-https://github.com/gratitude5dee/omarchy.git}"
OMARCHY_REF="${OMARCHY_REF:-43bfe9b9d82ba650b5b80eef79e94776790801c9}"
OMARCHY_DISPLAY="${OMARCHY_DISPLAY:-:1}"

[ -f "$HOME_DIR/.zap/template.json" ] || {
  echo "FATAL: bake the base zap template before the env-omarchy overlay" >&2
  exit 1
}

# ── 1. Arch userland at $ARCH_ROOT ──────────────────────────────────────────
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y zstd

if [ ! -x "$ARCH_ROOT/usr/bin/pacman" ]; then
  curl -fsSLo /tmp/arch-bootstrap.tar.zst "$ARCH_BOOTSTRAP_URL"
  sudo mkdir -p "$ARCH_ROOT"
  sudo tar -I zstd -xf /tmp/arch-bootstrap.tar.zst -C "$ARCH_ROOT" \
    --strip-components=1 --numeric-owner
  rm -f /tmp/arch-bootstrap.tar.zst
fi

echo "Server = $ARCH_MIRROR" | sudo tee "$ARCH_ROOT/etc/pacman.d/mirrorlist" >/dev/null
sudo sed -i 's/^CheckSpace/#CheckSpace/' "$ARCH_ROOT/etc/pacman.conf"
sudo cp /etc/resolv.conf "$ARCH_ROOT/etc/resolv.conf"
printf 'en_US.UTF-8 UTF-8\n' | sudo tee "$ARCH_ROOT/etc/locale.gen" >/dev/null

# ── 1a. Enter/leave the Arch root ───────────────────────────────────────────
sudo install -m 755 /dev/stdin /usr/local/bin/arch-mount <<'SH'
#!/usr/bin/env bash
# Bind the host into the Arch root. Idempotent; run by arch-root.service.
set -euo pipefail
ARCH_ROOT="${ARCH_ROOT:-/opt/arch}"
mountpoint -q "$ARCH_ROOT/proc" || mount -t proc proc "$ARCH_ROOT/proc"
mountpoint -q "$ARCH_ROOT/sys"  || mount --rbind /sys "$ARCH_ROOT/sys"
for dir in /dev /run /tmp /home/user /zap; do
  target="$ARCH_ROOT$dir"
  mkdir -p "$target"
  mountpoint -q "$target" || mount --rbind "$dir" "$target"
done
SH

sudo install -m 755 /dev/stdin /usr/local/bin/arch-run <<SH
#!/usr/bin/env bash
# Run a shell line in the Arch userland as the box user (uid 1000). The ONLY
# entry point: pacman, yay, omarchy-* and the Hyprland session go through it.
set -euo pipefail
cmd="\${1:?usage: arch-run <shell line>}"
exec sudo chroot "$ARCH_ROOT" /usr/bin/setpriv \\
  --reuid=1000 --regid=1000 --init-groups \\
  /usr/bin/env -i \\
  HOME=/home/user USER=user LOGNAME=user TERM="\${TERM:-xterm-256color}" \\
  LANG=en_US.UTF-8 \\
  PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/bin \\
  XDG_RUNTIME_DIR=/run/user/1000 XDG_SESSION_TYPE=wayland \\
  OMARCHY_PATH=/usr/share/omarchy \\
  DISPLAY="\${DISPLAY:-:0}" WAYLAND_DISPLAY="\${WAYLAND_DISPLAY:-wayland-1}" \\
  WLR_BACKENDS="\${WLR_BACKENDS:-}" \\
  /bin/bash -lc "\$cmd"
SH

arch_root_run() {
  sudo chroot "$ARCH_ROOT" /usr/bin/env -i \
    HOME=/root PATH=/usr/local/sbin:/usr/local/bin:/usr/bin:/bin \
    LANG=en_US.UTF-8 /bin/bash -lc "$1"
}

sudo ARCH_ROOT="$ARCH_ROOT" /usr/local/bin/arch-mount

# ── 1b. Packages, the way Omarchy installs them ─────────────────────────────
arch_root_run 'pacman-key --init && pacman-key --populate archlinux'
arch_root_run 'locale-gen'
arch_root_run 'pacman -Syu --noconfirm --needed base-devel git sudo'
arch_root_run "id -u user >/dev/null 2>&1 || useradd -u 1000 -M -d /home/user -s /bin/bash user"
arch_root_run "printf 'user ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/user && chmod 0440 /etc/sudoers.d/user"

sudo cp "$TEMPLATE_DIR/packages.omarchy" "$ARCH_ROOT/tmp/packages.omarchy"
arch_root_run "pacman -Syu --noconfirm --needed \$(grep -v '^[[:space:]]*\(#\|\$\)' /tmp/packages.omarchy)"

arch-run 'command -v yay >/dev/null || (rm -rf /tmp/yay-bin && git clone --depth 1 https://aur.archlinux.org/yay-bin.git /tmp/yay-bin && cd /tmp/yay-bin && makepkg -si --noconfirm && rm -rf /tmp/yay-bin)'

# ── 1c. Omarchy itself, at the path its scripts resolve ─────────────────────
arch_root_run "test -d /usr/share/omarchy || git clone --filter=blob:none '$OMARCHY_REPO' /usr/share/omarchy"
arch_root_run "git -C /usr/share/omarchy fetch --filter=blob:none origin '$OMARCHY_REF' && git -C /usr/share/omarchy checkout --force '$OMARCHY_REF'"
arch_root_run 'ln -sf /usr/share/omarchy/bin/omarchy* /usr/local/bin/'
arch_root_run "printf 'OMARCHY_PATH=/usr/share/omarchy\nLANG=en_US.UTF-8\n' > /etc/environment"

mkdir -p "$HOME_DIR/.config" "$HOME_DIR/.local/state/omarchy/toggles/hypr"
[ -d "$HOME_DIR/.config/hypr" ] || sudo cp -r "$ARCH_ROOT/usr/share/omarchy/config/hypr" "$HOME_DIR/.config/hypr"
sudo cp "$ARCH_ROOT/usr/share/omarchy/default/hypr/toggles/flags.lua" \
  "$HOME_DIR/.local/state/omarchy/toggles/hypr/flags.lua"
sudo cp "$TEMPLATE_DIR/monitors-headless.lua" "$HOME_DIR/.config/hypr/monitors.lua"
sudo chown -R "$(id -u):$(id -g)" "$HOME_DIR/.config/hypr" "$HOME_DIR/.local/state/omarchy"

# ── 2. The desktop as a service (vkms virtual display; no GPU) ──────────────
echo vkms | sudo tee /etc/modules-load.d/vkms.conf >/dev/null
sudo modprobe vkms || true
sudo install -d /etc/X11/xorg.conf.d
printf 'Section "ServerFlags"\n  Option "AutoAddGPU" "off"\nEndSection\n' |
  sudo tee /etc/X11/xorg.conf.d/10-noautogpu.conf >/dev/null

sudo cp "$TEMPLATE_DIR/arch-root.service" /etc/systemd/system/arch-root.service
sudo cp "$TEMPLATE_DIR/omarchy-desktop.service" /etc/systemd/system/omarchy-desktop.service
sudo systemctl daemon-reload
sudo systemctl enable arch-root.service omarchy-desktop.service
sudo systemctl restart arch-root.service omarchy-desktop.service

# ── 3. Record the environment in the capability manifest ────────────────────
jq '.environment = "omarchy" | .display = "'"$OMARCHY_DISPLAY"'"' \
  "$HOME_DIR/.zap/capabilities.json" > "$HOME_DIR/.zap/capabilities.json.tmp" \
  && mv "$HOME_DIR/.zap/capabilities.json.tmp" "$HOME_DIR/.zap/capabilities.json"

echo "env-omarchy overlay complete (arch root $ARCH_ROOT, display $OMARCHY_DISPLAY)"

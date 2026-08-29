#!/usr/bin/env bash
# Connectivity bake fragment 70: opt-in tailnet + loopback agent bus.
#
# Both are INSTALLED and DISABLED. Nothing here enables, starts, or joins a
# network at bake time (C6): the owner's per-runtime opt-in
# (packages/runtime/src/connectivity) is the only thing that ever starts them,
# and the tailnet it joins is the USER'S own tailnet with the user's own auth
# key — never a platform tailnet.
#
# Idempotent: safe to re-run on a half-baked box. Pinned (C30) and best-effort:
# a failed download leaves the feature uninstalled, never a failed bake.
set -euo pipefail

CONNECTIVITY_HOME="${HOME:-/home/user}"
ZAP_DIR="${CONNECTIVITY_HOME}/.zap"
TAILSCALE_VERSION="${TAILSCALE_VERSION:-1.82.0}"
COTAL_VERSION="${COTAL_VERSION:-0.33.1}"

install -d -m 0755 "${ZAP_DIR}"
install -d -m 0700 "${CONNECTIVITY_HOME}/.tailscale"

# ── Tailscale: binaries + a DISABLED unit (userspace networking) ──────────
# Boxes have no TUN device, so tailscaled runs with --tun=userspace-networking.
if command -v tailscale >/dev/null 2>&1 && [ "$(tailscale --version 2>/dev/null | head -1)" = "${TAILSCALE_VERSION}" ]; then
  echo "connectivity: tailscale ${TAILSCALE_VERSION} already installed"
else
  ts_arch="$(uname -m)"
  case "${ts_arch}" in
    x86_64) ts_arch=amd64 ;;
    aarch64) ts_arch=arm64 ;;
  esac
  ts_pkg="tailscale_${TAILSCALE_VERSION}_${ts_arch}"
  if curl -fsSL -o "/tmp/${ts_pkg}.tgz" "https://pkgs.tailscale.com/stable/${ts_pkg}.tgz" \
    && tar -xzf "/tmp/${ts_pkg}.tgz" -C /tmp \
    && sudo install -m 755 "/tmp/${ts_pkg}/tailscale" "/tmp/${ts_pkg}/tailscaled" /usr/local/bin/; then
    echo "connectivity: tailscale ${TAILSCALE_VERSION} installed (disabled)"
  else
    echo "WARN: tailscale install failed — opt-in tailnet unavailable" >&2
  fi
  rm -rf "/tmp/${ts_pkg}.tgz" "/tmp/${ts_pkg}"
fi

sudo tee /etc/systemd/system/zap-tailscaled.service >/dev/null <<'UNIT'
# Installed DISABLED. Only the owner's per-runtime opt-in ever starts it, and
# it joins the USER'S own tailnet with the user's own auth key.
[Unit]
Description=Zap opt-in tailnet daemon (user-owned tailnet, userspace networking)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=user
ExecStartPre=/bin/mkdir -p /home/user/.tailscale
ExecStart=/usr/local/bin/tailscaled --state=/home/user/.tailscale/tailscaled.state --socket=/home/user/.tailscale/tailscaled.sock --tun=userspace-networking
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
# Never `systemctl enable` here: default-off is the contract.
sudo systemctl disable zap-tailscaled.service >/dev/null 2>&1 || true

# ── Cotal: loopback agent/session bus (127.0.0.1:4222), preinstalled only ──
# Single-tenant by construction: it never leaves the box. Preinstalled so the
# owner's opt-in can start it without a per-box install. Not started here.
if command -v cotal >/dev/null 2>&1; then
  echo "connectivity: cotal already installed"
else
  npm install -g "cotal-ai@${COTAL_VERSION}" --no-audit --no-fund \
    || sudo npm install -g "cotal-ai@${COTAL_VERSION}" --no-audit --no-fund \
    || echo "WARN: cotal preinstall failed — opt-in agent bus unavailable" >&2
fi

# ── Pins (C30). Non-secret metadata only. ────────────────────────────────
TAILSCALE_PIN="${TAILSCALE_VERSION}" COTAL_PIN="${COTAL_VERSION}" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.pins = { ...(prev.pins ?? {}), tailscale: process.env.TAILSCALE_PIN, cotal: process.env.COTAL_PIN };
  prev.connectivity = {
    ...(prev.connectivity ?? {}),
    tailscale: { installed: true, enabled: false },
    cotal: { installed: true, enabled: false },
  };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "connectivity: tailscale + cotal installed, both disabled"

#!/usr/bin/env bash
# Self-host zap-VM setup: any KVM host (Hetzner or similar).
#
#   ZAP_SELFHOST_TOKEN=… ZAP_DOMAIN=vm.example.com bash infra/self-host/setup.sh
#
# Installs: microsandbox (pinned 0.6.15) for microVM lanes, optional Rust +
# hyperlight-wasm host for wasm lanes, Node 24 + the Zap CLI/runtime,
# zap-agentd on 0.0.0.0:8722 behind TLS (Caddy) with bearer
# ZAP_SELFHOST_TOKEN; ufw allows 443 only.
set -euo pipefail

MSB_VERSION="0.6.15"
NODE_MAJOR=24
TOKEN="${ZAP_SELFHOST_TOKEN:?ZAP_SELFHOST_TOKEN required}"
DOMAIN="${ZAP_DOMAIN:?ZAP_DOMAIN required (TLS hostname)}"

# ── 0. KVM probe: microVM lanes need it ──────────────────────────────────
if [ ! -e /dev/kvm ]; then
  echo "FATAL: /dev/kvm missing — pick a host with KVM (bare metal or nested virt)" >&2
  exit 1
fi

sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl git jq ufw ffmpeg ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

# ── 1. microsandbox (pinned) ─────────────────────────────────────────────
if ! command -v msb >/dev/null || ! msb --version 2>/dev/null | grep -q "$MSB_VERSION"; then
  curl -fsSL https://install.microsandbox.dev | MSB_VERSION="$MSB_VERSION" sh
fi

# ── 2. Optional: hyperlight-wasm host for wasm lanes ─────────────────────
if [ "${ZAP_BUILD_HYPERLIGHT:-0}" = "1" ]; then
  command -v cargo >/dev/null || {
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    . "$HOME/.cargo/env"
  }
  cargo install hyperlight-wasm --locked || echo "WARN: hyperlight-wasm host build failed; wasm lane stays unavailable"
fi

# ── 3. Node 24 + Zap ─────────────────────────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g "@wzrdtech/zap" "@wzrdtech/zap-runtime"
sudo mkdir -p /zap/fs /zap/runs /zap/media
sudo chown -R "$(id -u):$(id -g)" /zap

# ── 4. zap-agentd unit (token via systemd credential file, not the unit) ─
sudo install -d -m 0700 /etc/zap
printf '%s' "$TOKEN" | sudo tee /etc/zap/selfhost-token >/dev/null
sudo chmod 600 /etc/zap/selfhost-token

sudo tee /etc/systemd/system/zap-agentd.service >/dev/null <<EOF
[Unit]
Description=zap-agentd (self-host lane executor on 0.0.0.0:8722)
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
LoadCredential=selfhost-token:/etc/zap/selfhost-token
ExecStart=/bin/bash -c 'ZAP_SELFHOST_TOKEN=\$(cat "\$CREDENTIALS_DIRECTORY/selfhost-token") exec zap-agentd serve'
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/zap

[Install]
WantedBy=multi-user.target
EOF

# ── 5. Caddy TLS reverse proxy in front of 8722 ──────────────────────────
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -y && sudo apt-get install -y caddy
fi
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
  reverse_proxy 127.0.0.1:8722
}
EOF

# ── 6. Firewall: 443 only ────────────────────────────────────────────────
sudo ufw allow 443/tcp
sudo ufw --force enable

sudo systemctl daemon-reload
sudo systemctl enable --now zap-agentd.service caddy

echo "self-host zap-VM ready: https://$DOMAIN (bearer auth required)"

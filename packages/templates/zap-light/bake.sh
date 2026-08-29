#!/usr/bin/env bash
# zap-light template bake. Idempotent: safe to re-run on a half-baked box.
# Pins every dependency; writes ~/.zap/capabilities.json + ~/.zap/template.json
# so doctor and the control plane can read what this box is.
#
# Overlays: BROWSER_OVERLAY=1 adds the pinned browser-use CLI and the
# zap-browser-use wrapper (the browser lane).
set -euo pipefail

HOME_DIR="${HOME:-/home/user}"
ZAP_DIR="$HOME_DIR/.zap"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_MAJOR=24
BUN_VERSION="${BUN_VERSION:-1.2.20}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.55.0}"
BROWSER_USE_VERSION="${BROWSER_USE_VERSION:-0.5.5}"

mkdir -p "$ZAP_DIR" "$ZAP_DIR/bin" /zap/fs /zap/runs /zap/media 2>/dev/null || {
  sudo mkdir -p /zap/fs /zap/runs /zap/media
  sudo chown -R "$(id -u):$(id -g)" /zap
}

# ── 1. System toolchain (idempotent apt) ─────────────────────────────────
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ffmpeg imagemagick libvips-tools jq curl git python3.12 python3.12-venv \
  ca-certificates gnupg

# ── 2. Node 24 (NodeSource, pinned major) ────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" != "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# ── 3. Bun (pinned) ──────────────────────────────────────────────────────
if ! command -v bun >/dev/null || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
fi
export PATH="$HOME_DIR/.bun/bin:$PATH"

# ── 4. Zap CLI + runtime + MCP ───────────────────────────────────────────
sudo npm install -g "@wzrdtech/zap" "@wzrdtech/zap-runtime" 2>/dev/null || \
  npm install -g "@wzrdtech/zap" "@wzrdtech/zap-runtime"

# ── 5. Playwright browsers (pinned; the browser lane's engine) ───────────
npx --yes "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium

# ── 6. Browser overlay (zap-light-browser) ───────────────────────────────
if [ "${BROWSER_OVERLAY:-0}" = "1" ]; then
  python3.12 -m venv "$ZAP_DIR/browser-use-venv"
  "$ZAP_DIR/browser-use-venv/bin/pip" install "browser-use==${BROWSER_USE_VERSION}"
  cat > "$ZAP_DIR/bin/zap-browser-use" <<'EOF'
#!/usr/bin/env bash
# Browser lane wrapper: runs the pinned browser-use CLI from its own venv.
exec "$HOME/.zap/browser-use-venv/bin/browser-use" "$@"
EOF
  chmod 755 "$ZAP_DIR/bin/zap-browser-use"
fi

# ── 7. Units: zap-agentd + the boot/resume host re-registration ──────────
sudo cp "$TEMPLATE_DIR/units/zap-agentd.service" /etc/systemd/system/
sudo cp "$TEMPLATE_DIR/units/zap-host.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable zap-agentd.service zap-host.service

# ── 8. Capability + template manifests (no secrets — C1) ─────────────────
KVM_AVAILABLE=false
[ -e /dev/kvm ] && [ -r /dev/kvm ] && [ -w /dev/kvm ] && KVM_AVAILABLE=true

cat > "$ZAP_DIR/capabilities.json" <<EOF
{
  "template": "zap-light",
  "kvm": $KVM_AVAILABLE,
  "lanes": {
    "codegen": "process",
    "ffmpeg": "process",
    "media-workflows": "process",
    "browser": "process",
    "wasm": "$([ "$KVM_AVAILABLE" = true ] && echo hyperlight-wasm || echo unavailable)"
  },
  "bakedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cat > "$ZAP_DIR/template.json" <<EOF
{
  "name": "zap-light",
  "node": "$(node --version)",
  "bun": "$(bun --version)",
  "ffmpeg": "$(ffmpeg -version | head -1 | awk '{print $3}')",
  "playwright": "${PLAYWRIGHT_VERSION}",
  "bakedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "zap-light bake complete (kvm=$KVM_AVAILABLE)"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

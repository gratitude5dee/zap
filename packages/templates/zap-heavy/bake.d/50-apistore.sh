#!/usr/bin/env bash
# zap-heavy bake fragment 50: API store.
# - open-connector self-hosted MCP on 127.0.0.1:3000 (loopback only), pinned
#   ref, OOMOL_CONNECT_* injected via per-box env at boot — never baked.
# - Context7 and Composio are hosted MCPs; nothing to bake beyond harness
#   mcpConfig fragments rendered at compose time (apistore.* plugins).
set -euo pipefail

OC_ROOT="/opt/zap/open-connector"
OC_REPO="https://github.com/oomol-lab/open-connector.git"
OC_REF="v0.1.0" # pinned; keep in sync with packages/runtime/src/apistore/open-connector.ts

# Verify pinned provider facts at bake time (C30): the ref must exist.
git ls-remote --exit-code "${OC_REPO}" "refs/tags/${OC_REF}" >/dev/null

sudo mkdir -p "${OC_ROOT}"
sudo chown "$(id -u):$(id -g)" "${OC_ROOT}"
git clone --depth 1 --branch "${OC_REF}" "${OC_REPO}" "${OC_ROOT}"
(cd "${OC_ROOT}" && npm ci --omit=dev)

# Keep node_modules caches out of the box snapshot; secrets never land on disk.
touch "${HOME}/.boxignore"
grep -qxF ".npm/" "${HOME}/.boxignore" || echo ".npm/" >> "${HOME}/.boxignore"

# Loopback-only unit. OOMOL_CONNECT_ENCRYPTION_KEY / OOMOL_CONNECT_RUNTIME_TOKEN /
# OOMOL_CONNECT_ADMIN_TOKEN come from /etc/zap/box.env (per-box env, noEnv:true).
sudo tee /etc/systemd/system/zap-open-connector.service >/dev/null <<'UNIT'
[Unit]
Description=Zap open-connector MCP (loopback only)
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/opt/zap/open-connector
EnvironmentFile=/etc/zap/box.env
Environment=HOST=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/node server.js --host 127.0.0.1 --port 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable zap-open-connector.service
# Not started at bake: OOMOL_CONNECT_* only exists in the per-box env at boot.

# Skills store contract: /zap/skills/<name>/SKILL.md
sudo mkdir -p /zap/skills
sudo chown "$(id -u):$(id -g)" /zap/skills

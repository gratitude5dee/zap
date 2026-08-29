#!/usr/bin/env bash
# zap-med-interpreter overlay: install the Open Interpreter native binary onto
# zap-med. Applied via POST /boxes {from: "zap-med", setupScript} or through
# /commands after ready — never at fork. No secrets are baked; LLM keys arrive
# at runtime through the gateway env allowlist (BYOK).
set -euo pipefail

curl -fsSL https://www.openinterpreter.com/install | sh

install -d -m 0700 "${HOME}/.openinterpreter"
cat > "${HOME}/.openinterpreter/config.toml" <<'EOF'
# Zap-managed Open Interpreter config. MCP servers are appended here by the
# MCP-registration helper at boot (openviking is added when memory is enabled).
[mcp_servers]
EOF

install -m 0644 "$(dirname "${BASH_SOURCE[0]}")/units/zap-interpreter.service" \
  /etc/systemd/system/zap-interpreter.service
systemctl enable zap-interpreter.service

echo "bake: zap-med-interpreter complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

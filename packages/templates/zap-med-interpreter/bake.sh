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

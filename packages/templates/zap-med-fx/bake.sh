#!/usr/bin/env bash
# zap-med-fx overlay: install the fx CLI onto zap-med. Applied via
# POST /boxes {from: "zap-med", setupScript} or through /commands after ready.
# No secrets are baked; LLM keys arrive at runtime (BYOK).
set -euo pipefail

curl -fsSL https://fx.sh/setup.sh | bash

install -d -m 0700 "${HOME}/.fx"
cat > "${HOME}/.fx/settings.json" <<'EOF'
{
  "output": "json"
}
EOF
cat > "${HOME}/.fx/mcp.json" <<'EOF'
{
  "mcpServers": {}
}
EOF

echo "bake: zap-med-fx complete"

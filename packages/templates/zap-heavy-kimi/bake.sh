#!/usr/bin/env bash
# zap-heavy-kimi opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

npm install -g "@moonshot-ai/kimi-code@0.5.1"

install -d -m 0700 "${HOME}/.kimi"
cat > "${HOME}/.kimi/mcp.json" <<'EOF'
{ "mcpServers": { "openviking": { "url": "http://127.0.0.1:1933" } } }
EOF
cat > "${HOME}/.kimi/.env" <<'EOF'
KIMI_CODE_HOME=/zap/fs
EOF

install -m 0644 "${TEMPLATE_DIR}/units/kimi-web.service" \
  /etc/systemd/system/kimi-web.service
systemctl enable kimi-web.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-kimi";
  prev.pins = { ...(prev.pins ?? {}), ...{"@moonshot-ai/kimi-code": "0.5.1"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-kimi complete"

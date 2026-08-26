#!/usr/bin/env bash
# zap-heavy-headlong opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Docker-in-VM is required for the compose stack.
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

install -d -m 0700 "${HOME}/.headlong"
cat > "${HOME}/.headlong/.env" <<'EOF'
HEADLONG_BIND=127.0.0.1
EOF
cat > "${HOME}/.headlong/mcp.json" <<'EOF'
{ "mcpServers": { "openviking": { "url": "http://127.0.0.1:1933" } } }
EOF

install -m 0644 "${TEMPLATE_DIR}/units/headlong.service" \
  /etc/systemd/system/headlong.service
systemctl enable headlong.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-headlong";
  prev.pins = { ...(prev.pins ?? {}), ...{"headlong": "0.4.0"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-headlong complete"

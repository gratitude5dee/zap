#!/usr/bin/env bash
# zap-heavy-agno opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0755 /opt/zap/agno
uv venv /opt/zap/agno/venv --python 3.12
uv pip install --python /opt/zap/agno/venv/bin/python 'agno[os]==2.1.0'

cat > /opt/zap/agno/mcp.json <<'EOF'
{ "mcpServers": { "openviking": { "url": "http://127.0.0.1:1933" } } }
EOF

# OS_SECURITY_KEY is generated per box at first boot by the unit's
# ExecStartPre — never baked.
install -m 0755 "${TEMPLATE_DIR}/render-env.sh" /usr/local/bin/agno-render-env
install -m 0644 "${TEMPLATE_DIR}/units/agno-os.service" \
  /etc/systemd/system/agno-os.service
systemctl enable agno-os.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-agno";
  prev.pins = { ...(prev.pins ?? {}), ...{"agno": "2.1.0"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-agno complete"

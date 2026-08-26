#!/usr/bin/env bash
# zap-heavy-frontier opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0700 "${HOME}/.frontier"
uv venv "${HOME}/.frontier/venv" --python 3.12
uv pip install --python "${HOME}/.frontier/venv/bin/python" 'frontier-agent==0.1.5'

cat > "${HOME}/.frontier/mcp.json" <<'EOF'
{ "mcpServers": { "openviking": { "url": "http://127.0.0.1:1933" } } }
EOF

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-frontier";
  prev.pins = { ...(prev.pins ?? {}), ...{"frontier-agent": "0.1.5", "python": "3.12"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-frontier complete"

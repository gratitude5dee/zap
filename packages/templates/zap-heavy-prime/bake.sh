#!/usr/bin/env bash
# zap-heavy-prime opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# prime-agent install script at the pinned version (C30).
curl -fsSL https://primeintellect.ai/install-agent.sh | bash -s -- --version 0.2.0

install -d -m 0700 "${HOME}/.prime/agent"
cat > "${HOME}/.prime/agent/settings.json" <<'EOF'
{
  "mcp": { "openviking": { "url": "http://127.0.0.1:1933" } },
  "providers": {}
}
EOF

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-prime";
  prev.pins = { ...(prev.pins ?? {}), ...{"prime-agent": "0.2.0"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-prime complete"

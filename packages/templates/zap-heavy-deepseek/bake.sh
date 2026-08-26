#!/usr/bin/env bash
# zap-heavy-deepseek overlay: pinned global install of the dsh RC onto
# zap-heavy. Applied via POST /boxes {from: "zap-heavy", setupScript} or
# through /commands after ready — never at fork. Headless only: the web UI on
# 3080 is never started. Presets are standard|code|minimal only. No secrets
# baked; DEEPSEEK_API_KEY arrives at runtime (BYOK) or managed mode points
# OPENAI_BASE_URL at the gateway proxy.
set -euo pipefail

DSH_PIN="0.1.1-rc.2"

npm install -g "@deepseek-ai/dsh@${DSH_PIN}"

install -d -m 0700 "${HOME}/.dsh"
cat > "${HOME}/.dsh/config.json" <<'EOF'
{
  "presets": ["standard", "code", "minimal"],
  "web": { "enabled": false },
  "mcp": { "openviking": { "url": "http://127.0.0.1:1933" } }
}
EOF

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-deepseek";
  prev.pins = { ...(prev.pins ?? {}), "@deepseek-ai/dsh": "0.1.1-rc.2" };
  // dsh headless entry recorded at bake for the cli-exec run adapter.
  prev.harnessEntry = "dsh run --json";
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-deepseek complete"

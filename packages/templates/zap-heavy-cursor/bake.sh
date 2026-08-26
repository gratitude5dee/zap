#!/usr/bin/env bash
# zap-heavy-cursor opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Installer channel pin re-verified at bake (C30).
curl https://cursor.com/install -fsS | bash

install -d -m 0755 /zap/fs/.cursor/rules
cat > /zap/fs/.cursor/mcp.json <<'EOF'
{ "mcpServers": { "openviking": { "url": "http://127.0.0.1:1933" } } }
EOF
cat > /zap/fs/.cursor/rules/zap.mdc <<'EOF'
---
description: Zap runtime rules
alwaysApply: true
---
Plan before you spend; plan-only is the default. Projects live under /zap/fs.
EOF

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-cursor";
  prev.pins = { ...(prev.pins ?? {}), ...{"cursor-agent": "2026.08"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-cursor complete"

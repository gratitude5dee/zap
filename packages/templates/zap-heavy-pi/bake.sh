#!/usr/bin/env bash
# zap-heavy-pi opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

npm install -g "@earendil-works/pi-coding-agent@0.3.2"

install -d -m 0700 "${HOME}/.pi/agent"
cat > "${HOME}/.pi/agent/settings.json" <<'EOF'
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
  prev.template = "zap-heavy-pi";
  prev.pins = { ...(prev.pins ?? {}), ...{"@earendil-works/pi-coding-agent": "0.3.2"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-pi complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

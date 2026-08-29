#!/usr/bin/env bash
# zap-heavy-opencode bake: pinned global npm install + config + AGENTS.md.
# No secrets baked: OPENCODE_SERVER_PASSWORD is generated per box at first
# boot; LLM auth arrives at runtime (BYOK allowlist or managed gateway URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OPENCODE_PIN="0.6.4"

npm install -g "opencode-ai@${OPENCODE_PIN}"

install -d -m 0700 "${HOME}/.config/opencode"
cat > "${HOME}/.config/opencode/opencode.json" <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "server": { "port": 4096, "hostname": "0.0.0.0" },
  "mcp": {
    "openviking": { "type": "remote", "url": "http://127.0.0.1:1933" }
  },
  "permission": { "edit": "allow", "bash": "ask", "webfetch": "allow" },
  "provider": {}
}
EOF

# Zap default agent instructions for OpenCode sessions on this VM.
install -m 0644 "${TEMPLATE_DIR}/AGENTS.opencode.md" "${HOME}/.config/opencode/AGENTS.md"

install -m 0755 "${TEMPLATE_DIR}/render-env.sh" /usr/local/bin/opencode-render-env
install -m 0644 "${TEMPLATE_DIR}/units/opencode-serve.service" \
  /etc/systemd/system/opencode-serve.service
systemctl enable opencode-serve.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-opencode";
  prev.pins = { ...(prev.pins ?? {}), "opencode-ai": "0.6.4" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-opencode complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

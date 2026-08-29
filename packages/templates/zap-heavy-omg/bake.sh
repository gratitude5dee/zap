#!/usr/bin/env bash
# zap-heavy-omg overlay: pinned bun global install + omg computer setup.
# Applied via POST /boxes {from: "zap-heavy", setupScript} or /commands after
# ready. No secrets baked; LLM auth arrives at runtime (BYOK or managed).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OMG_PIN="0.9.3"

bun install --global "@omg-dev/cli@${OMG_PIN}"
omg computer setup

install -d -m 0700 "${HOME}/.omg"
install -d -m 0755 /zap/fs/repos
cat > "${HOME}/.omg/.env" <<'EOF'
OMG_HOST=127.0.0.1
OMG_PORT=8766
OMG_REPOS_ROOT=/zap/fs/repos
EOF

# Register the omg MCP server into the tmux'd CLIs.
omg mcp register --all || echo "bake: omg mcp registration deferred to first boot"

install -m 0644 "${TEMPLATE_DIR}/units/omg.service" /etc/systemd/system/omg.service
systemctl enable omg.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-omg";
  prev.pins = { ...(prev.pins ?? {}), "@omg-dev/cli": "0.9.3" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-omg complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

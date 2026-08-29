#!/usr/bin/env bash
# zap-med-fx overlay: install the fx CLI onto zap-med. Applied via
# POST /boxes {from: "zap-med", setupScript} or through /commands after ready.
# No secrets are baked; LLM keys arrive at runtime (BYOK).
set -euo pipefail

curl -fsSL https://fx.sh/setup.sh | bash

install -d -m 0700 "${HOME}/.fx"
cat > "${HOME}/.fx/settings.json" <<'EOF'
{
  "output": "json"
}
EOF
cat > "${HOME}/.fx/mcp.json" <<'EOF'
{
  "mcpServers": {}
}
EOF

echo "bake: zap-med-fx complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

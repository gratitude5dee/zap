#!/usr/bin/env bash
# zap-heavy-openclaw bake: pinned global npm install + noninteractive
# onboarding + JSON config. No secrets baked: the per-box auth token is
# generated at first boot by openclaw-render-config; LLM auth arrives at
# runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OPENCLAW_PIN="1.2.0"

npm install -g "openclaw@${OPENCLAW_PIN}"
# Run the pinned version's post-install per its docs.
openclaw onboard --non-interactive --accept-defaults

install -d -m 0700 "${HOME}/.openclaw"
cat > "${HOME}/.openclaw/openclaw.json" <<'EOF'
{
  "gateway": { "port": 18789, "bind": "lan", "auth": { "token": "" } },
  "http": { "endpoints": { "chatCompletions": { "enabled": true } } },
  "channels": {
    "discord": { "enabled": false },
    "telegram": { "enabled": false },
    "slack": { "enabled": false },
    "whatsapp": { "enabled": false },
    "imessage": { "enabled": false }
  },
  "mcp": { "servers": { "openviking": { "url": "http://127.0.0.1:1933" } } },
  "models": { "providers": {} }
}
EOF

install -m 0755 "${TEMPLATE_DIR}/render-config.sh" /usr/local/bin/openclaw-render-config
install -m 0644 "${TEMPLATE_DIR}/units/openclaw-gateway.service" \
  /etc/systemd/system/openclaw-gateway.service
systemctl enable openclaw-gateway.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-openclaw";
  prev.pins = { ...(prev.pins ?? {}), openclaw: "1.2.0" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-openclaw complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

#!/usr/bin/env bash
# zap-heavy-hermes bake: install Hermes at the pinned ref and render its
# config with only api_server enabled. airv2 invariants: one user/one box,
# noEnv, client-style network posture, per-box API_SERVER_KEY, hosted routes
# re-registered by hermes-host.service after every boot/resume.
# No secrets are baked: API_SERVER_KEY is generated per box at first boot and
# BYOK/managed LLM auth arrives at runtime via the gateway env allowlist.
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HERMES_REF="v0.4.1"

uv venv "${HOME}/.hermes/venv" --python 3.12
uv pip install --python "${HOME}/.hermes/venv/bin/python" \
  "hermes-cli @ git+https://github.com/NousResearch/hermes-cli@${HERMES_REF}"

install -d -m 0700 "${HOME}/.hermes"
cat > "${HOME}/.hermes/config.yaml" <<'EOF'
# Zap-managed Hermes config. Only api_server is enabled; every other inbound
# channel stays disabled (verify: GET /api/messaging/platforms). MCP servers
# are appended by the registration helper — do not hand-edit.
api_server:
  enabled: true
memory:
  enabled: true
  backend: filesystem
mcp_servers:
  openviking:
    url: http://127.0.0.1:1933
platforms:
  discord: { enabled: false }
  telegram: { enabled: false }
  twitter: { enabled: false }
  whatsapp: { enabled: false }
  slack: { enabled: false }
  cli: { enabled: false }
EOF

# Env rendered at first boot by hermes-gateway.service ExecStartPre:
# API_SERVER_HOST=0.0.0.0, per-box random API_SERVER_KEY, and in managed mode
# OPENAI_BASE_URL=${ZAP_MANAGED_GATEWAY_URL}/llm/v1 — never a provider key.
install -m 0755 "${TEMPLATE_DIR}/render-env.sh" /usr/local/bin/hermes-render-env

for unit in hermes-gateway hermes-dashboard hermes-host; do
  install -m 0644 "${TEMPLATE_DIR}/units/${unit}.service" \
    "/etc/systemd/system/${unit}.service"
  systemctl enable "${unit}.service"
done

# Base skill set + Zap identity.
"${HOME}/.hermes/venv/bin/hermes" skills install base || echo "bake: hermes skills install deferred to first boot"
install -m 0644 "${TEMPLATE_DIR}/SOUL.md" "${HOME}/.hermes/SOUL.md"

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-hermes";
  prev.pins = { ...(prev.pins ?? {}), HERMES_REF: "v0.4.1" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-hermes complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

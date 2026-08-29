#!/usr/bin/env bash
# zap-heavy-devin opt-in overlay: applied over zap-heavy via POST /boxes {from,
# setupScript} or /commands after ready — never at fork. No secrets baked;
# LLM auth arrives at runtime (BYOK allowlist or managed gateway base URL).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Installer channel pin re-verified at bake (C30).
curl -fsSL https://cli.devin.ai/install.sh | bash

install -d -m 0700 "${HOME}/.devin"
# DEVIN_OUTPOST_ID / DEVIN_OUTPOSTS_TOKEN arrive at runtime via the env
# allowlist — never baked.
install -m 0644 "${TEMPLATE_DIR}/units/devin-worker.service" \
  /etc/systemd/system/devin-worker.service
systemctl enable devin-worker.service

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-devin";
  prev.pins = { ...(prev.pins ?? {}), ...{"devin-cli": "2026.08"} };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-devin complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

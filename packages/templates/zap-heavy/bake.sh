#!/usr/bin/env bash
# zap-heavy bake: layer on-VM memory, the API store, and the skills store onto
# zap-med. Runs at snapshot-build time from a clean zap-med base; never bakes
# secrets (boxes are created with noEnv:true and keys arrive at runtime via
# the gateway env allowlist in template.json).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for fragment in "${TEMPLATE_DIR}"/bake.d/*.sh; do
  echo "bake: ${fragment##*/}"
  # shellcheck source=/dev/null
  source "${fragment}"
done

# Record pins for `zap harness doctor` and C30 audits. Non-secret metadata only.
install -d -m 0755 "${HOME}/.zap"
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy";
  prev.bakedAt = new Date().toISOString();
  prev.pins = { ...(prev.pins ?? {}), openviking: "0.4.13", "openviking-sdk": "0.1.7" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

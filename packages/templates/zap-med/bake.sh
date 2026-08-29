#!/usr/bin/env bash
# zap-med bake: layer the gateway, media FS, and ffmpeg presets onto zap-light.
# Runs at snapshot-build time from a clean zap-light base; never bakes secrets
# (boxes are created with noEnv:true and keys arrive at runtime via the
# gateway env allowlist in template.json).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for fragment in "${TEMPLATE_DIR}"/bake.d/*.sh; do
  echo "bake: ${fragment##*/}"
  # shellcheck source=/dev/null
  source "${fragment}"
done

echo "bake: zap-med complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

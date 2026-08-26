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

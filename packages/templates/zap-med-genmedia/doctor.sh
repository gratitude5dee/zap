#!/usr/bin/env bash
# zap-med-genmedia doctor: base zap-med checks plus the pinned media defaults.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-med/doctor.sh"
test -s /zap/media-defaults.json && echo "ok   media defaults" || { echo "FAIL media defaults"; exit 1; }
# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true


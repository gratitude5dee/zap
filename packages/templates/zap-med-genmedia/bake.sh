#!/usr/bin/env bash
# zap-med-genmedia alias: zap-med with gen-media provider defaults pinned.
# Applied via POST /boxes {from: "zap-med", setupScript} — no named snapshot.
set -euo pipefail

cat > /zap/media-defaults.json <<'EOF'
{
  "schema": 1,
  "image.gen": { "provider": "fal", "model": "fal-ai/flux/dev" },
  "video.gen": { "provider": "gmi", "model": "seedance-2-0-260128" },
  "audio.gen": { "provider": "replicate", "model": "minimax/speech-02-turbo" }
}
EOF

echo "bake: zap-med-genmedia complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

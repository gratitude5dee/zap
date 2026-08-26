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

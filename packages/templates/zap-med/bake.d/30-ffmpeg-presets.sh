#!/usr/bin/env bash
# FFmpeg presets manifest: the data-defined preset ids available through the
# ffmpeg lane. The argv shapes live in @wzrdtech/zap-runtime/ffmpeg.
set -euo pipefail

command -v ffmpeg >/dev/null || { echo "ffmpeg missing from zap-light base" >&2; exit 1; }

cat > /zap/ffmpeg-presets.json <<'EOF'
{
  "schema": 1,
  "lane": "ffmpeg",
  "presets": [
    "transcode-h264",
    "extract-audio",
    "thumbnail",
    "trim",
    "scale-720p",
    "stitch",
    "overlay",
    "gen-media-post"
  ]
}
EOF

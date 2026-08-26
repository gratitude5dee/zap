#!/usr/bin/env bash
# zap-med doctor: gateway + media FS + presets are available at boot.
set -euo pipefail

fail=0
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "ok   ${name}"
  else
    echo "FAIL ${name}"
    fail=1
  fi
}

check "zap-agentd.service" systemctl is-active zap-agentd.service
check "ffmpeg" command -v ffmpeg
check "media-fs /zap/media" test -d /zap/media/image
check "project-fs /zap/fs" test -d /zap/fs
check "skills /zap/skills" test -d /zap/skills
check "presets manifest" test -s /zap/ffmpeg-presets.json
check "gateway env allowlist" test -s /zap/gateway-env-allowlist

exit "${fail}"

#!/usr/bin/env bash
# zap-light doctor: one PASS/FAIL line per baseline check; exits non-zero if
# any check fails, so template verification only records healthy boxes.
set -uo pipefail

HOME_DIR="${HOME:-/home/user}"
FAILED=0

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS $name"
  else
    echo "FAIL $name"
    FAILED=1
  fi
}

check "ffmpeg" command -v ffmpeg
check "node-24" bash -c '[ "$(node -p "process.versions.node.split(\".\")[0]")" = "24" ]'
check "python-3.12" command -v python3.12
check "bun" command -v bun
check "docker" command -v docker
check "chrome" bash -c 'ls "$HOME/.cache/ms-playwright"/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1 | grep -q chrome'
check "playwright" bash -c 'npx --no-install playwright --version'
check "zap-cli" command -v zap
check "zap-mcp" bash -c 'zap mcp --help'
check "zap-agentd-active" systemctl is-active --quiet zap-agentd
check "zap-fs-writable" bash -c 'touch /zap/fs/.doctor-probe && rm /zap/fs/.doctor-probe'
# Hosted route must be absent or private: a public 8722 would bypass bearer auth.
check "hosted-route-absent-or-private" bash -c '
  manifest="$HOME/.zap/hosted.json"
  [ ! -f "$manifest" ] || ! jq -e ".[] | select(.port == 8722 and .isPrivate == false)" "$manifest"
'

if [ "$FAILED" -ne 0 ]; then
  echo "doctor: FAILED" >&2
  exit 1
fi
echo "doctor: OK"

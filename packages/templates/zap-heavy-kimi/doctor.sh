#!/usr/bin/env bash
# zap-heavy-kimi doctor: base checks + harness checks.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-heavy/doctor.sh"

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

check "kimi-web.service" systemctl is-active kimi-web.service
check "web :58627" bash -c 'ss -ltn | grep -q ":58627"'
check "mcp.json" test -s "${HOME}/.kimi/mcp.json"
check "pins recorded" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || Object.keys(t.pins).length === 0) process.exit(1);
"'

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

#!/usr/bin/env bash
# zap-heavy-pi doctor: base checks + harness checks.
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

check "pi --version" pi --version
check "settings.json" test -s "${HOME}/.pi/agent/settings.json"
check "pins recorded" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || Object.keys(t.pins).length === 0) process.exit(1);
"'

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

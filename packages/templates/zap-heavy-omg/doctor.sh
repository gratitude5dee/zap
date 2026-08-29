#!/usr/bin/env bash
# zap-heavy-omg doctor: base checks + omg computer invariants.
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

check "omg.service" systemctl is-active omg.service
check "omg on 127.0.0.1:8766" bash -c 'ss -ltn | grep "127.0.0.1:8766"'
check "omg loopback only" bash -c '! ss -ltn | awk "{print \$4}" | grep -E "(0\.0\.0\.0|\[::\]):8766"'
check "repos root" test -d /zap/fs/repos
check "omg env" bash -c 'grep -q "^OMG_REPOS_ROOT=/zap/fs/repos$" "${HOME}/.omg/.env"'
check "omg mcp registered" bash -c 'omg mcp list | grep -q omg'
check "omg pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins[\"@omg-dev/cli\"]) process.exit(1);
"'

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

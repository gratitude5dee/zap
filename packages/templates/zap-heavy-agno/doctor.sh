#!/usr/bin/env bash
# zap-heavy-agno doctor: base checks + harness checks.
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

check "agno-os.service" systemctl is-active agno-os.service
check "AgentOS :7777" bash -c 'ss -ltn | grep -q ":7777"'
check "per-box OS_SECURITY_KEY" bash -c 'grep -q "^OS_SECURITY_KEY=." /opt/zap/agno/.env'
check "pins recorded" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || Object.keys(t.pins).length === 0) process.exit(1);
"'

exit "${fail}"

#!/usr/bin/env bash
# zap-heavy doctor: base checks + memory + API store + skills store.
# Includes the Z5/Z8 in-runtime checks: mcp-openviking, mcp-context7,
# mcp-open-connector, open-connector-loopback.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-med/doctor.sh"

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

check "zap-openviking.service" systemctl is-active zap-openviking.service
check "zap-open-connector.service" systemctl is-active zap-open-connector.service
check "zap-host.service" systemctl is-enabled zap-host.service
check "openviking loopback :1933" bash -c 'curl -fsS http://127.0.0.1:1933/health'
check "mcp-openviking" bash -c 'grep -rq "openviking" "${HOME}/.zap/mcp"'
check "mcp-context7" bash -c 'grep -rq "context7" "${HOME}/.zap/mcp"'
check "mcp-open-connector" bash -c 'grep -rq "open-connector" "${HOME}/.zap/mcp"'
check "open-connector-loopback" bash -c '
  set -e
  curl -fsS http://127.0.0.1:1934/health >/dev/null
  # loopback only: the port must not be bound on a routable address.
  ! ss -ltn | awk "{print \$4}" | grep -E "(0\.0\.0\.0|\[::\]):1934"
'
check "skills store /zap/skills" test -s /zap/skills/index.json
check "template pins recorded" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || Object.keys(t.pins).length === 0) process.exit(1);
"'

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

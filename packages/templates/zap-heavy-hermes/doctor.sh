#!/usr/bin/env bash
# zap-heavy-hermes doctor: base checks + airv2 invariants.
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

key="$(grep '^API_SERVER_KEY=' "${HOME}/.hermes/.env" | cut -d= -f2)"

check "hermes-gateway.service" systemctl is-active hermes-gateway.service
check "hermes-dashboard.service" systemctl is-active hermes-dashboard.service
check "hermes-host.service" systemctl is-enabled hermes-host.service
check "api_server on 0.0.0.0:8642" bash -c 'ss -ltn | grep -q ":8642"'
check "per-box API_SERVER_KEY" test -n "${key}"
check "api_server auth enforced" bash -c 'test "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/api/sessions)" = "401"'
check "only api_server inbound" bash -c "
  curl -fsS -H \"Authorization: Bearer ${key}\" http://127.0.0.1:8642/api/messaging/platforms \
  | node -e '
    let d = \"\";
    process.stdin.on(\"data\", (c) => (d += c));
    process.stdin.on(\"end\", () => {
      const platforms = JSON.parse(d);
      const enabled = Object.entries(platforms).filter(([, p]) => p && p.enabled);
      process.exit(enabled.length === 0 ? 0 : 1);
    });
  '
"
check "filesystem memory on" bash -c 'grep -A2 "^memory:" "${HOME}/.hermes/config.yaml" | grep -q "enabled: true"'
check "mcp openviking registered" bash -c 'grep -q "openviking" "${HOME}/.hermes/config.yaml"'
check "dashboard :9119" bash -c 'curl -fsS -o /dev/null http://127.0.0.1:9119/ || ss -ltn | grep -q ":9119"'
check "HERMES_REF pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins.HERMES_REF) process.exit(1);
"'
if [ "${ZAP_PAYER_MODE:-}" = "managed" ]; then
  check "managed: gateway base url" bash -c 'grep -q "^OPENAI_BASE_URL=.*\/gateway\/llm\/v1$" "${HOME}/.hermes/.env"'
  check "managed: no provider key" bash -c '! grep -Eq "^(OPENAI|ANTHROPIC)_API_KEY=" "${HOME}/.hermes/.env"'
fi

exit "${fail}"

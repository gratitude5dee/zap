#!/usr/bin/env bash
# zap-heavy-exo doctor: base checks + airv2 invariants for exo agentd.
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

key="$(grep '^API_SERVER_KEY=' "${HOME}/.exo/.env" | cut -d= -f2)"
agent="$(grep '^EXO_AGENT=' "${HOME}/.exo/.env" | cut -d= -f2)"

check "exo binary" command -v exo
check "exo-agentd.service" systemctl is-active exo-agentd.service
check "exo-host.service" systemctl is-enabled exo-host.service
check "agentd on 0.0.0.0:8642" bash -c 'ss -ltn | grep -q ":8642"'
check "per-box API_SERVER_KEY" test -n "${key}"
check "health" bash -c 'curl -fsS http://127.0.0.1:8642/health | grep -q "\"status\":\"ok\""'
check "agentd auth enforced" bash -c 'test "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8642/api/sessions)" = "401"'
check "agentd sessions with key" bash -c "curl -fsS -H \"Authorization: Bearer ${key}\" http://127.0.0.1:8642/api/sessions >/dev/null"
check "only agentd inbound (no substrate, no adapters)" bash -c '! pgrep -f "exo .*(serve|adapter)" >/dev/null'
check "zap agent registered" exo --root "${HOME}/.exo" --harness exo agent show "${agent}"
check "recipe tool module mounted" test -f /zap/exo/zap-tools.mjs
check "skills store mounted" test -d /zap/skills
check "mcp openviking registered" bash -c 'grep -q "openviking" "${HOME}/.exo/mcp.json"'
check "EXO_REF pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins.EXO_REF || !t.pins.EXO_SHA) process.exit(1);
"'
if [ "${ZAP_PAYER_MODE:-}" = "managed" ]; then
  check "managed: gateway base url" bash -c 'grep -q "^EXO_MODEL_BASE_URL=.*\/gateway\/llm\/v1$" "${HOME}/.exo/.env"'
  check "managed: no provider key" bash -c '! grep -Eq "^(OPENAI|ANTHROPIC)_API_KEY=" "${HOME}/.exo/.env"'
fi

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

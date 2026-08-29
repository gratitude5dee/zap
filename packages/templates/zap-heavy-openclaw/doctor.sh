#!/usr/bin/env bash
# zap-heavy-openclaw doctor: base checks + gateway invariants.
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

check "openclaw-gateway.service" systemctl is-active openclaw-gateway.service
check "gateway :18789" bash -c 'ss -ltn | grep -q ":18789"'
check "per-box auth token" bash -c 'node -e "
  const c = require(process.env.HOME + \"/.openclaw/openclaw.json\");
  if (!c.gateway.auth.token) process.exit(1);
"'
check "chat completions on, channels off" bash -c 'node -e "
  const c = require(process.env.HOME + \"/.openclaw/openclaw.json\");
  if (!c.http.endpoints.chatCompletions.enabled) process.exit(1);
  if (Object.values(c.channels).some((ch) => ch.enabled)) process.exit(1);
"'
check "mcp openviking registered" bash -c 'node -e "
  const c = require(process.env.HOME + \"/.openclaw/openclaw.json\");
  if (!c.mcp.servers.openviking) process.exit(1);
"'
check "openclaw pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins.openclaw) process.exit(1);
"'
if [ "${ZAP_PAYER_MODE:-}" = "managed" ]; then
  check "managed: gateway base url" bash -c 'node -e "
    const c = require(process.env.HOME + \"/.openclaw/openclaw.json\");
    const url = c.models.providers.zap && c.models.providers.zap.baseUrl;
    if (!url || !url.includes(\"/gateway/llm/v1\")) process.exit(1);
  "'
  check "managed: no provider key on disk" bash -c '! grep -Eq "sk-[A-Za-z0-9]" "${HOME}/.openclaw/openclaw.json"'
fi

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

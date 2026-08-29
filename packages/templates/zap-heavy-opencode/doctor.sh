#!/usr/bin/env bash
# zap-heavy-opencode doctor: base checks + server invariants.
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

check "opencode-serve.service" systemctl is-active opencode-serve.service
check "server :4096" bash -c 'ss -ltn | grep -q ":4096"'
check "per-box server password" bash -c 'grep -q "^OPENCODE_SERVER_PASSWORD=." "${HOME}/.config/opencode/.env"'
check "mcp openviking registered" bash -c 'node -e "
  const c = require(process.env.HOME + \"/.config/opencode/opencode.json\");
  if (!c.mcp.openviking) process.exit(1);
"'
check "AGENTS.md present" test -s "${HOME}/.config/opencode/AGENTS.md"
check "opencode-ai pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins[\"opencode-ai\"]) process.exit(1);
"'
if [ "${ZAP_PAYER_MODE:-}" = "managed" ]; then
  check "managed: gateway base url" bash -c 'node -e "
    const c = require(process.env.HOME + \"/.config/opencode/opencode.json\");
    const url = c.provider.zap && c.provider.zap.options.baseURL;
    if (!url || !url.includes(\"/gateway/llm/v1\")) process.exit(1);
  "'
  check "managed: no provider key on disk" bash -c '! grep -Eq "sk-[A-Za-z0-9]" "${HOME}/.config/opencode/opencode.json"'
fi

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

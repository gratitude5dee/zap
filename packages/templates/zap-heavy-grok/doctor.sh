#!/usr/bin/env bash
# zap-heavy-grok doctor: opencode checks + xAI route.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-heavy-opencode/doctor.sh"

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

check "xai default route" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (t.llmRoute !== \"xai\") process.exit(1);
"'
check "no xai key on disk" bash -c '! grep -rq "xai-" "${HOME}/.config/opencode" "${HOME}/.zap/template.json"'

echo "note xAI-routed; the Grok Bot product has no runtime surface (verify item 11)"
# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

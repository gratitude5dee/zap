#!/usr/bin/env bash
# zap-heavy-deepseek doctor: base checks + headless dsh invariants.
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

check "dsh --version" dsh --version
check "supported presets only" bash -c 'node -e "
  const c = require(process.env.HOME + \"/.dsh/config.json\");
  const supported = [\"standard\", \"code\", \"minimal\"];
  if (c.presets.length !== 3) process.exit(1);
  if (!c.presets.every((p) => supported.includes(p))) process.exit(1);
"'
check "web ui not started (:3080 closed)" bash -c '! ss -ltn | grep -q ":3080"'
check "dsh pinned" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  if (!t.pins || !t.pins[\"@deepseek-ai/dsh\"]) process.exit(1);
"'

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

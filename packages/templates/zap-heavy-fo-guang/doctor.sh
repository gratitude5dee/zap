#!/usr/bin/env bash
# zap-heavy-fo-guang doctor: base checks + the fo-guang robotics profile
# (sim, telemetry bridge, reconstruction) and the GPU vs CPU-only mode.
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

check "mujoco_playground importable" python -c 'import mujoco_playground'
check "abot_recon importable" python -c 'import abot_recon'
check "hidapi importable" python -c 'import hid'
check "gods-eye-view robot bridge" bash -c 'node "${HOME}/gods-eye-view/tools/robot-bridge/bridge.mjs" --help || test -s "${HOME}/gods-eye-view/tools/robot-bridge/bridge.mjs"'
check "ABot-Recon demo" test -s "${HOME}/ABot-Recon/demo.py"
check "robot state dir" test -d /zap/fs/robot
check "fo-guang skill installed" test -s /zap/skills/fo-guang/SKILL.md
check "fo-guang skill indexed" bash -c 'node -e "
  const index = require(\"/zap/skills/index.json\");
  process.exit(Array.isArray(index.skills) && index.skills.includes(\"fo-guang\") ? 0 : 1);
"'
check "refs recorded" bash -c 'node -e "
  const t = require(process.env.HOME + \"/.zap/template.json\");
  for (const pin of [\"mujoco_playground\", \"gods-eye-view\", \"ABot-Recon\"]) {
    if (!t.pins || !t.pins[pin]) process.exit(1);
  }
"'
check "no secrets on disk" bash -c '! grep -rqE "GEV_ROBOT_INGEST_TOKEN=.|xai-" "${HOME}/.zap/template.json" "${HOME}/gods-eye-view/.env" 2>/dev/null'

if node -e '
  const t = require(process.env.HOME + "/.zap/template.json");
  process.exit(t.cpuOptimized === true ? 0 : 1);
' >/dev/null 2>&1; then
  echo "note CPU-only mode (cpuOptimized): sim2sim playback + ABot-Recon CPU inference; MJX/PPO training needs a GPU box"
else
  echo "note GPU mode: jax[cuda12] layered over Playground's CPU-only JAX pin for MJX/PPO training"
fi
echo "note telemetry is inbound-only; robot /command and /map stay disabled"

# Optional connectivity rows (required:false — never fail the build).
bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity/doctor.sh" || true

exit "${fail}"

#!/usr/bin/env bash
# zap-heavy-fo-guang overlay: applied over zap-heavy via POST /boxes
# {from, setupScript} or /commands after ready. Installs the fo-guang robotics
# profile: MuJoCo Playground (Unitree G1 sim2sim), the God's Eye View telemetry
# bridge, and ABot-Recon. No secrets baked: GEV_ROBOT_INGEST_TOKEN, XAI_API_KEY
# and friends arrive at runtime through the BYOK/env allowlist only (C6).
#
# GPU vs CPU-only mode is detected from the box (nvidia-smi); set
# FO_GUANG_CPU_ONLY=1 or =0 to override. CPU-only skips the CUDA JAX layer
# (sim2sim playback and ABot-Recon CPU inference only; MJX/PPO training needs
# a GPU box).
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MUJOCO_PLAYGROUND_REF="0f946c4d9c5f4cc45a7ef094895b67183475c512"
GODS_EYE_VIEW_REF="cf9874ab20cbf036c7180beb77cd6ee49d9e414a"
ABOT_RECON_REF="0962a31c35b483361adef178ff9f641fa8651890"
ONNXRUNTIME_PIN="1.29.0"
HIDAPI_PIN="0.14.0.post4"
TORCH_PIN="2.5.1"
case "${FO_GUANG_CPU_ONLY:-auto}" in
  1) CPU_ONLY=1 ;;
  0) CPU_ONLY=0 ;;
  auto)
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
      CPU_ONLY=0
    else
      CPU_ONLY=1
    fi
    ;;
  *) echo "FO_GUANG_CPU_ONLY must be 0 or 1" >&2; exit 2 ;;
esac

install -d -m 0755 /zap/fs/robot

clone_at() {
  local url="$1" dir="$2" ref="$3"
  git clone "${url}" "${dir}"
  git -C "${dir}" checkout --detach "${ref}"
}

# ── Sim: MuJoCo Playground + the G1 sim2sim playback deps ────────────────
# hidapi is mandatory: play_g1_joystick.py imports gamepad_reader, which
# imports `hid` at module scope, so playback exits before the sim starts
# without it.
clone_at https://github.com/gratitude5dee/mujoco_playground.git "${HOME}/mujoco_playground" "${MUJOCO_PLAYGROUND_REF}"
pip install -e "${HOME}/mujoco_playground" "onnxruntime==${ONNXRUNTIME_PIN}" "hidapi==${HIDAPI_PIN}"

# Playground pins CPU-only JAX, so PPO trains on the CPU unless the CUDA
# wheels are layered over it — GPU boxes only.
if [ "${CPU_ONLY}" = "1" ]; then
  echo "bake: CPU-only mode — skipping jax[cuda12]; sim2sim playback and CPU inference only"
else
  pip install -U "jax[cuda12]"
fi

# ── Telemetry: God's Eye View bridge (inbound-only) ──────────────────────
clone_at https://github.com/gratitude5dee/gods-eye-view.git "${HOME}/gods-eye-view" "${GODS_EYE_VIEW_REF}"
npm --prefix "${HOME}/gods-eye-view" install

# ── Reconstruction: ABot-Recon over the G1 head camera ───────────────────
clone_at https://github.com/gratitude5dee/ABot-Recon.git "${HOME}/ABot-Recon" "${ABOT_RECON_REF}"
pip install -e "${HOME}/ABot-Recon"

# ── Skill: register the rollout runbook in the inherited skills store ─────
install -d -m 0755 /zap/skills/fo-guang
install -m 0644 "${TEMPLATE_DIR}/skills/fo-guang/SKILL.md" /zap/skills/fo-guang/SKILL.md
node -e '
  const fs = require("node:fs");
  const file = "/zap/skills/index.json";
  const index = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { skills: [] };
  index.skills ??= [];
  if (!index.skills.includes("fo-guang")) index.skills.push("fo-guang");
  fs.writeFileSync(file, JSON.stringify(index, null, 2) + "\n");
'

# Installed refs and pins recorded as non-secret metadata (C30) so doctor can
# report the GPU vs CPU-only mode.
FO_GUANG_CPU_ONLY="${CPU_ONLY}" \
MUJOCO_PLAYGROUND_REF="${MUJOCO_PLAYGROUND_REF}" \
GODS_EYE_VIEW_REF="${GODS_EYE_VIEW_REF}" \
ABOT_RECON_REF="${ABOT_RECON_REF}" \
ONNXRUNTIME_PIN="${ONNXRUNTIME_PIN}" \
HIDAPI_PIN="${HIDAPI_PIN}" \
TORCH_PIN="${TORCH_PIN}" \
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-fo-guang";
  prev.cpuOptimized = process.env.FO_GUANG_CPU_ONLY === "1";
  prev.pins = {
    ...(prev.pins ?? {}),
    mujoco_playground: process.env.MUJOCO_PLAYGROUND_REF,
    "gods-eye-view": process.env.GODS_EYE_VIEW_REF,
    "ABot-Recon": process.env.ABOT_RECON_REF,
    onnxruntime: process.env.ONNXRUNTIME_PIN,
    hidapi: process.env.HIDAPI_PIN,
    torch: process.env.TORCH_PIN,
  };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-fo-guang complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="${TEMPLATE_DIR}/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

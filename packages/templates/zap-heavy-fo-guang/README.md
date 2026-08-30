# zap-heavy-fo-guang

Overlay of `zap-heavy` (no named snapshot) carrying the fo-guang robotics
profile: the Unitree G1 sim2sim stack, the God's Eye View telemetry bridge, and
ABot-Recon reconstruction from the G1 head camera.

`bake.sh` clones and installs three repos at pinned refs:

- `gratitude5dee/mujoco_playground` → `~/mujoco_playground` (`pip install -e`
  plus `onnxruntime` and the mandatory `hidapi`)
- `gratitude5dee/gods-eye-view` → `~/gods-eye-view` (`npm install`)
- `gratitude5dee/ABot-Recon` → `~/ABot-Recon` (`pip install -e`)

Modes: GPU boxes get `jax[cuda12]` layered over Playground's CPU-only JAX pin
for MJX/PPO training. `FO_GUANG_CPU_ONLY=1` skips that step and records
`cpuOptimized: true` in `~/.zap/template.json`; sim2sim playback of an exported
policy and ABot-Recon CPU inference still work. Telemetry is inbound-only and
socket-based, so the template hosts no port. No secrets are baked.

The runbook is `skills/fo-guang/SKILL.md`; the manifest lives at
`packages/runtime/src/harness/fo-guang.ts`.

See `docs/templates/zap-heavy-fo-guang.md`.

# zap-heavy-fo-guang runtime

This VM is a `zap-heavy` runtime carrying the fo-guang robotics profile:
Unitree G1 sim2sim, God's Eye View telemetry, and ABot-Recon reconstruction.

- Clones: `~/mujoco_playground` (sim + `train-jax-ppo`), `~/gods-eye-view`
  (telemetry bridge at `tools/robot-bridge/bridge.mjs`), `~/ABot-Recon`
  (reconstruction, `demo.py`). Rollout artifacts belong under `/zap/fs/robot`.
- The rollout is train → export ONNX → sim2sim → stream telemetry to God's Eye
  View → reconstruct the head-camera stream with ABot-Recon. The runbook lives
  in `skills/fo-guang/SKILL.md`.
- Telemetry is **inbound-only**: never enable or call robot `/command` or
  `/map`. The bridge speaks over a UNIX socket, so no port is hosted.
- MJX/PPO training needs a GPU box. `cpuOptimized: true` in
  `~/.zap/template.json` means the CUDA JAX layer was skipped: sim2sim playback
  of an exported policy and ABot-Recon CPU inference only.
- `GEV_ROBOT_INGEST_TOKEN` and every model key are BYOK-only and never baked.
- All zap-heavy rules apply: plan-only default, `noEnv:true` boxes, no secrets
  in the snapshot.

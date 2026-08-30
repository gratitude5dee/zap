---
name: fo-guang
description: Unitree G1 rollout on the fo-guang profile - train the G1 joystick policy, export ONNX, run MuJoCo sim2sim, stream RobotFrames to God's Eye View, and reconstruct the head-camera stream with ABot-Recon. Load when running the G1 or putting a robot on the God's Eye View map.
version: 0.1.0
metadata:
  zap:
    weight: heavy
    harnesses:
      - fo-guang
---

# fo-guang

The robotics profile of `zap-heavy-fo-guang`. Every step is plan-only until the
operator passes `--live` with a payer configured; without `--live`, report the
plan and the quote and stop.

## Install invariants

`bake.sh` already cloned `~/mujoco_playground`, `~/gods-eye-view`, and
`~/ABot-Recon` at the refs recorded in `~/.zap/template.json`. If you install by
hand:

- `hidapi` is not optional: `play_g1_joystick.py` imports `gamepad_reader`,
  which imports `hid` at module scope, so playback exits before the sim starts.
- Playground pins CPU-only JAX. On a GPU box layer the CUDA wheels over it
  (`pip install -U "jax[cuda12]"`); otherwise PPO trains on the CPU.

## Rollout

1. **Sandbox.** Fork `zap-heavy-fo-guang` and `zap runtime up` it. MJX/PPO
   training wants a GPU box; a CPU box is only enough for sim2sim playback of an
   already-exported policy and for ABot-Recon CPU inference.
2. **Train.** `train-jax-ppo --env_name {TERRAIN}` with `{TERRAIN}` =
   `G1JoystickFlatTerrain` or `G1JoystickRoughTerrain`. Checkpoints land in the
   run's logdir.
3. **Export.** Convert the policy to ONNX per
   `~/mujoco_playground/mujoco_playground/experimental/sim2sim/README.md` and
   copy it beside the play script as `g1_policy.onnx`.
4. **Stream.** Start the bridge and the rollout:

   ```
   node ~/gods-eye-view/tools/robot-bridge/bridge.mjs --provider mujoco-g1 \
       --socket /tmp/g1-telemetry.sock --ingest {RELAY_URL} &
   python ~/mujoco_playground/mujoco_playground/experimental/sim2sim/play_g1_joystick.py \
       --telemetry /tmp/g1-telemetry.sock --telemetry_robot_id {ROBOT_ID}
   ```

   The bridge authenticates with `GEV_ROBOT_INGEST_TOKEN` (BYOK, injected at
   boot). Frames carry provenance `live-g1` and are validated against the
   RobotFrame schema before ingest.
5. **Reconstruct.** Capture the G1 head camera into `/zap/fs/robot/frames`, then
   run ABot-Recon over it. CPU boxes (`cpuOptimized: true`):

   ```
   python ~/ABot-Recon/demo.py --image-dir /zap/fs/robot/frames \
       --device cpu --amp-dtype fp32 --no-loop-closure [--quantize]
   ```

   `--amp-dtype fp32` is the only meaningful CPU precision, and `--quantize`
   (dynamic INT8, CPU-only) buys weight memory, not throughput — CPU runs about
   0.3 FPS against the H100 baseline. Load the resulting PLY into God's Eye View
   and fly to the reconstruction anchor.
6. **Clip.** Screenshot the robot on the map, pass it as the optional `capture`
   input, and run the Zap for the share clip.

## Rules

- Inbound telemetry only. Never enable or call robot `/command` or `/map`.
- Never bake credentials into a template or snapshot; inject at boot.
- Tear the runtime down with `zap runtime down <id>` when the rollout ends.

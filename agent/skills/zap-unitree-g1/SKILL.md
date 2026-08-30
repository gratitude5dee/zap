---
description: Unitree G1 humanoid rollout - train the G1 joystick policy in a compute sandbox, run MuJoCo sim2sim, stream RobotFrames to a God's Eye View relay, and cut a clip. Load when the user asks to run unitree-g1 or to put a G1 on the God's Eye View map.
---

# Unitree G1 Zap

Executable recipe frontmatter lives in sibling `Zap.md`; this Eve skill keeps
the recipe discoverable through progressive disclosure and carries the compute
runbook, which is not expressible as Zap media steps.

Use `run_zap` with slug `unitree-g1` for the share clip. Use the prompt files in
`prompts/` when authoring or revising the recipe.

## Runbook

Read `skills/zap-runtime/SKILL.md` and `skills/zap-templates/SKILL.md` first.
Every step below is plan-only until the operator passes `--live` with a payer
configured; without `--live`, report the plan and the quote and stop.

1. **Sandbox.** Fork a heavy template (`zap template ls --json`) and
   `zap runtime up` it. MJX/PPO training wants a GPU box; a CPU box is only
   enough for sim2sim playback of an already-exported policy. The Sprite preset
   (`agent/sprites/unitree-g1/Sprite.md`) is `daytona-standard`, never
   `box-standard`.
2. **Install.** Neither the sim nor the telemetry bridge lives in this repo, so
   the runtime has to fetch both; the paths in step 5 are relative to these
   clones:

   ```
   git clone https://github.com/gratitude5dee/mujoco_playground.git ~/mujoco_playground
   pip install -e ~/mujoco_playground onnxruntime hidapi
   # GPU box only: Playground pins CPU-only JAX, so PPO trains on the CPU
   # unless the CUDA wheels are installed over it.
   pip install -U "jax[cuda12]"
   git clone https://github.com/gratitude5dee/gods-eye-view.git ~/gods-eye-view
   npm --prefix ~/gods-eye-view install
   ```

   `hidapi` is not optional: the play script imports `gamepad_reader`, which
   imports `hid` at module scope, so playback exits before the sim starts
   without it.

3. **Train.** `train-jax-ppo --env_name {TERRAIN}` where `{TERRAIN}` is
   `G1JoystickFlatTerrain` or `G1JoystickRoughTerrain`. Checkpoints land in the
   run's logdir.
4. **Export.** Convert the policy to ONNX as described in
   `~/mujoco_playground/mujoco_playground/experimental/sim2sim/README.md`, then
   copy it beside the play script as `g1_policy.onnx`.
5. **Stream.** Start the God's Eye View bridge and the rollout:

   ```
   node ~/gods-eye-view/tools/robot-bridge/bridge.mjs --provider mujoco-g1 \
       --socket /tmp/g1-telemetry.sock --ingest {RELAY_URL} &
   python ~/mujoco_playground/mujoco_playground/experimental/sim2sim/play_g1_joystick.py \
       --telemetry /tmp/g1-telemetry.sock --telemetry_robot_id {ROBOT_ID}
   ```

   The bridge authenticates with `GEV_ROBOT_INGEST_TOKEN`. Frames carry
   provenance `live-g1` and are validated against the RobotFrame schema before
   ingest.
6. **Clip.** Capture the robot on the God's Eye View map, pass the screenshot as
   the optional `capture` input, and run the Zap for the share clip.

## Rules

- Inbound telemetry only. Never enable or call robot `/command` or `/map`.
- Never bake credentials into a template or snapshot; inject at boot.
- Tear the runtime down with `zap runtime down <id>` when the rollout ends.

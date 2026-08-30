---
zap: unitree-g1
version: 2
description: Unitree G1 sim2sim rollout reel. Use when the user wants to train the G1 joystick policy in a sandbox, stream RobotFrames to a God's Eye View relay, and cut a clip of the run.
inputs:
  RELAY_URL:
    type: string
    required: true
    label: GEV ingest relay URL
    hint: https://<gev-host>/api/robot/ingest
  ROBOT_ID:
    type: string
    required: true
    label: Robot id
    hint: lowercase, 1-16 chars, e.g. g1-01
  TERRAIN:
    type: string
    required: true
    label: Training environment
    hint: G1JoystickFlatTerrain or G1JoystickRoughTerrain
  capture:
    type: image
    required: false
    hint: optional God's Eye View screenshot of the streamed robot
defaults:
  provider: gmi
  aspect: "16:9"
budget:
  estimate_usd: 0.75
  cap_usd: 5
steps:
  - id: plate
    kind: image.gen
    tier: draft
    model: fal-ai/flux/dev
    provider: fal
    prompt: prompts/rollout-plate.md
  - id: rollout
    kind: video.gen
    tier: final
    candidates: 1
    model: seedance-2-0-260128
    provider: gmi
    duration_s: 10
    reference_images: [plate, user.capture]
    prompt: prompts/rollout-gen.md
  - id: finalize
    kind: stitch
    inputs: [rollout]
    stitch:
      engine: auto
      format: mp4
      quality: standard
    audio:
      mix: keep
output: Zap.mp4
---

# Unitree G1

The renderable part of this recipe is the share clip of a rollout. The compute
that produces the rollout — sandbox, training, ONNX export, sim2sim, and the
telemetry stream into God's Eye View — is orchestrated by the sibling
`SKILL.md` runbook through `zap runtime`, because Zap steps only quote and
execute generative media jobs.

Nothing here spends provider or sandbox budget until a run is invoked with
`--live` and a configured payer. Plan the run first, read the quote, then decide.

The telemetry direction is inbound-only: frames go from the sandbox to the GEV
`/api/robot/ingest` relay. This recipe never touches robot `/command` or `/map`
endpoints, which stay unavailable.

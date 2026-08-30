---
sprite: unitree-g1
version: 1
description: A humanoid robotics Sprite that trains a Unitree G1 joystick policy in a compute sandbox and streams the rollout to a God's Eye View relay.
zaps:
  - unitree-g1
sandbox: daytona-standard
model:
  route: gateway
  id: anthropic/claude-sonnet-4.6
connections: []
connectors: []
social: []
channels:
  - slack
---

# Unitree G1 Sprite

Runs the Unitree G1 Zap and reports rollouts in Slack.

The sandbox preset is `daytona-standard` rather than `box-standard` because the
work behind this Sprite is real compute: MJX/PPO training and a native MuJoCo
sim2sim rollout. `e2b-standard` is the equivalent alternative; both give a
persistent Linux box with the CPU, memory, and wall-clock headroom a physics
rollout needs. Training itself belongs on a heavy runtime template with a GPU —
see `agent/skills/zap-unitree-g1/SKILL.md`.

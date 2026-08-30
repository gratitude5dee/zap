# zap-heavy-fo-guang

Overlay of `zap-heavy` carrying the fo-guang robotics profile: the Unitree G1
sim2sim stack (MuJoCo Playground + an ONNX policy), the God's Eye View telemetry
bridge, and ABot-Recon reconstruction from the G1 head camera.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`fo-guang`](../harnesses/fo-guang.md) |
| ports | none (the telemetry bridge speaks over a UNIX socket) |
| units | `zap-agentd.service` |
| state | `~/mujoco_playground`, `~/gods-eye-view`, `~/ABot-Recon`, `/zap/fs/robot` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-fo-guang", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-fo-guang      # plan-only
zap harness doctor zap-heavy-fo-guang
```

No named snapshot: at runtime the box is forked from `zap-heavy` and `bake.sh`
runs as the setup script (or post-ready `/commands`). `bake.sh` clones
`mujoco_playground`, `gods-eye-view`, and `ABot-Recon` at the refs pinned in
`template.json`, installs `onnxruntime` and the mandatory `hidapi`, and records
every ref in `~/.zap/template.json` (C30). `doctor.sh` verifies the overlay
in-box; no secret is baked — `GEV_ROBOT_INGEST_TOKEN` and model keys are BYOK
only, and `infra/box/secret-sweep.sh` keeps keys out of every baked surface.

## GPU and CPU-only modes

A GPU box gets `jax[cuda12]` layered over Playground's CPU-only JAX pin, which
MJX/PPO training requires. `bake.sh` detects the mode from the box
(`nvidia-smi`); set `FO_GUANG_CPU_ONLY=1` (or `=0`) to override. CPU-only mode
skips the CUDA step and records `cpuOptimized: true` in `~/.zap/template.json`;
`doctor.sh` reports the mode. CPU-only still supports sim2sim playback of an
exported policy and ABot-Recon CPU inference — around 0.31 FPS at 504×280 on
8 cores with `--device cpu`, where `--quantize` (dynamic INT8, CPU-only)
saves weight memory rather than time (see the ABot-Recon README's CPU
throughput table).

Telemetry is inbound-only: robot `/command` and `/map` stay disabled. The
rollout runbook ships as the template's `fo-guang` skill.

# harness: fo-guang

Robotics profile overlay: the Unitree G1 sim2sim stack (MuJoCo Playground + an
ONNX policy), the God's Eye View telemetry bridge, and ABot-Recon reconstruction
from the G1 head camera. No model surface — the rollout runs in-box as CLI
steps, so there is no managed gateway.

| field | value |
| --- | --- |
| run adapter | `cli-exec` |
| min weight | `heavy` |
| template | zap-heavy-fo-guang (overlay of zap-heavy) |
| ports | none (the telemetry bridge speaks over a UNIX socket) |
| pins | `mujoco_playground`, `gods-eye-view`, `ABot-Recon` git refs; `onnxruntime==1.29.0`, `hidapi==0.14.0.post4`, `torch==2.5.1` |
| units | `zap-agentd.service` |
| state dirs | `~/mujoco_playground`, `~/gods-eye-view`, `~/ABot-Recon`, `/zap/fs/robot` |
| MCP config | `~/.zap/fo-guang/mcp.json` (json) |
| LLM auth | `GEV_ROBOT_INGEST_TOKEN` (byok) |
| managed gateway | none |
| disabled inbound | `robot-command`, `robot-map` |

Telemetry is inbound-only: the bridge streams RobotFrames out to God's Eye View
and never enables robot `/command` or `/map`. No secret is baked into the
template or snapshot; `GEV_ROBOT_INGEST_TOKEN` arrives at runtime via the
BYOK/env allowlist only. See [the template page](../templates/zap-heavy-fo-guang.md)
for bake/doctor and the GPU vs CPU-only modes.

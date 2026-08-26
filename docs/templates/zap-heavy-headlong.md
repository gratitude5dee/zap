# zap-heavy-headlong

Overlay with Docker-in-VM for its workloads.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`headlong`](../harnesses/headlong.md) |
| units | `zap-agentd.service`, `headlong.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-headlong", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-headlong          # plan-only
zap harness doctor zap-heavy-headlong
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

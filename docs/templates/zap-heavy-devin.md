# zap-heavy-devin

Overlay; pull-only — the box connects out to its control plane and hosts nothing inbound.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`devin`](../harnesses/devin.md) |
| units | `zap-agentd.service`, `devin-worker.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-devin", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-devin          # plan-only
zap harness doctor zap-heavy-devin
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

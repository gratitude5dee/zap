# zap-heavy-agno

Overlay of `zap-heavy` (no named snapshot) with the agno harness.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`agno`](../harnesses/agno.md) |
| ports | 7777 (api, private) |
| units | `zap-agentd.service`, `agno-os.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-agno", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-agno          # plan-only
zap harness doctor zap-heavy-agno
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

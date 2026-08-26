# zap-heavy-omg

Overlay of `zap-heavy` (no named snapshot) with the omg harness.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`omg`](../harnesses/omg.md) |
| ports | 8766 (api, private) |
| units | `zap-agentd.service`, `omg.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-omg", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-omg          # plan-only
zap harness doctor zap-heavy-omg
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

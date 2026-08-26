# zap-heavy-kimi

Overlay of `zap-heavy` (no named snapshot) with the kimi harness.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`kimi`](../harnesses/kimi.md) |
| ports | 58627 (api, private) |
| units | `zap-agentd.service`, `kimi-web.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-kimi", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-kimi          # plan-only
zap harness doctor zap-heavy-kimi
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

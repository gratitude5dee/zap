# zap-heavy-prime

Overlay of `zap-heavy` (no named snapshot) with the prime harness.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy` |
| harness | [`prime`](../harnesses/prime.md) |
| units | `zap-agentd.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-prime", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-prime          # plan-only
zap harness doctor zap-heavy-prime
```

No named snapshot: at runtime the box is forked from `zap-heavy` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

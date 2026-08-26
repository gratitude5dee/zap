# zap-heavy-openclaw

Named snapshot. OpenClaw gateway on 18789 (private) driven via its OpenAI-compatible endpoint; config rendered at boot from strict JSON.

| field | value |
| --- | --- |
| kind | named snapshot |
| harness | [`openclaw`](../harnesses/openclaw.md) |
| ports | 18789 (api, private) |
| units | `zap-agentd.service`, `openclaw-gateway.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-openclaw", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-openclaw --live   # infra/box/build-template.sh + verify
zap harness doctor zap-heavy-openclaw
```

The builder runs `bake.sh`, `doctor.sh`, a warm stop→resume→doctor cycle,
and `infra/box/secret-sweep.sh` before snapshotting; the snapshot never
contains keys.

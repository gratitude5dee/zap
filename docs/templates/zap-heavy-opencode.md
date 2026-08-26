# zap-heavy-opencode

Named snapshot. `opencode serve` on 4096 (private) driven via HTTP runs; also the base of the grok overlay and env-omarchy.

| field | value |
| --- | --- |
| kind | named snapshot |
| harness | [`opencode`](../harnesses/opencode.md) |
| ports | 4096 (api, private) |
| units | `zap-agentd.service`, `opencode-serve.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-opencode", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-opencode --live   # infra/box/build-template.sh + verify
zap harness doctor zap-heavy-opencode
```

The builder runs `bake.sh`, `doctor.sh`, a warm stop→resume→doctor cycle,
and `infra/box/secret-sweep.sh` before snapshotting; the snapshot never
contains keys.

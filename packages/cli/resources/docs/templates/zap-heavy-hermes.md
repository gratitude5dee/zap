# zap-heavy-hermes

Named snapshot. Hermes under the airv2 invariants: one user/one box, `noEnv`, filesystem memory, only `api_server` inbound (bound `0.0.0.0`, per-box `API_SERVER_KEY` rendered at boot — never baked), ports 8642/9119 hosted `--private`, and `hermes-host.service` re-hosting after every stop/resume.

| field | value |
| --- | --- |
| kind | named snapshot |
| harness | [`hermes`](../harnesses/hermes.md) |
| ports | 8642 (api, private), 9119 (dashboard, private) |
| units | `zap-agentd.service`, `hermes-gateway.service`, `hermes-dashboard.service`, `hermes-host.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-hermes", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-hermes --live   # infra/box/build-template.sh + verify
zap harness doctor zap-heavy-hermes
```

The builder runs `bake.sh`, `doctor.sh`, a warm stop→resume→doctor cycle,
and `infra/box/secret-sweep.sh` before snapshotting; the snapshot never
contains keys.

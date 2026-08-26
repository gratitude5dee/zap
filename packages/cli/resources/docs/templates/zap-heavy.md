# zap-heavy

Named snapshot. Heavy base for every harness template: Node 24, Docker CE, OpenViking + context7 + open-connector MCP servers, the API store, and the skills layout. Doctor checks include `mcp-openviking`, `mcp-context7`, `mcp-open-connector`, and `open-connector-loopback`.

| field | value |
| --- | --- |
| kind | named snapshot |
| units | `zap-agentd.service`, `zap-openviking.service`, `zap-open-connector.service`, `zap-host.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy --live   # infra/box/build-template.sh + verify
zap harness doctor zap-heavy
```

The builder runs `bake.sh`, `doctor.sh`, a warm stop→resume→doctor cycle,
and `infra/box/secret-sweep.sh` before snapshotting; the snapshot never
contains keys.

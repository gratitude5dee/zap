# zap-heavy-grok

Overlay of `zap-heavy-opencode` routed to xAI; `doctor.sh` reports xAI-routed status.

| field | value |
| --- | --- |
| kind | overlay of `zap-heavy-opencode` |
| harness | [`grok`](../harnesses/grok.md) |
| ports | 4096 (api, private) |
| units | `zap-agentd.service`, `opencode-serve.service` |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-grok", size: "large" })],
})
```

## Build and verify

```
zap harness bake zap-heavy-grok          # plan-only
zap harness doctor zap-heavy-grok
```

No named snapshot: at runtime the box is forked from `zap-heavy-opencode` and
`bake.sh` runs as the setup script (or post-ready `/commands`).
`doctor.sh` verifies the overlay in-box; `infra/box/secret-sweep.sh` keeps
keys out of every baked surface.

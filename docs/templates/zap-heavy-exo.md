# zap-heavy-exo

Named snapshot. exo under the airv2 invariants: one user/one box, `noEnv`, only `exo agentd` inbound (bound `0.0.0.0:8642`, per-box `API_SERVER_KEY` rendered at boot — never baked), port 8642 hosted `--private`, and `exo-host.service` re-hosting after every stop/resume. Same `/v1/runs` + SSE contract as `zap-heavy-hermes`.

"zap-heavy" character: the Zap skills store (`/zap/skills`), the recipe tool module (`/zap/exo/zap-tools.mjs`, `recipe:<slug>` tools), OpenViking memory, the API store and the media FS are all mounted for the exo agent.

| field | value |
| --- | --- |
| kind | named snapshot |
| harness | [`exo`](../harnesses/exo.md) |
| ports | 8642 (api, private) |
| units | `zap-agentd.service`, `exo-agentd.service`, `exo-host.service` |
| pins | `EXO_REF`, `EXO_SHA` (resolved at bake) |

## Compose

```ts
createRuntime({
  weight: "heavy",
  plugins: [box({ template: "zap-heavy-exo", size: "large" })],
})
```

## Build and verify

```
EXO_REF=main zap harness bake zap-heavy-exo --live   # infra/box/build-template.sh + verify
zap harness doctor zap-heavy-exo
```

`bake.sh` installs a Rust toolchain, clones exo at `EXO_REF`, builds the `exo` CLI in release mode, installs the harness's pnpm deps under `/opt/exo`, and records `EXO_REF`/`EXO_SHA` in `~/.zap/template.json`. The builder then runs `doctor.sh`, a warm stop→resume→doctor cycle, and `infra/box/secret-sweep.sh` before snapshotting; the snapshot never contains keys.

## Boot

`exo-agentd.service` runs `exo-render-env` first: it writes `~/.exo/.env` (`API_SERVER_HOST_PORT`, sticky `API_SERVER_KEY`, `EXO_AGENT`), registers the `gateway` model (managed proxy or BYOK secret) and creates the `zap` agent with the Zap recipe tool module if it does not exist yet. Then `exo agentd --agent zap` serves every Air session as an exo conversation.

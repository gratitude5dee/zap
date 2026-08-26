# zap-med

Med-weight Zap runtime template: `zap-light` plus the AI/gen-media gateway,
the content-addressed media filesystem (`docs/mediafs.md`), and ffmpeg
presets. Built as a named Box snapshot with `noEnv: true` — the snapshot
contains no secrets; provider keys arrive at runtime through the gateway env
allowlist in `packages/templates/zap-med/template.json`.

## Compose

```ts
createRuntime({
  weight: "med",
  plugins: [box({ template: "zap-med", size: "default" })],
})
```

## What's on the VM

- `zap-agentd.service` serving `POST /v1/runs` + SSE and `GET /v1/health`.
- `/zap/media/<kind>/<sha[0:2]>/<sha>.<ext>` content-addressed media store.
- `/zap/fs` project files; `/zap/skills` optional skill store.
- `/zap/ffmpeg-presets.json` — the data-defined preset ids executed only
  through the `ffmpeg` lane.
- `harness.zap` mounted in-process (executor); callers drive it with the
  `http-runs` driver.

Verification: `packages/templates/zap-med/doctor.sh`.

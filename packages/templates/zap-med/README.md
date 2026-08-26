# zap-med

Med-weight Zap runtime template: `zap-light` + gateway + media FS + ffmpeg
presets. Built as a named Box snapshot (base 2/10) with `noEnv: true`; the
`zap-med-genmedia` alias and the `zap-med-interpreter` / `zap-med-fx` overlays
layer on top of it at create-from-snapshot time.

- `template.json` — manifest: base, units, dirs, gateway env allowlist.
- `bake.sh` — sources `bake.d/*.sh` in order at snapshot-build time.
- `doctor.sh` — boot verification (agentd, ffmpeg, media FS, presets).
- `units/zap-agentd.service` — the agent daemon serving `/v1/runs`.

See `docs/templates/zap-med.md` for the compose snippet.

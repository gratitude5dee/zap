# zap-heavy

Named snapshot built from `zap-med` that adds on-VM memory (OpenViking,
loopback :1933), the API store (open-connector, loopback :1934), and the
skills store (`/zap/skills`). Every `zap-heavy-<harness>` template bakes on
top of it.

- `bake.sh` sources `bake.d/*.sh` in order (40 = memory, 50 = API store,
  60 = skills store + units) and records pins in `~/.zap/template.json`.
- `doctor.sh` runs the zap-med checks plus `mcp-openviking`, `mcp-context7`,
  `mcp-open-connector`, and `open-connector-loopback`.

See `docs/templates/zap-heavy.md`.

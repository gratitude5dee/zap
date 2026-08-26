# zap-heavy runtime

This VM is a `zap-med` runtime with on-VM memory, the API store, and the
skills store. It is the base for every `zap-heavy-<harness>` template.

- Memory is content: OpenViking data lives under `~/.zap/memory/openviking`
  and its server binds `127.0.0.1:1933` only.
- The API store's open-connector binds `127.0.0.1:1934` only; brief APIs are
  reached through it, never directly.
- Skills live under `/zap/skills`; harness overlays register their own skills
  directories on top.
- MCP config fragments are appended by the registration helper under
  `~/.zap/mcp/` — do not hand-edit.
- All zap-med rules apply: media FS at `/zap/media`, project FS at `/zap/fs`,
  plan-only default, `noEnv:true` boxes, no secrets in the snapshot.

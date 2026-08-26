# zap-med-interpreter runtime

This VM is a `zap-med` runtime with the Open Interpreter harness.

- The harness listens on `ws://127.0.0.1:9000` (`zap-interpreter.service`,
  host-private) and is driven through zap-agentd, not directly.
- MCP servers are registered in `~/.openinterpreter/config.toml`
  (`[mcp_servers]`); the boot helper appends entries — do not hand-edit.
- All zap-med rules apply: media FS at `/zap/media`, ffmpeg via lane presets,
  plan-only default, no secrets in the snapshot.

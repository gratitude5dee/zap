# zap-med-fx runtime

This VM is a `zap-med` runtime with the fx harness.

- The harness is invoked per turn as `fx ask --json` (cli-exec); there is no
  long-running harness daemon.
- MCP servers are registered in `~/.fx/mcp.json`; the boot helper appends
  entries — do not hand-edit.
- All zap-med rules apply: media FS at `/zap/media`, ffmpeg via lane presets,
  plan-only default, no secrets in the snapshot.

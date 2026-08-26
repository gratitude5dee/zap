---
name: zap-lanes
description: Route Zap sandbox work through named lanes - ffmpeg, codegen, browser, wasm - with correct weights.
version: 5.0.0-alpha
metadata:
  zap:
    weight: light
    lanes: [ffmpeg, codegen, browser, wasm]
---

# zap-lanes

Use this skill when choosing where a command runs inside a runtime.

## Rules

- Lanes are named execution paths in the sandbox: `ffmpeg` (media), `codegen` (builds/tests), `browser` (clicking/scraping), `wasm` (untrusted snippets).
- Select a lane with `zap runtime exec <id> --lane <lane> -- <command...>` or the `zap_sandbox_exec` MCP tool.
- `zap ffmpeg <preset> <input>` is dry-run by default; `--live` executes and is payer-gated.
- Keep untrusted or generated code in the `wasm` lane; never run it in the host lane.
- Browser-lane responses must never include secret values or raw credential material.
- Lane availability depends on runtime weight; heavier lanes need `med` or `heavy` templates.

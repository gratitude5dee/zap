# zap-med-interpreter

Overlay of `zap-med` (no named snapshot) with the Open Interpreter harness:
the native binary install plus `interpreter app-server --listen
ws://127.0.0.1:9000` as `zap-interpreter.service` (host-private port). The
harness manifest is `packages/runtime/src/harness/interpreter.ts`
(`run: "ws-jsonrpc"`, `minWeight: "med"`).

## Compose

```ts
createRuntime({
  weight: "med",
  plugins: [box({ template: "zap-med-interpreter", size: "default" })],
})
```

## Notes

- MCP servers register in `~/.openinterpreter/config.toml` (`[mcp_servers]`);
  OpenViking is appended when memory is enabled.
- LLM auth is BYOK (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) at runtime; the
  snapshot contains no keys.

Verification: `packages/templates/zap-med-interpreter/doctor.sh`
(`interpreter --version`, MCP config checks).

# zap-med-fx

Overlay of `zap-med` (no named snapshot) with the fx harness: the fx CLI is
installed and driven per turn as `fx ask --json` (cli-exec). The harness
manifest is `packages/runtime/src/harness/fx.ts` (`run: "cli-exec"`,
`minWeight: "med"`).

## Compose

```ts
createRuntime({
  weight: "med",
  plugins: [box({ template: "zap-med-fx", size: "default" })],
})
```

## Notes

- MCP servers register in `~/.fx/mcp.json`; OpenViking is appended when
  memory is enabled.
- LLM auth is BYOK (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`) at runtime; the
  snapshot contains no keys.

Verification: `packages/templates/zap-med-fx/doctor.sh` (`fx doctor`, MCP
config checks).

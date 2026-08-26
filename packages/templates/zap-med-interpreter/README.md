# zap-med-interpreter

Overlay of `zap-med` (no named snapshot) that installs the Open Interpreter
native binary and runs `interpreter app-server --listen ws://127.0.0.1:9000`
as `zap-interpreter.service`. The harness manifest lives at
`packages/runtime/src/harness/interpreter.ts` (`run: "ws-jsonrpc"`).

See `docs/templates/zap-med-interpreter.md`.

# Agent API reference

Package: `@wzrdtech/zap-agent`. Everything here runs at render time on CPU,
synchronously, with no I/O. The runtime executes model steps and tools after
render, inside the tenant VM.

## Constructors

### `defineAgent(render)`

Wraps a synchronous render function `() => string` as an agent. The function
runs on every turn before every model step; the returned string is the
instruction set for that step. Async render functions throw
`AGENT_RENDER_ASYNC`; non-string returns throw `AGENT_RENDER_TYPE`; a render
that selects no model throws `AGENT_NO_MODEL`.

### `defineTool(definition)`

Declares a tool: `name`, `description`, an `input` JSON schema, an optional
`readOnly` flag (read-only tools may run in plan-only mode), an optional
`estimate(input)` cost hook, and `run(ctx)`. The `ToolContext` gives the tool
`input`, `signal`, `sandbox.exec`, a scoped `fs`, declared `connections`,
durable `session.data`, `reportProgress`, `live`, and `log`.

### `defineConnection(definition)`

Declares an outbound HTTP connection: `id`, an HTTPS `origin`, an allowed
`methods` list, a `pathPrefix`, and `headers`. Sensitive headers must use
`useSecret()` / `bearer(useSecret())`. At request time the path must be
relative and inside the prefix (`CONNECTION_ABSOLUTE_URL`,
`CONNECTION_METHOD_DENIED`, `CONNECTION_PATH_DENIED`).

### `defineMcpServer(definition)` †

Declares an MCP server (`id`, transport, endpoint) an agent may reference with
`useMcpServer`.

### `defineProject(definition)` †

The project root (`project.ts`): maps agent ids to lazy module imports.

### `defineRecipeTool(slug)` †

Wraps a 0.3.1 Zap recipe as a tool that shells out to the CLI inside the
sandbox (plan-only unless the turn is live).

## Hooks (render-time only)

All hooks throw `HOOK_OUTSIDE_RENDER` when called outside a render.

| Hook | Effect |
| --- | --- |
| `useInput(): AgentInput` | the current turn's input (`source`, `text`, `payload`, `live`, `sessionId`, `turn`, `alias`) |
| `useModel(id, options?)` | select the model for the next step; never calls it |
| `useTool(tool)` | declare a tool for the next step |
| `useMcpServer(ref)` | declare an MCP server |
| `useSubagent(id)` | declare a child agent the model may delegate to |
| `useSessionData(): Record<string, unknown>` | synchronous snapshot of durable session data taken before render |
| `useSecret(name): SecretRef` | opaque, write-only secret reference |
| `bearer(ref): HeaderValue` | bearer-auth header value from a secret ref |

Capabilities rebuild from empty on every render — conditional hooks add a
capability only when their branch runs.

## Render guards

During render, `fetch`, `setTimeout`, `setInterval`, `queueMicrotask`, and
`process.env` reads throw `AGENT_RENDER_IO`. Returning a thenable throws
`AGENT_RENDER_ASYNC`.

## Types

`AgentInput`, `ModelId`, `SecretRef`, `HeaderValue`, `JsonSchema`,
`ToolInput`, `MediaFsLike`, `TurnMessage`, `ToolContext`, `ToolDefinition`,
`Tool`, `AnyTool`, `ConnectionDefinition`, `Connection`,
`McpServerDefinition`, `McpServerRef`, `Project`.

## Build and lint

`buildProject({ rootDir, outDir })` bundles `project.ts` and every agent into
`bundle.mjs` + a value-free `manifest.json`, content-addressed by sha.
`lintProject` reports: `ZAP_BUILD_SECRET_LITERAL`, `ZAP_BUILD_ORIGIN_NOT_HTTPS`,
`ZAP_BUILD_PROCESS_ENV`, `ZAP_BUILD_ASYNC_AGENT`,
`ZAP_BUILD_UNDECLARED_SUBAGENT`, `ZAP_BUILD_UNDECLARED_MCP`.

## Session events

`zap session --json` emits one JSON event per line: `turn.started`, `render`,
`text.delta`, `tool.planned`, `tool.call`, `tool.result`, `turn.completed`,
`turn.failed` (with `code` such as `PAYER_MISSING`, `SESSION_BUSY`,
`ALIAS_NOT_FOUND`).

† additive helpers beyond the core surface.

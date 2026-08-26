# @wzrdtech/zap-memory

Memory contract and providers for Zap agent runtimes. OpenViking is the default heavy provider and runs inside the tenant VM, keeping memory data on the same filesystem as the agent.

```bash
npm install @wzrdtech/zap-memory
```

```ts
import { createOpenVikingMemory, createFakeMemory } from "@wzrdtech/zap-memory";
```

Providers:

- `createOpenVikingMemory` — in-VM OpenViking over HTTP or in-memory transports, with `ovctl` helpers and `ov.conf` rendering
- `createMem0Memory` — hosted Mem0
- `createControlPlaneMemory` — off-VM control-plane memory
- `createFakeMemory` — deterministic test double

Also exports the shared memory contract, `MemoryError` codes, and MCP registration fragments (`mcpRegistrationFragment`) so harnesses can attach memory as an MCP server.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

# Memory

Zap agents remember. The memory subsystem gives every runtime a durable,
tenant-scoped store with session-scoped scratch space, exposed through one
contract (`@wzrdtech/zap-memory`) that every provider implements.

## Locality: memory is content

Memory content lives **inside the tenant VM** by default. The control plane
never stores or logs memory text; it sees counts and byte totals only.

- `remember`, `search`, `read`, `addResource` are available in-VM and to the
  self-host CLI only. A `MemoryService` instantiated on the managed control
  plane throws `MEMORY_CONTENT_OFF_VM` for these content methods.
- `status`, `forget`, `wipeSession` work everywhere (metadata / deletion).
- `export` from the control plane requires explicit consent recorded on the
  runtime row (`zap memory export --consent`); in-VM export always works —
  your data is always extractable (see [Export](#export-and-portability)).

SaaS providers (Mem0, Zep) move content off the VM by definition, so they
refuse to mount without `consent: true`.

## Providers

| Provider | Locality | Default | Consent |
| --- | --- | --- | --- |
| [OpenViking](providers/openviking.md) | on-vm | heavy profile | not needed |
| [Mem0](providers/mem0.md) | saas | opt-in | `consent: true` required |
| [Zep](providers/zep.md) | saas | opt-in | `consent: true` required |

All three pass the same contract test suite
(`packages/memory/tests/contract.test.ts`, `dispose.test.ts`).

## Scopes, durability, and wipe

```ts
const scope = { tenantId: "acme", runtimeId: "rt-1", sessionId: "sess-42" };

await memory.remember(scope, { text: "prefers metric units", durable: true });
await memory.remember(scope, { text: "scratch note" }); // session-scoped

await memory.wipeSession(scope);
// durable tenant memory survives; the scratch note is gone
```

- **Durable** items are tenant-scoped and survive `wipeSession`.
- Items remembered with a `sessionId` and without `durable: true` are
  session-scoped and removed by `wipeSession` for that session only; other
  sessions are untouched.

## Composing a provider

```ts
import { compose } from "@wzrdtech/zap-runtime";
import { openviking } from "@wzrdtech/zap-runtime/memory";

// heavy profile default — loopback OpenViking, nothing to configure
await compose([openviking()]);

// SaaS opt-in: consent is explicit, keys come from the runtime secret
// store, never from template files or process.env in agent code
await compose([mem0({ consent: true, apiKey })]);
```

Plugins provide the service under the `"memory"` key and withdraw it on
context disposal.

## CLI

```
zap memory status [--json]
zap memory search <query> [--limit n] [--json]
zap memory export [--json]
zap memory forget <uri> [--json]
```

`--json` output never contains secrets or secret-bearing URLs. Plan-only
remains the default everywhere: memory operations are local reads/writes and
never trigger live provider spend.

## Export and portability

`export(scope)` streams every item (durable, session, resources) as
`MemoryItem` records — the I6 extraction path. After `wipeSession`, export
returns durable tenant memory only.

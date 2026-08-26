# Mem0 (memory)

Mem0 is an opt-in **SaaS** memory provider (`locality: "saas"`). Enabling it
moves memory content off the tenant VM to Mem0's hosted service, so it
refuses to mount without explicit consent.

## Composing

```ts
await compose([
  mem0({
    consent: true, // required; MEMORY_CONSENT_REQUIRED otherwise
    apiKey,        // from the runtime secret store — never a template or env read
  }),
]);
```

## Mapping

| Zap concept | Mem0 concept |
| --- | --- |
| `tenantId` | `user_id` |
| `sessionId` (non-durable items) | `run_id` |
| durable item | memory without `run_id` |
| resource | memory with `zap_kind: "resource"` metadata |
| item URI | `mem0://<tenantId>/<memory id>` |

`wipeSession` deletes the tenant's memories for that `run_id` only; durable
tenant memory survives. Mem0 passes the same contract suite as OpenViking
(`packages/memory/tests/contract.test.ts`).

## Notes

- Plan-only stays the default: contract tests run against an in-process
  mock; live API calls happen only when you compose the provider with a key.
- `--json` CLI output and logs never include the API key or key-bearing URLs.

# Zep (memory)

Zep is an opt-in **SaaS** memory provider (`locality: "saas"`). Enabling it
moves memory content off the tenant VM to Zep's hosted service, so it
refuses to mount without explicit consent.

## Composing

```ts
await compose([
  zep({
    consent: true, // required; MEMORY_CONSENT_REQUIRED otherwise
    apiKey,        // from the runtime secret store — never a template or env read
  }),
]);
```

## Mapping

| Zap concept | Zep concept |
| --- | --- |
| `tenantId` | user graph (`user_id`) |
| durable item | graph episode — `zep://graph/<uuid>` |
| session item | thread message — `zep://thread/<thread>/<uuid>` |
| `sessionId` | thread `zap-<tenantId>-<sessionId>` |
| resource | graph episode tagged `zap_kind: "resource"` |

`wipeSession` deletes the session's thread (and its messages) only; durable
graph episodes survive. Zep passes the same contract suite as OpenViking
(`packages/memory/tests/contract.test.ts`).

## Notes

- Plan-only stays the default: contract tests run against an in-process
  mock; live API calls happen only when you compose the provider with a key.
- `--json` CLI output and logs never include the API key or key-bearing URLs.

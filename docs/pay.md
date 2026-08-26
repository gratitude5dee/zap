# Pay

Zap never spends money by default. Every runtime resolves a **payer** before it
executes a prompt, because model tokens cost money even in plan-only mode.
`zap doctor` and `zap pay status` report the payer as one of three modes:

| Mode | Meaning |
| --- | --- |
| `missing` | No payer configured. Prompt runs fail closed with `PAYER_MISSING`. |
| `byok` | You bring your own provider keys; usage is recorded to a local ledger at `.zap/ledger.jsonl`. |
| `managed` | Zap Cloud pays upstream providers and bills you per request through the payment gate. |

## Fail-closed rules

- No payer + `--live` → the run is rejected with `PAYER_MISSING` before any tool executes.
- No payer + a prompt (even plan-only) → rejected before the harness driver is invoked.
- A payer + a plan-only prompt → the run executes with `live: false`; side-effecting tools stay disabled.
- Usage reported on `run.completed` settles against the meter, so ledgers reconcile with receipts.

## Managed payments (x402 v2 and MPP)

Managed mode settles through the Zap Cloud payment gate. Two protocols are accepted:

- **x402 v2** — the client sends `PAYMENT-SIGNATURE`; the gate verifies and settles via a
  facilitator and returns `PAYMENT-RESPONSE`. The legacy v1 `X-PAYMENT` header is rejected
  unless the deployment sets `ZAP_X402_V1_SHIM=1`.
- **MPP** — the client sends `Authorization: Payment ...`; the gate returns `Payment-Receipt`.

An unpaid request receives `402` with both a `PAYMENT-REQUIRED` challenge and
`WWW-Authenticate: Payment`, so either protocol can respond.

Replay protection: every settlement consumes its x402 nonce or MPP challenge ID exactly once
(`SET NX zap:gate:nonce:<id>`); a replayed credential gets `402` and no second receipt.
The `payTo` address is always Zap's treasury or a verified tenant wallet — never taken from
the request. Zap holds no user funds and no custodial keys.

## Client-side caps

The runtime payment client refuses to sign any payment above the session cap:

```ts
import { wrapFetchWithPayment } from "@wzrdtech/zap-runtime";

const paidFetch = wrapFetchWithPayment(fetch, signer, { maxValueUsd: 5 });
```

Managed session keys are issued with a spend cap (default $5) and a 24-hour expiry, and are
stored at `.zap/auth.json` with mode `0600`. Files readable by group or world are rejected.

## CLI

```bash
zap pay status            # payer: byok | managed | missing
zap pay login --managed   # wallet auth + scoped session key
zap pay logout            # clears the managed session key only
zap pay quote             # price a run via /v1/pay/quote
```

Secrets never appear in output, including `--json`. Live payment tests are opt-in
(`ZAP_LIVE_PAY_TESTS=1`); the default suites use fakes.

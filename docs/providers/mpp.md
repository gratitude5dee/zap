# MPP (machine payment protocol)

Alongside x402 v2, the Zap Cloud payment gate accepts MPP credentials.

## Protocol

- Request: `Authorization: Payment <credential>`.
- Success response: `Payment-Receipt` header plus the normal body.
- Unpaid request: `402` with `WWW-Authenticate: Payment` (and the x402
  `PAYMENT-REQUIRED` challenge, so either protocol can answer).

## Replay protection

Each MPP challenge ID is consumed exactly once via the shared nonce authority
(`SET NX zap:gate:nonce:<id>`). Replaying a credential returns `402` and never
produces a second receipt or meter row.

## Semantics shared with x402

Verification happens before settlement, settlement before receipt, and receipt
before meter reservation. The `payTo` destination is Zap's treasury or a
verified tenant wallet — never request-controlled — and Zap never takes custody
of user funds.

# CDP (x402 facilitator)

Zap Cloud can use the Coinbase Developer Platform facilitator as an alternative
x402 verifier/settler.

## Configuration

| Variable | Purpose |
| --- | --- |
| `CDP_AUTH_TOKEN` | Bearer token for the facilitator API (never logged). |
| `CDP_FACILITATOR_URL` | Facilitator base URL (optional; defaults to the public endpoint). |
| `ZAP_TREASURY_ADDRESS` | The `payTo` destination for settled payments. |

The cloud route prefers Thirdweb when `THIRDWEB_SECRET_KEY` is set and falls
back to CDP when `CDP_AUTH_TOKEN` is set. Both facilitators implement the same
`verify`/`settle` contract, so the payment gate behaves identically: verify
first, settle before receipt, `402` with no meter row on any failure.

## Custody

Settlement goes straight to the configured treasury or a verified tenant
wallet. Zap holds no user funds.

# Thirdweb (x402 facilitator)

Zap Cloud can use Thirdweb as the x402 facilitator for verifying and settling
managed payments on Base (`eip155:8453`) or Base Sepolia (`eip155:84532`).

## Configuration

| Variable | Purpose |
| --- | --- |
| `THIRDWEB_SECRET_KEY` | Server-side facilitator auth (sent as `x-secret-key`; never logged). |
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` | Browser wallet connection in Studio. |
| `ZAP_TREASURY_ADDRESS` | The `payTo` destination for settled payments. |

When `THIRDWEB_SECRET_KEY` is present, the cloud route selects the Thirdweb
facilitator automatically. The gate calls the facilitator's `verify` endpoint
before accepting a payment and its `settle` endpoint before writing a receipt;
a facilitator failure returns `402` and records no meter row.

## Custody

The facilitator settles funds directly to the configured treasury or a verified
tenant wallet. Zap never takes custody of user funds and never stores primary
wallet keys — only capped, expiring session keys on the client side.

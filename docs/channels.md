# Chat Channels

Zap v0.3.0 exposes one Eve-backed agent through Slack, Telegram, and an iMessage bridge.

| Channel | Webhook | Required environment |
| --- | --- | --- |
| Slack | `/eve/v1/slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `REDIS_URL` |
| Telegram | `/eve/v1/telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_TENANT_ID`, `REDIS_URL` |
| iMessage beta | `/eve/v1/imessage` | `IMESSAGE_BRIDGE_URL`, `IMESSAGE_BRIDGE_TOKEN` |

Slack and Telegram use the Vercel Chat SDK and Redis state. iMessage uses an HMAC-signed bridge payload with timestamp and replay checks. Production never falls back to a known placeholder credential or process-local link store.

Unlinked principals can quote and plan but cannot trigger provider spend. A signed-in creator generates a one-use code in Settings, then sends `/link CODE` in the channel. The code is hashed, tenant/channel scoped, expires, and is atomically consumed; the resulting record stores the verified wallet principal plus its Supabase user id. Linked live runs default to WZRD Cloud and still require the normal budget confirmation.

For local contract checks:

```bash
npm test -- tests/channel-security.test.ts tests/channel-contracts.test.ts tests/channel-run-context.test.ts
```

# Chat Channels

Zap v0.3.1 exposes one Eve-backed agent through Slack, Telegram, and an iMessage bridge.

| Channel | Webhook | Channel-specific environment |
| --- | --- | --- |
| Slack | `/eve/v1/slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `REDIS_URL` |
| Telegram | `/eve/v1/telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET_TOKEN`, `TELEGRAM_TENANT_ID`, `REDIS_URL` |
| iMessage beta | `/eve/v1/imessage` | `IMESSAGE_BRIDGE_URL`, `IMESSAGE_BRIDGE_TOKEN` |

Every selected channel also requires `CHANNEL_LINK_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Slack and Telegram use the Vercel Chat SDK and Redis state; Upstash REST stores wallet links, replay claims, and iMessage approval state. iMessage uses an HMAC-signed bridge payload with timestamp and replay checks. Production never falls back to a known placeholder credential or process-local link store. Sprite deployment validates this full set before it mutates a Vercel project.

Unlinked principals can quote and plan but cannot trigger provider spend. A signed-in creator generates a one-use code in Settings, then sends `/link CODE` in the channel. The code is hashed, tenant/channel scoped, expires, and is atomically consumed; the resulting record stores the verified wallet principal plus its Supabase user id. Linked live runs default to WZRD Cloud and still require the normal budget confirmation.

## Provider setup

For Slack, set the Event Subscriptions, Interactivity, and `/link` slash-command request URLs to `https://zap.wzrd.tech/eve/v1/slack`. Install the bot with the Chat SDK scopes used by Zap (`app_mentions:read`, channel/group/DM history and read scopes, `chat:write`, reactions, and `users:read`). Copy the workspace bot token and signing secret into Vercel. Wallet linking and live approvals are deliberately accepted only in direct messages; a code pasted into a public channel is rejected.

For Telegram, create the bot with BotFather and register the webhook plus the same random secret stored in `TELEGRAM_WEBHOOK_SECRET_TOKEN`:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "content-type: application/json" \
  -d '{"url":"https://zap.wzrd.tech/eve/v1/telegram","secret_token":"replace-with-the-webhook-secret"}'
```

Set `TELEGRAM_TENANT_ID` to a stable identifier for that bot installation. Telegram `/link CODE` and any spend approval must also occur in a DM.

The iMessage beta bridge sends JSON with `conversationId`, `eventId`, `tenantId`, `text`, `userId`, and optional `mediaUrls`. It must attach `x-imessage-event-id`, Unix-seconds `x-imessage-timestamp`, and `x-imessage-signature`. The signature is `sha256=` followed by HMAC-SHA256 over `timestamp.eventId.rawBody` using `IMESSAGE_BRIDGE_TOKEN`. Zap rejects stale, replayed, mismatched, or invalidly signed events. Outbound delivery is a bearer-authenticated JSON POST to `IMESSAGE_BRIDGE_URL`. When Eve requests approval or another input, Zap persists the pending prompt in Upstash and consumes the next valid signed reply to resume the same conversation.

## Verification

For local contract checks:

```bash
npm run test:channels
```

These checks prove signature/replay protection, direct-message linking, initiating-principal pinning, durable HITL behavior, and the paid-tool guard. A real Slack, Telegram, or iMessage acceptance run remains opt-in because it sends messages and may incur provider spend; exercise quote → approve → asset URL with dedicated test identities after their external credentials are installed.

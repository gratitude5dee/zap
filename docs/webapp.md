# Web App

The Zap web app is the creator and developer surface deployed at `zap.wzrd.tech`.

Primary routes:

- `/`: public landing page and first product signal.
- `/gallery`: installed Zap gallery.
- `/docs`: docs entry point.
- `/quickstart`: agent quickstarts for Codex, Claude Code, Cursor, OpenClaw, Hermes, and similar tools.
- `/studio`: wallet-gated authoring, private catalog, hosted templates, and Sprite deployment.
- `/zap/[slug]`: one-click creator runner.
- `/runs/[runId]`: run progress and output detail.
- `/settings`: wallet auth and BYOK provider secrets.

Auth posture:

- The global thirdweb button is optional. Public pages, embeds, template search, and plan-only runs work without it.
- thirdweb SIWE exchanges a signed wallet message for a Supabase session stored in an HttpOnly `zap_supabase_token` cookie.
- Studio, the user secret vault, and WZRD Cloud spend require a verified `wallet:0x…` principal. Anonymous/self-hosted BYOK remains supported.
- Credential resolution is request-scoped BYOK, then the signed-in user's encrypted Supabase vault, then wallet-metered WZRD Cloud. Sources never mix within one provider call.
- Provider webhooks require `ZAP_PROVIDER_WEBHOOK_SECRET` in production; hosted publishing requires `ZAP_PUBLISH_TOKEN`.
- Poll drain uses `ZAP_POLL_DRAIN_SECRET`; Eve accepts Supabase sessions, Vercel OIDC, local dev, or `ZAP_AGENT_TOKEN`.

Machine surfaces:

- `/.agent` and `/.well-known/agent.json`: the same v0.3.0 discovery manifest.
- `/api/zaps?query=cup`: canonical registry search used by the gallery and CLI.
- `/zaps/:slug/plan`: public plan-only endpoint.
- `/eve/v1/slack`, `/eve/v1/telegram`, `/eve/v1/imessage`: signed channel webhooks.

Smoke production after deploy:

```bash
curl -I https://zap.wzrd.tech/
curl -I https://zap.wzrd.tech/docs
curl -I https://zap.wzrd.tech/studio
```

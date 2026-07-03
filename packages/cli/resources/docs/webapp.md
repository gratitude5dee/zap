# Web App

The Zap web app is the creator and developer surface deployed at `zap.wzrd.tech`.

Primary routes:

- `/`: public landing page and first product signal.
- `/gallery`: installed Zap gallery.
- `/docs`: docs entry point.
- `/quickstart`: agent quickstarts for Codex, Claude Code, Cursor, OpenClaw, Hermes, and similar tools.
- `/studio`: Eve-powered agent studio.
- `/zap/[slug]`: one-click creator runner.
- `/runs/[runId]`: run progress and output detail.
- `/settings`: wallet auth and BYOK provider secrets.

Auth posture:

- Public docs, gallery, and mock demo runs are accessible.
- Creator live runs and provider secrets require wallet-authenticated Supabase bearer tokens.
- Basic Auth may still protect legacy provider/Eve surfaces where configured.

Smoke production after deploy:

```bash
curl -I https://zap.wzrd.tech/
curl -I https://zap.wzrd.tech/docs
curl -I https://zap.wzrd.tech/studio
```

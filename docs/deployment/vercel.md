# Vercel Deployment

The production project is `zap`, with Node `24.x`.

## Required Checks

- Attach and verify `zap.wzrd.tech` on the Vercel project.
- Configure sensitive env vars for Convex, Supabase, Upstash, Blob, and provider-level app credentials.
- Set `ZAP_POLL_DRAIN_URL` to the deployed `/api/providers/poll/drain` URL.
- Set `ZAP_POLL_DRAIN_SECRET` in both Convex and Vercel if the drain endpoint is protected.

User provider keys belong in Supabase, not Vercel env vars.

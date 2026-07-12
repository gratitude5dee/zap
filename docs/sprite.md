# Sprite Alpha

A Sprite is the deployable agent runtime produced by Studio. One signed-in wallet owns one Sprite in v0.3.0.

`agent/sprites/<slug>/Sprite.md` mirrors Zap frontmatter and contains exactly six wizard dimensions:

1. `sandbox`: a predefined Box (default), Vercel, Daytona, E2B, or local Docker preset.
2. `model`: LLM route plus model id.
3. `connections`: explicit MCP servers and plugin ids.
4. `connectors`: Composio productivity toolkit slugs.
5. `social`: Composio social toolkit slugs.
6. `channels`: Slack, Telegram, and/or iMessage bindings.

The wizard validates and stores the private manifest in Convex, creates a Composio MCP session using the immutable Supabase user id, verifies every requested toolkit, and creates or updates one deterministic Vercel project per wallet. The deployment receives only allowlisted runtime variables; Vercel and Composio control tokens are never copied into the Sprite.

Required control-plane variables are `COMPOSIO_API_KEY`, `SPRITE_VERCEL_TOKEN` (or `VERCEL_TOKEN`), `SPRITE_VERCEL_TEAM_ID`, `SPRITE_VERCEL_GIT_REPO`, and `SPRITE_VERCEL_GIT_REPO_ID`. Optional `SPRITE_VERCEL_GIT_REF` and `SPRITE_VERCEL_ROOT_DIRECTORY` select the source revision.

An active Sprite restricts `run_zap` to its declared zap list and exposes only its selected channel handlers. Connector OAuth uses a manual Composio authorization redirect from the wizard and remains scoped to the same stable user id across deployments.

# Sprite Alpha

A Sprite is the deployable agent runtime produced by Studio. One signed-in wallet owns one Sprite in v0.3.1.

`agent/sprites/<slug>/Sprite.md` mirrors Zap frontmatter and contains exactly six wizard dimensions:

1. `sandbox`: a predefined Box (default), Vercel, Daytona, E2B, or local Docker preset.
2. `model`: LLM route plus model id.
3. `connections`: explicit MCP servers and plugin ids.
4. `connectors`: Composio productivity toolkit slugs.
5. `social`: Composio social toolkit slugs.
6. `channels`: Slack, Telegram, and/or iMessage bindings.

The wizard validates and stores the private manifest in Convex, creates a Composio MCP session using the immutable Supabase user id, verifies every requested toolkit, and creates or updates one deterministic Vercel project per wallet. The deployment receives only allowlisted runtime variables; Vercel and Composio control tokens are never copied into the Sprite. Sandbox presets serialize their CPU, memory, and timeout contract into the runtime environment, while each backend applies only the controls its real SDK supports.

Required deployment control-plane variables are `SPRITE_VERCEL_TOKEN` (or `VERCEL_TOKEN`), `SPRITE_VERCEL_TEAM_ID`, `SPRITE_VERCEL_GIT_REPO`, and `SPRITE_VERCEL_GIT_REPO_ID`; `COMPOSIO_API_KEY` becomes required when a connector or social toolkit is selected. Optional `SPRITE_VERCEL_GIT_REF` and `SPRITE_VERCEL_ROOT_DIRECTORY` select the source revision. Use a least-privilege Vercel integration installation/access token for the managed project operations; Vercel OIDC authenticates runtime services but is not a management API credential.

`connections` are never silently collapsed to the first entry. Before a Sprite build, Zap resolves every explicit HTTPS MCP endpoint and every plugin id, then generates one Eve connection module per item. Plugin ids must exist in the server-only `SPRITE_PLUGIN_CATALOG_JSON` allowlist, for example `{"research":{"url":"https://mcp.example.com","headers":{"authorization":"Bearer …"}}}`. HTTP endpoints, unknown plugins, duplicate ids, and arbitrary package installation all fail validation.

Selecting a chat channel triggers a deployment preflight for its webhook credentials and durable Redis state. See [Chat Channels](./channels.md); a missing value fails before Zap creates or updates the wallet's Vercel project.

An active Sprite restricts `run_zap` to its declared zap list and exposes only its selected channel handlers. Connector OAuth uses a manual Composio authorization redirect from the wizard and remains scoped to the same stable user id across deployments.

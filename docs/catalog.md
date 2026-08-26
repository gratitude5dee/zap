# API Catalog

Zap v5 attaches catalog APIs through three API-store plugins instead of first-party adapters (C10):

- `apistore.context7` — hosted docs/search MCP at `https://mcp.context7.com/mcp` (`CONTEXT7_API_KEY`).
- `apistore.open-connector` — self-hosted connector MCP inside the VM at `http://127.0.0.1:3000/mcp` (loopback only, `OOMOL_CONNECT_*` from per-box env).
- `apistore.composio` — hosted MCP session minted by the control plane (entity = tenant id).

First-party rows are Zap gateway/media/memory providers that ship in the runtime itself.

Source of truth: `packages/runtime/src/apistore/catalog.json`.

| id | name | kinds | via |
| --- | --- | --- | --- |
| `openrouter` | OpenRouter | llm, gateway | `first-party` |
| `vercel-ai-gateway` | Vercel AI Gateway | llm, gateway | `first-party` |
| `openai` | OpenAI | llm | `first-party` |
| `anthropic` | Anthropic | llm | `first-party` |
| `xai` | xAI | llm | `first-party` |
| `gmi` | GMI Cloud | llm, media | `first-party` |
| `fal` | fal | media, image, video | `first-party` |
| `prodia` | Prodia | media, image | `first-party` |
| `runware` | Runware | media, image | `first-party` |
| `replicate` | Replicate | media, image, video | `first-party` |
| `elevenlabs` | ElevenLabs | media, audio | `first-party` |
| `mem0` | Mem0 | memory | `first-party` |
| `zep` | Zep | memory | `first-party` |
| `thirdweb` | Thirdweb | wallet, payments | `first-party` |
| `modal` | Modal | gpu, compute | `first-party` |
| `context7-docs` | Context7 library docs | docs, search | `context7` |
| `http-request` | Generic HTTP request | connector, http | `open-connector` |
| `webhook` | Webhook receiver | connector, http | `open-connector` |
| `rss` | RSS/Atom feeds | connector, content | `open-connector` |
| `smtp-email` | SMTP email send | connector, email | `open-connector` |
| `imap-email` | IMAP email read | connector, email | `open-connector` |
| `ical` | iCal calendars | connector, calendar | `open-connector` |
| `sqlite` | SQLite | connector, db | `open-connector` |
| `postgres` | PostgreSQL | connector, db | `open-connector` |
| `mysql` | MySQL | connector, db | `open-connector` |
| `redis` | Redis | connector, db | `open-connector` |
| `s3-compatible` | S3-compatible storage | connector, storage | `open-connector` |
| `ftp` | FTP/SFTP | connector, storage | `open-connector` |
| `webdav` | WebDAV | connector, storage | `open-connector` |
| `github` | GitHub | code, pm | `composio` |
| `gitlab` | GitLab | code, pm | `composio` |
| `bitbucket` | Bitbucket | code | `composio` |
| `linear` | Linear | pm | `composio` |
| `jira` | Jira | pm | `composio` |
| `asana` | Asana | pm | `composio` |
| `trello` | Trello | pm | `composio` |
| `clickup` | ClickUp | pm | `composio` |
| `monday` | Monday.com | pm | `composio` |
| `todoist` | Todoist | pm | `composio` |
| `notion` | Notion | docs, pm | `composio` |
| `confluence` | Confluence | docs | `composio` |
| `slack` | Slack | chat | `composio` |
| `discord` | Discord | chat | `composio` |
| `telegram` | Telegram | chat | `composio` |
| `whatsapp` | WhatsApp | chat | `composio` |
| `gmail` | Gmail | email | `composio` |
| `outlook` | Outlook | email, calendar | `composio` |
| `google-calendar` | Google Calendar | calendar | `composio` |
| `calendly` | Calendly | calendar | `composio` |
| `zoom` | Zoom | video, calendar | `composio` |
| `google-drive` | Google Drive | storage | `composio` |
| `google-sheets` | Google Sheets | docs, data | `composio` |
| `google-docs` | Google Docs | docs | `composio` |
| `dropbox` | Dropbox | storage | `composio` |
| `onedrive` | OneDrive | storage | `composio` |
| `box-com` | Box.com | storage | `composio` |
| `airtable` | Airtable | db, data | `composio` |
| `supabase` | Supabase | db, backend | `composio` |
| `hubspot` | HubSpot | crm | `composio` |
| `salesforce` | Salesforce | crm | `composio` |
| `zendesk` | Zendesk | support | `composio` |
| `intercom` | Intercom | support | `composio` |
| `stripe` | Stripe | payments | `composio` |
| `shopify` | Shopify | commerce | `composio` |
| `quickbooks` | QuickBooks | finance | `composio` |
| `xero` | Xero | finance | `composio` |
| `docusign` | DocuSign | docs, legal | `composio` |
| `twilio` | Twilio | sms, voice | `composio` |
| `sendgrid` | SendGrid | email | `composio` |
| `mailchimp` | Mailchimp | email, marketing | `composio` |
| `klaviyo` | Klaviyo | marketing | `composio` |
| `figma` | Figma | design | `composio` |
| `miro` | Miro | design | `composio` |
| `x-twitter` | X (Twitter) | social | `composio` |
| `linkedin` | LinkedIn | social | `composio` |
| `reddit` | Reddit | social | `composio` |
| `youtube` | YouTube | social, video | `composio` |
| `instagram` | Instagram | social | `composio` |
| `facebook` | Facebook | social | `composio` |
| `tiktok` | TikTok | social, video | `composio` |
| `google-maps` | Google Maps | geo | `composio` |
| `serpapi` | SerpAPI | search | `composio` |
| `firecrawl` | Firecrawl | scrape | `composio` |
| `exa` | Exa | search | `composio` |
| `perplexity` | Perplexity | search | `composio` |
| `tavily` | Tavily | search | `composio` |
| `browserbase` | Browserbase | browser | `composio` |
| `apify` | Apify | scrape | `composio` |
| `vercel` | Vercel | deploy | `composio` |
| `netlify` | Netlify | deploy | `composio` |
| `cloudflare` | Cloudflare | deploy, dns | `composio` |
| `pagerduty` | PagerDuty | ops | `composio` |
| `datadog` | Datadog | ops, analytics | `composio` |
| `sentry` | Sentry | ops | `composio` |
| `posthog` | PostHog | analytics | `composio` |
| `mixpanel` | Mixpanel | analytics | `composio` |
| `amplitude` | Amplitude | analytics | `composio` |
| `snowflake` | Snowflake | db, data | `composio` |
| `bigquery` | BigQuery | db, data | `composio` |
| `typeform` | Typeform | forms | `composio` |
| `greenhouse` | Greenhouse | hr | `composio` |
| `lever` | Lever | hr | `composio` |

Total: 102 APIs.

# UPGRADE.md — `@wzrdtech/zap` → Bezalel capability plane

State-of-the-world audit of the published package, a gap matrix against the
Bezalel capability-plane target, and the file-level implementation plan
(PART A–E) targeting this repo's actual stack.

Target surface (the Bezalel domain list): **memory, email, money, texting,
computer, sandboxes, connectors**, exposed through a **single MCP endpoint**
with **bearer tokens + scopes**, a **`health__check` tool**, **HTTP-served
skills + `llms.txt`**, and **open-connector instead of Composio**.

Reference implementations live in `gratitude5dee/airv2`:
`apps/web/lib/agentmail`, `apps/web/lib/wallet`, `apps/web/lib/payments`,
`apps/web/lib/connectors`, `infra/template` (memory/computer/sandboxes),
`apps/web/lib/miniapps/discovery.ts` (llms.txt + index building),
`apps/web/app/api/gateway/v1/[...path]/route.ts` (bearer-token auth + metering).

---

## 1. What is actually published (`@wzrdtech/zap@0.3.1`)

Verified with `npm view` + `npm pack` + tarball extraction on 2026-08-23.

| Field | Value |
| --- | --- |
| Latest version | `0.3.1` (published 2026-07-13; versions 0.1.0 → 0.3.1) |
| `repository` | `git+https://github.com/gratitude5dee/Zap.git`, `directory: packages/cli` — **same project as this repo** |
| `gitHead` | `32fdf4f325dd223029851ed7d0adfa5e6975e1be` (`fix: harden Studio UI and CLI install flow (#9)`) |
| `type` | `module` (plain ESM JS, no build step, no TS in the shipped package) |
| `bin` | `{ "zap": "bin/zap.js" }` — 2-line shim that imports `src/cli.js` |
| `main`/`exports` | none — the package is CLI-only; nothing is importable |
| `files` | `bin`, `resources`, `src`, `README.md` (44 files, ~123 KB unpacked) |
| `dependencies` | `@wzrdtech/core@0.3.0`, `@wzrdtech/zap-mcp@0.3.0`, `@wzrdtech/providers@0.3.0`, `convex@^1.28.0`, `yaml@^2.8.1` |
| `engines` | `node: 24.x` |
| Provenance | npm attestations present (SLSA provenance) — publishing is CI-driven (BuildSpace) |

Shipped tree:

```
package/
  bin/zap.js               # shim
  src/cli.js               # 1,782-line single-file CLI, all commands inline
  resources/docs/          # 22 markdown docs (zap-spec, mcp, sandboxes, deploy…)
  resources/skills/        # 5 skills: zap, zap-cli, zap-webapp, zap-authoring,
                           #   zap-providers + skills-manifest.json
  resources/registry/      # 2 sample recipes (zap-caught-by-the-cam, zap-world-cup-entrance)
```

CLI commands in 0.3.1: `init new validate lint run status dev studio add docs
finalize gallery search import skills doctor embed info inspect keys login
logout deploy mcp upgrade improve feedback telemetry`.

Notable existing wiring:

- `zap mcp` starts `@wzrdtech/zap-mcp` (stdio transport) with 10 tools:
  `zap_validate zap_lint zap_run zap_status zap_keys_list zap_gallery_list
  zap_deploy zap_import_hyperframes zap_import_openmontage zap_docs`.
- `zap login --token …` stores an API token (scrypt/AES-GCM encrypted at rest
  in `~/.zap`) against `https://zap.wzrd.tech` — a bearer-token client habit
  already exists, but there is no server-side scope model.
- `zap skills generate|update|check` maintains `skills-manifest.json` — the
  manifest generator the HTTP skills endpoint already consumes.
- `zap keys add|list|remove|test` manages *provider* keys (fal, Vertex,
  Bedrock, GMI…), not capability tokens.

### Drift: published 0.3.1 vs repo HEAD

HEAD (`7d3d33b`) is 6 commits ahead of the published `gitHead`. The delta
inside `packages/cli` is **docs-only** (3 files in `resources/docs/`,
+7/−3 lines: deploy.md, deployment/vercel.md, webapp.md). All code changes in
those 6 commits are webapp/service-side (Air Seedance video service, provider
poll cron). **Conclusion: the published package faithfully matches repo HEAD
for all executable code; no code drift to reconcile before building.**

### Workspace packages (repo HEAD)

| Package | Version | Published? | Contents |
| --- | --- | --- | --- |
| `@wzrdtech/zap` (`packages/cli`) | 0.3.1 | yes | the CLI above |
| `@wzrdtech/zap-mcp` (`packages/mcp`) | 0.3.0 | yes | stdio `McpServer`, 10 recipe tools, shells out to the CLI |
| `@wzrdtech/core` (`packages/core`) | 0.3.0 | yes | schema/parser/planner/manifest (zod + yaml) |
| `@wzrdtech/providers` (`packages/providers`) | 0.3.0 | yes | fal/vertex/aws/gmi/prodia/runware adapters, Upstash poll queue |
| `@wzrdtech/agent` (`packages/agent`) | 0.3.0 | yes | Eve agent instructions + budget guards |
| `@wzrdtech/sandbox-adapters` | 0.3.0 | **private** | hosted-sandbox backend resolver used by `agent/sandbox/sandbox.ts` |

The repo root is an Eve + Next.js + Convex app (`app/`, `agent/`, `lib/`)
that already serves `GET /api/skills` + `GET /api/skills/[skill]` from
`lib/zap-skills.ts`, `GET /api/agent-manifest`, channels
(`agent/channels/imessage.ts`, `chat.ts`, `eve.ts`), an Eve sandbox
(`agent/sandbox/sandbox.ts` → `@wzrdtech/sandbox-adapters`), a Composio MCP
client connection (`agent/connections/composio.ts`, `lib/sprite-composio.ts`),
and thirdweb wallet auth (`lib/thirdweb-auth.ts`, `lib/wallet-siwe.ts`).

---

## 2. Gap matrix — shipped Zap vs Bezalel target vs airv2 reference

Legend: ✅ shipped in `@wzrdtech/zap@0.3.1` · 🟡 exists in the Zap repo (webapp/agent side) but not in the published package/MCP surface · ❌ absent.

| Bezalel domain | Zap npm package | Zap repo | airv2 reference | Gap |
| --- | --- | --- | --- | --- |
| **Memory** | ❌ | ❌ | `infra/template/setup.sh` (`memory_enabled: true`, `~/.hermes/memories/{MEMORY.md,USER.md}`) | Net-new: `memory__*` tools over a per-token markdown store |
| **Email** | ❌ | ❌ | `apps/web/lib/agentmail/client.ts` (AgentMail inbox provisioning, draft-only key posture) | Net-new: `email__*` tools wrapping AgentMail; draft/send split enforced by scopes |
| **Money** | ❌ | 🟡 thirdweb SIWE auth + `lib/wzrd-cloud-meter.ts` billing meter; no wallet/send tools | `apps/web/lib/wallet/{project,read,send,qr}.ts`, `apps/web/lib/payments/{stripe,x402,link}.ts` | Port read/send/x402; approvals for value movement |
| **Texting** | ❌ | 🟡 `agent/channels/imessage.ts` (Eve channel, HITL tests) — channel-shaped, not tool-shaped | airv2 Spectrum stack (`apps/web/lib/spectrum`) | Wrap the existing channel as `texting__send` etc. behind scopes |
| **Computer** | ❌ | ❌ | `infra/template/skills/computer-relay`, box dashboard plugins | Net-new: `computer__*` relay tools (screenshot/act) against a box/VM endpoint |
| **Sandboxes** | 🟡 `resources/docs/sandboxes.md` only | ✅ `agent/sandbox/sandbox.ts` + `packages/sandbox-adapters` (private) | airv2 Daytona lane (`DAYTONA_*` secrets) | Expose `sandbox__{create,exec,destroy}` tools; publish or inline the adapter |
| **Connectors** | ❌ | 🟡 Composio: `agent/connections/composio.ts`, `lib/sprite-composio.ts`, `@composio/{core,vercel}` in root deps | `apps/web/lib/connectors/{manage,meta}.ts` (Composio-based) | Replace with **open-connector**: OAuth broker owned by us, `connector__*` tools; Composio kept only as a shim during migration |
| **Single MCP endpoint** | 🟡 stdio only (`zap mcp`) | 🟡 no HTTP transport, no route | `apps/web/app/api/gateway/v1/[...path]/route.ts` (single authenticated entry point pattern) | Add Streamable-HTTP transport + `app/api/mcp/route.ts`; one URL serves every domain |
| **Bearer tokens / scopes** | 🟡 client-side only (`zap login` token store) | 🟡 `lib/run-request-auth.ts`, `lib/zap-run-auth.ts` (run-scoped) | gateway route: per-box `GATEWAY_TOKEN`, server-side resolution, 429 caps | Net-new token issuance + scope model (`mem.rw`, `email.draft`, `email.send`, `money.read`, `money.send`, …) |
| **`health__check` tool** | ❌ | ❌ | (doctor-style checks exist in `zap doctor`) | Trivial once the tool registry exists; reuse `doctor` internals |
| **HTTP-served skills** | 🟡 skills ship in tarball; manifest tooling exists | ✅ `GET /api/skills`, `GET /api/skills/[skill]` (`lib/zap-skills.ts`) | `infra/template/skills/*` fetched into boxes | Extend manifest with capability skills; add `zap skills install <url>` |
| **`llms.txt`** | ❌ | ❌ (no llms.txt anywhere in repo) | `apps/web/app/mini/llms.txt/route.ts` + `apps/web/lib/miniapps/discovery.ts` (single projection → llms.txt/index.json/agent.md/sitemap) | Port the discovery-module pattern; one builder feeds `/llms.txt` and `/api/skills` |

Also missing relative to target: a `zap connect` command (mint a token +
print/register the MCP endpoint for a client) — nothing similar exists today.

---

## 3. File-level implementation plan (PART A–E)

Stack facts the plan honors: workspace packages are **plain ESM JS** (no
build step for `cli`/`mcp`; `core`/`providers`/`agent` build with tsc),
tools use `zod/v4` schemas via `@modelcontextprotocol/sdk`'s `McpServer`,
the webapp is Next.js App Router on Vercel with Convex + Supabase + Upstash
already in `lib/`, and publishing is CI-driven with provenance.

### PART A — Single MCP endpoint + bearer tokens/scopes + `health__check`

The spine everything else plugs into.

1. **`packages/mcp/src/registry.js`** (new)
   Break the monolithic `registerTools(server)` in
   `packages/mcp/src/server.js` into a domain registry:
   ```js
   // registry.js
   export function registerDomains(server, ctx) {
     for (const domain of [health, recipes /* existing zap_* tools */,
                           memory, email, money, texting, computer,
                           sandboxes, connectors]) {
       domain.register(server, ctx);   // ctx = { auth, store, fetchImpl }
     }
   }
   ```
   Each domain module exports `{ name, scopes, register }`. Tool names use
   the `domain__verb` convention (`health__check`, `memory__read`, …); the
   existing `zap_*` recipe tools stay untouched under the `recipes` domain.

2. **`packages/mcp/src/domains/health.js`** (new)
   `health__check` — no scope required. Returns `{ ok, version, domains:
   [{name, ok, detail}] }` by calling each registered domain's optional
   `probe(ctx)`. Reuse the connectivity checks from `doctorCommand` in
   `packages/cli/src/cli.js` (extract them to
   `packages/core/src/doctor-checks.js` so both CLI `zap doctor` and the
   tool share one implementation).

3. **`packages/mcp/src/auth.js`** (new)
   Bearer-token verification + scope gate, modeled on airv2's gateway route
   (`apps/web/app/api/gateway/v1/[...path]/route.ts`: token → server-side
   resolution → enforcement → metering):
   ```js
   export async function verifyToken(authorization, store) -> { tokenId, scopes[], subject } | null
   export function requireScope(ctx, scope)  // throws McpError(-32603, "missing scope …")
   ```
   Token format: `zap_<base62 id>_<secret>`; only `sha256(secret)` is stored.

4. **`packages/mcp/src/http.js`** (new)
   Streamable-HTTP transport wrapper: `createZapMcpHandler({ store })`
   returning a `(request: Request) -> Response` fetch handler using
   `@modelcontextprotocol/sdk/server/streamableHttp.js`. Stdio stays for
   local use; this handler is what the webapp mounts.

5. **`app/api/mcp/route.ts`** (new) — the single endpoint:
   ```ts
   import { createZapMcpHandler } from "@wzrdtech/zap-mcp/http";
   const handler = createZapMcpHandler({ store: supabaseTokenStore() });
   export const POST = handler; export const GET = handler;
   export const runtime = "nodejs"; export const dynamic = "force-dynamic";
   ```

6. **Token issuance + storage**
   - `supabase/migrations/<ts>_mcp_tokens.sql` (new): `mcp_tokens(id,
     subject, token_hash, scopes text[], created_at, expires_at,
     revoked_at, last_used_at)`.
   - `lib/mcp-token-store.ts` (new): mint/verify/revoke against Supabase via
     the existing `lib/supabase/server.ts` client; mirror the hashing and
     never-log-secret discipline of `lib/run-request-auth.ts`.
   - `app/api/mcp/tokens/route.ts` (new): POST mint (session-authed via
     existing thirdweb/`app/api/auth/session`), GET list, DELETE revoke.

7. **`packages/mcp/package.json`**: add `"./http"` to `exports`; bump to
   0.4.0. **`packages/mcp/src/server.js`**: replace inline registration with
   `registerDomains`, keep `startZapMcpServer()` signature.

8. **Tests**: `tests/mcp-auth.test.ts`, `tests/mcp-health.test.ts` (vitest,
   root config) — token verify/scope-deny paths and `health__check` shape,
   in the style of `tests/channel-security.test.ts`.

### PART B — Capability domains: memory, email, money, texting

One file per domain in `packages/mcp/src/domains/`, thin over `lib/` service
modules so the webapp and MCP share implementations.

1. **Memory** — `packages/mcp/src/domains/memory.js` + `lib/memory-store.ts`
   (new). Tools: `memory__read`, `memory__append`, `memory__search`.
   Storage: per-subject markdown documents (`MEMORY.md`, `USER.md`) in
   Supabase (or the existing blob store `lib/blob-store.ts`), mirroring the
   airv2 box-filesystem memory (`infra/template/setup.sh` MA9.1) but keyed
   by token subject since Zap has no per-user VM. Scope: `mem.rw`.

2. **Email** — `packages/mcp/src/domains/email.js` + `lib/agentmail.ts`
   (new; port of airv2 `apps/web/lib/agentmail/client.ts`). Tools:
   `email__list`, `email__read`, `email__draft`, `email__send`.
   Scopes split **`email.draft`** vs **`email.send`** so the airv2
   "draft-only key" posture is reproducible by simply not granting
   `email.send`. Env: `AGENTMAIL_API_KEY` (server-side only). Provisioning:
   `lib/agentmail.ts#ensureInbox(subject)` creates `<subject>@wzrd.tech`
   inboxes lazily.

3. **Money** — `packages/mcp/src/domains/money.js` + `lib/wallet/` (new dir;
   port airv2 `apps/web/lib/wallet/{project,read,send}.ts` and
   `apps/web/lib/payments/x402.ts`, adapting imports to this repo's
   thirdweb client in `lib/thirdweb-client-options.ts`). Tools:
   `money__balance`, `money__send` (scope `money.send`, plus Eve
   `once()`-style approval like `agent/connections/composio.ts` uses),
   `money__payment_link` (Stripe, port `payments/link.ts` if/when Stripe is
   added), `money__x402_pay`. Env: `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`
   for x402 settlement. Port `send.test.ts`/`x402.test.ts` alongside.

4. **Texting** — `packages/mcp/src/domains/texting.js` wrapping the existing
   Eve iMessage channel. Extract the send path from
   `agent/channels/imessage.ts` into `lib/imessage-send.ts` so both the
   channel and the tool call it; keep the HITL guards exercised by
   `tests/imessage-hitl.test.ts`. Tools: `texting__send`,
   `texting__thread_history`. Scope: `texting.send`.

### PART C — Computer + sandboxes

1. **Sandboxes** — `packages/mcp/src/domains/sandboxes.js`. The runtime
   already exists: `agent/sandbox/sandbox.ts` →
   `packages/sandbox-adapters/src`. Tools: `sandbox__create`,
   `sandbox__exec`, `sandbox__upload`, `sandbox__destroy`. Two wiring
   changes:
   - flip `packages/sandbox-adapters/package.json` `private: true` → publish
     as `@wzrdtech/sandbox-adapters@0.4.0` (or inline the resolver into
     `packages/mcp` if we don't want another public package);
   - add a Daytona backend to the resolver mirroring airv2's per-user lane
     (`@daytonaio/sdk` is already a root dependency), selected via
     `ZAP_SANDBOX_BACKEND=daytona`. Scope: `sandbox.exec`.

2. **Computer** — `packages/mcp/src/domains/computer.js` + `lib/computer-relay.ts`
   (new). airv2's `infra/template/skills/computer-relay` drives a browser/VM
   on the user's box; Zap has no boxes, so v1 relays to a *sandbox* browser:
   `computer__screenshot`, `computer__act` execute against a Playwright
   session inside a sandbox created by PART C.1 (backend-agnostic: the tool
   only needs `sandbox__exec`). Scope: `computer.act`. This keeps the tool
   contract identical to the eventual box-backed version.

### PART D — HTTP-served skills + llms.txt (discovery surface)

Pattern to port: airv2's single-projection discovery module
(`apps/web/lib/miniapps/discovery.ts` builds llms.txt, index.json, agent.md,
sitemap from one sanitized projection; served by
`apps/web/app/mini/llms.txt/route.ts`).

1. **`lib/discovery.ts`** (new): one projection over (a) the skills manifest
   (`lib/zap-skills.ts#loadZapSkillManifest`) and (b) the MCP domain/tool
   registry (import `ZAP_MCP_TOOLS`-style metadata from
   `@wzrdtech/zap-mcp/registry`). Builders: `buildLlmsTxt()`,
   `buildSkillsIndex()`, `buildAgentMd()`.
2. **`app/llms.txt/route.ts`** (new): serves `buildLlmsTxt()` — lists the
   MCP endpoint URL, auth scheme, every `domain__tool` with one-line
   descriptions, and skill download URLs.
3. **Skills for the new domains**: add
   `packages/cli/resources/skills/zap-capabilities/SKILL.md` (how to call
   the endpoint, token/scope model, per-domain examples) and regenerate the
   manifest with `zap skills update`. `app/api/skills` picks them up with
   zero code changes (manifest-driven).
4. **`zap skills install <url>`** subcommand in `packages/cli/src/cli.js`
   `skillsCommand`: fetch a served skill (`?format=json`) into
   `.agents/skills/<name>/SKILL.md` locally — the consumption side of the
   HTTP-served skills loop.

### PART E — CLI, connect flow, open-connector, packaging

1. **`zap connect`** (new command in `packages/cli/src/cli.js`, added to the
   `commands` array + help):
   - `zap connect` — using the stored `zap login` token, POST
     `/api/mcp/tokens` to mint a scoped bearer token, then print (and with
     `--json` emit) a ready-to-paste MCP client config:
     `{ "url": "https://zap.wzrd.tech/api/mcp", "headers": { "Authorization": "Bearer …" } }`.
   - `--scopes mem.rw,email.draft` to narrow; default is the token's max.
   - `--claude`/`--cursor` flags write the config into the local client
     config file (same spirit as the existing `add`/install flow).

2. **Open-connector (replace Composio)**:
   - `lib/open-connector/` (new): `registry.ts` (connector descriptors:
     name, OAuth endpoints, scopes, base URL), `oauth.ts` (authorization-code
     + refresh flow; tokens encrypted at rest in Supabase table
     `connector_grants` — new migration), `execute.ts` (typed fetch
     executor per connector).
   - `app/api/connectors/[connector]/authorize/route.ts` +
     `callback/route.ts` (new): the OAuth broker, replacing the airv2
     Composio manage layer (`apps/web/lib/connectors/manage.ts`) with a
     first-party equivalent.
   - `packages/mcp/src/domains/connectors.js`: `connector__list`,
     `connector__authorize_url`, `connector__call` (scope
     `connectors.<name>`).
   - Migration: keep `agent/connections/composio.ts` behind
     `COMPOSIO_MCP_URL` until the first three open connectors (start with
     Google Calendar, Notion, Slack) pass `tests/connector-*.test.ts`; then
     drop `@composio/core`/`@composio/vercel` from root `package.json` and
     delete `lib/sprite-composio.ts` usage behind a feature flag.

3. **Packaging/publish**:
   - `packages/mcp` 0.3.0 → **0.4.0** (new exports `./http`, `./registry`;
     new deps only if the domain modules need them — keep heavy SDKs
     (thirdweb, AgentMail, Daytona) **out** of `packages/mcp` by injecting
     implementations via `ctx` from the webapp/CLI, so the published MCP
     package stays light and the stdio mode degrades gracefully to
     `health__check` + recipes when capability backends are absent).
   - `packages/cli` 0.3.1 → **0.4.0**: `connect` + `skills install`,
     bumped workspace deps, docs under `resources/docs/` regenerated via
     `npm run docs:sync`.
   - Publish via the existing BuildSpace CI (provenance preserved); npm
     `latest` tag after `npm run cli -- validate`, `npm test`,
     `npm run typecheck` pass per AGENTS.md.

### Sequencing & test gates

| Order | Slice | Gate |
| --- | --- | --- |
| 1 | PART A (registry, auth, HTTP route, health__check, token store) | `tests/mcp-auth.test.ts`, `curl /api/mcp` with minted token lists tools |
| 2 | PART D.1–D.2 (llms.txt from registry) | `/llms.txt` renders every registered tool |
| 3 | PART B memory + email (smallest domains) | domain tests + scope-deny tests |
| 4 | PART C sandboxes, then computer (depends on sandboxes) | `test:sandboxes` extended |
| 5 | PART B money + texting (approval-gated) | ported `send/x402` tests, `imessage-hitl` still green |
| 6 | PART E connect + open-connector + publish 0.4.0 | `zap connect` E2E against prod endpoint |

Each slice is independently shippable; the endpoint is useful from slice 1
(`health__check` + existing recipe tools over HTTP with bearer auth).

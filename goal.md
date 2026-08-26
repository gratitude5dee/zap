# goal.md — build spec for Zap v5, the Composable CPU Agent Runtime

**Specification of record** for upgrading `@wzrdtech/zap@0.3.1` → `@wzrdtech/zap@5.0.0`. This single file carries what/when (milestones), how (architecture + contracts), proof (TDD + evals), and where (deployment). Where a later section and an earlier section disagree, **§4–§5 (the model and the contracts) win on mechanism; §6 (milestones) wins on order and acceptance**; this file is the bug and must be fixed in the same PR.

Read these before writing code, in this order:

1. `zap-main 3/` — the current repo (`@wzrdtech/zap@0.3.1`, Eve 0.22.4). Everything in §0 already exists there. Extend it; do not rewrite it.
2. `airv2-main 7/ARCHITECTURE.md` §1, §2.3, §5, §6, §8 and `airv2-main 7/infra/template*/` — the Box-first operating model for zap-heavy. airv2 **wins on Box lifecycle questions** (fork → ready → idle/`stop_after` → stop/resume, `--no-env`, `host --private`, never `force`).
3. `zap-upgrade-main/src/lib/zap/{templates,sessions,providers,harnesses}.ts` — the locked composer configuration this spec was produced from. Constraints C1–C12 are copied from it verbatim and extended (C19+); sessions A–J keep their names and milestones but their blocked-by edges and file ownership were corrected after auditing the code (§13 is authoritative).
4. The Cordis primer (`deepseek-ai/deepseek-harness/docs/cordis-primer.md`) — the kernel is Cordis-*inspired*, not a Cordis fork, and this is the last time that name appears on anything a user could read (C3).
5. The brief's **§0.5 "Agents as code"** addendum — locked programming-model law, reproduced as §4.12 (model) and §5.12 (contracts). If anything else in this file conflicts with it on *how an agent is written*, §4.12/§5.12 win and the other section is the bug.

**Revision note (2026-08-25, rev 2).** This revision folds the agents-as-code addendum into the spec (C13–C18, §4.12, §5.12, Z12, session K) and, after three adversarial review passes, fixes what that exposed: there are **two kernel instances** (caller and in-VM, §4.1) and **no model loop ever runs outside the tenant VM** (`harness.zap` = executor library in the VM + `http-runs` driver in the caller; the control plane only proxies); `@wzrdtech/zap-agent` sits *below* `@wzrdtech/zap-runtime` in the build; the sandbox contract gained `sandbox.local`, `LaneExecutor` and `ExecOptions.lane`; the in-VM kernel gets `pay.delegated` + `meter.reporter` (no Upstash/Convex in a VM); `harness.zap`'s manifest is `http-runs` on zap-agentd 8722; the gate covers prompt runs and turns in both modes; and the C3 public-naming rule is enforced by `tests/no-platform-names.test.ts` with an explicit deny-list. Constraint numbers C19–C30 are the former C13–C24.

**What you are building.** Zap v5 turns Zap from "one-click generative media recipes on Eve" into a **composable CPU agent runtime**: an npm package, a CLI, an MCP server, and a set of skills (an agent-plugin) that let an agent or a human **compose** a runtime from plugins (sandbox, memory, gateway, harness, payer, channels, skills), **create** it as a named, forkable microVM template on ascii.dev Box first (Namespace, Microsandbox/Hyperlight, E2B, Daytona, Cloudflare, Modal, Runpod behind the same contract), and **use** it — run code, click buttons, read files, call APIs, write outputs — under a plan-only default with explicit, metered live spend paid either with the user's own keys (self-host / BYOK) or per request via x402 / MPP through the user's Thirdweb wallet (managed). Three weights: **zap-light** (zap-VM: ffmpeg, code, files, browser, APIs, writes), **zap-med** (light + AI/gen-media gateway + generative-media filesystem + ffmpeg presets), **zap-heavy** (med + memory + API store + skills store + a named agent harness). Template names are `zap-<light|med|heavy>-<harness>`. **Agents are written as code**: a TypeScript function that *renders* the next step's instructions and attaches capabilities with hooks; the runtime executes the model, tools, and streaming, and every tool that does CPU work runs on the sandbox (§4.12). An agent is addressed as `agent-id@alias`, deployed with `zap deploy --watch` (development) or `zap deploy --alias production` (immutable), and talked to with `zap session`.

**Why CPU.** Agents mostly *do*; they do not mostly *think*. Running code, clicking, reading, calling, writing are CPU workloads, and the doing:thinking ratio of a productive agent is ~10:1 or higher. Spend on agent execution will exceed spend on inference. Zap v5 is the runtime for that work; GPUs and LLMs are plugins it calls, not the substrate it runs on.

**Target:** the existing private beta scale (10–100 tenants, hundreds of runtimes). Correctness and isolation over scale. Ship in the order of §6; parallelize per §13.

**Locked composer configuration** (from `zap-upgrade-main`; treat every line as a constraint):

| Setting | Value |
|---|---|
| Weight for this build | **heavy** (light and med are built on the way and ship too) |
| Primary sandbox | **ascii.dev Box** [LOCKED] |
| Additional sandboxes | Namespace, E2B, Daytona, Hyperlight/Microsandbox (self-host zap-VM); Cloudflare Sandbox first-party; Modal/Runpod as GPU plugins; Blaxel/Freestyle/Orgo/Tensorlake/Baseten as catalog stubs |
| Default memory | **OpenViking** (Mem0, Zep as plugins) |
| Auth / pay | **both**: BYOK self-host (API key, OpenAI/Codex auth, Claude Code auth) **and** managed x402 / MPP via Thirdweb wallet |
| Harnesses (default-on) | Hermes, OpenClaw, OpenCode, xAI/Grok-routed, DeepSeek Harness (dsh), omg.dev |
| Harnesses (opt-in) | Pi, Cursor-shaped, Devin Outposts worker, Kimi Code, Open Interpreter (med+), Agno, prime-agent, headlong, FrontierAgent, fx (med+) |
| CLI · MCP · Skills | yes · yes · yes (agent-first; every command has `--json`) |
| Reactive agents as code | **yes [LOCKED default]** — `@wzrdtech/zap-agent` (`packages/agent-code`), `agents/<id>/agent.ts` layout, `agent-id@alias` addressing, `zap session` / `zap deploy` (§4.12, §5.12, Z12, session K) |
| Gen-media FS · GPU plugins | yes · yes (opt-in, never default) |
| Connector catalog | typed catalog + Composio + open-connector + Context7 (no 80 first-party adapters) |
| Self-host zap-VM | yes — KVM host (Hetzner or alternative) running Microsandbox microVMs + Hyperlight-wasm lanes |
| Node · publish | 24.x · `npx @wzrdtech/zap@5.0.0` from `packages/cli` |

---

## 0. What already exists — audit before you write code

Do not rebuild any of this. Extend it. Every row is live in `zap-main 3/` at v0.3.1 unless marked otherwise.

| Subsystem | Where | State |
|---|---|---|
| Recipe schema + parser + planner | `packages/core/src/{schema,planner,manifest,sprite}.ts` (`@wzrdtech/core@0.3.0`) | Live. `Zap.md` frontmatter v2 (`zapSpecSchema`: budget, defaults, inputs, steps[kind∈image.gen…stitch], output, publish); `planZapRun`, `expandRepeatSteps`, `quoteStep`; skills manifest hashing; `Sprite.md` (six wizard dimensions: sandbox/model/connections/connectors/social/channels) with `spriteSandboxPresets` (`box-standard` default, vercel/daytona/e2b/docker). **Frozen — C1.** v5 adds `Runtime.md` beside it (§5.8); it never edits `Zap.md`. |
| Media provider adapters + deterministic router | `packages/providers/src/*` (`@wzrdtech/providers@0.3.0`), `lib/providers/router.ts`, `lib/llm-route.ts` | Live. `ProviderAdapter` {id, secretTypes, auth, defaultModel, submit(req, idemKey), poll, parseWebhook, price, validateKey, supports}; adapters aws/vertex/gmi/fal/prodia/runware; `modelRates` + operator-priced models via env (`GMI_SEEDANCE_FAST_USD_PER_SECOND`); Upstash poll queue (`zap:poll:dead`). LLM routes `gateway|openai|anthropic|openrouter` (`ZAP_LLM_ROUTE`, `resolveLlmRoute`, `createLlmModel`). v5's gateway service (§5.5) wraps these; it does not replace them. |
| Sandbox backends behind one Eve contract | `packages/sandbox-adapters/src/{index,backend,session,resources,managed-secrets,e2b,daytona}.ts`, `agent/sandbox/sandbox.ts` | Live. `resolveSandboxBackend(env)` selects `box` (default, `@asciidev/eve-box`, `noEnv: true`) / vercel / daytona / e2b / docker / auto; `createVendorBackend` + `SandboxDriver` {id, run, read, write, remove, setNetworkPolicy, shutdown}; `buildVendorSandboxSession` anchors paths at `/workspace`; `withBoxLifecycleCompatibility` maps legacy Box `dispose` to Eve `shutdown` via `POST https://ascii.dev/api/box/v1/boxes/{id}/stop`; resources `ZAP_SANDBOX_{CPU,MEMORY_MB,TIMEOUT_SECONDS}`; managed Box key via Supabase `zap-managed-provider-secrets`. Contract suite `tests/sandbox-contract.test.ts` (memory driver + opt-in hosted `RUN_HOSTED_SANDBOX_TESTS=1`). v5 keeps this as the **Eve bridge** over the new `@wzrdtech/zap-sandbox` contract (§5.3). |
| CLI | `packages/cli/src/cli.js` (`@wzrdtech/zap@0.3.1`, `bin/zap.js`, bundled `resources/{docs,registry,skills}`) | Live. 28 commands: init, new, validate, lint, run (plan-only default, `--live`), status, dev, studio, add, docs, finalize, gallery, search, import (hyperframes/openmontage), skills, doctor, embed, info, inspect, keys (add/list/test/remove/sync; AES-256-GCM under scrypt(user:host) in `.zap/credentials.json` mode 0600), login/logout (`.zap/auth.json`), deploy, mcp, upgrade, improve, feedback, telemetry. Config dir `./.zap` (project) or `~/.zap`. `loadDotEnv`. Acceptance test `tests/cli-acceptance.test.ts` pins `0.3.1` and the help text. |
| MCP server | `packages/mcp/src/server.js` (`@wzrdtech/zap-mcp@0.3.0`, bin `zap-mcp`) | Live. stdio `McpServer`; 10 tools (`zap_validate, zap_lint, zap_run, zap_status, zap_keys_list, zap_gallery_list, zap_deploy, zap_import_hyperframes, zap_import_openmontage, zap_docs`) that shell out to the CLI with `--json` (`ZAP_CLI_BIN` → local bin → PATH); never returns secret values. |
| Agent helpers (Eve agent) | `packages/agent/src/instructions.ts` (`@wzrdtech/agent`), `agent/agent.ts`, `agent/instructions.md`, `agent/tools/*.ts` (run_zap, quote_zap, save_zap, judge_asset, …), `agent/lib/budget.ts` | Live. **Eve's** `defineAgent` (from `eve`) and `defineTool` (from `eve/tools`) with `resolveLlmRoute`; `assertLiveSpendAllowed`; session budget `zapBudget`; `run_zap` requires `user-approval` when `live`. This Eve agent stays as the Studio/channel agent (C1, C29). v5's `@wzrdtech/zap-agent` exports names of the same shape (`defineAgent`, `defineTool`) from a different package for a different layer (§4.12); `@wzrdtech/zap-agent` never imports `@wzrdtech/agent` or `eve`; the one bridge, `packages/agent/src/zap-bridge.ts` (K-owned, in the Eve package), wraps a deployed Zap agent as an Eve tool for the Studio agent. |
| Skills (agent-plugin) | `skills/{zap,zap-authoring,zap-cli,zap-providers,zap-webapp}/SKILL.md`, `skills/skills-manifest.json`, `/api/skills[/<skill>]`, `/.agent`, `/.well-known/agent.json` | Live. Hash-manifested; served remotely at `https://zap.wzrd.tech/api/skills`. |
| Recipes (zap skills) + registry | `agent/skills/zap-<slug>/{SKILL.md,Zap.md,prompts/*.md}`, `registry/zaps/index.json`, `lib/zap-registry.ts` | Live. `zap-world-cup-entrance`, `zap-caught-by-the-cam`, `zap-air-imessage-video`. **Golden dry-run regression set — sacred (TDD law 8).** |
| Web + control plane | Next.js 16 on Vercel (`app/`), Convex (`convex/{schema,runs,zaps,sprites}.ts`; runs/steps/assets/feedback/sprites/cronLogs), Upstash (idempotency, poll queue, WZRD Cloud meter `lib/wzrd-cloud-meter.ts` atomic Lua reserve/settle), Supabase (`zap-user-secrets`, `zap-managed-provider-secrets`, `zap-wallet-proof` edge functions; migrations `supabase/migrations/2026070*`), Vercel Blob | Live. Studio (wallet-gated), gallery, docs, embeds, run pages, Sprite wizard + scoped Vercel deploy, Slack/Telegram/iMessage channels. Frontend stays on Vercel [LOCKED]. |
| Wallet auth | `lib/thirdweb-auth.ts` (`createAuth` from `thirdweb/auth`, SIWE, `THIRDWEB_SECRET_KEY` preferred, public client id fallback), `lib/wallet-siwe.ts` (`validateWalletLoginPayload`), `app/api/auth/*`, `supabase/functions/zap-wallet-proof` | Live. Principal id `wallet:0x…` is the metering identity. v5 reuses it for `zap pay login --managed` (managed mode) and for x402/MPP payer identity. |
| Metering | `lib/wzrd-cloud-meter.ts` (`reserveWzrdCloudSpend` / `settleWzrdCloudSpend`, Upstash Lua, daily cap `WZRD_CLOUD_DAILY_CAP_USD`), `lib/run-ledger.ts` (Convex ledger rows record credential mode, wallet principal, route, model) | Live for media spend. v5 generalizes it into the `meter` service (§5.7) with new units (sandbox-seconds, gateway tokens, GPU-seconds, API calls, browser/computer minutes, egress bytes). |
| Evals | `evals/*.eval.ts`, `evals/live/*`, `npm run evals` (CI-safe, `EVALS_LIVE=1` opt-in) | Live. Keep the policy. |
| Tests | `tests/*.test.ts` (55 files), `vitest.config.ts` (`tests/**/*.test.ts`, node env), `npm test` builds packages first | Live. New packages add `packages/<pkg>/tests/*.test.ts` and register the glob (§10). |
| zap-light template (reference impl) | `airv2-main 7/infra/template-zap-light/{setup.sh,UPGRADE.md,zap-exec-loop,zap-exec.service}` | Reference, not in this repo. KVM probe → `~/.zap/capabilities.json` (`isolation: hyperlight|process`), lanes `codegen|ffmpeg|media-workflows`, allowlisted executor loop under `systemd-run` confinement, `zap-exec.service`. Port it into `packages/templates/zap-light-*` (§6 Z2). |
| zap-heavy template (reference impl) | `airv2-main 7/infra/template/{setup.sh,sync-box.sh,verify-box.sh,release.sh,boxctl.sh,*.service,openviking/ovctl.py,skills/*}`, `apps/web/lib/{box,namespace,compute,orchestrator}/*` | Reference. One user = one Hermes = one Box; systemd units (`hermes-gateway` 8642, `hermes-dashboard` 9119, `hermes-host` re-registers `host --private` after every resume, `openviking` loopback 1933); only `api_server` platform enabled (airv2 C12); `sync-box.sh` in-place baseline; release channels (R2 tarball + sha256). Port the invariants, not the product. |

The npm registry confirms `@wzrdtech/zap` latest is `0.3.1` (published 2026-07-13) with `@wzrdtech/core@0.3.0`, `@wzrdtech/providers@0.3.0`, `@wzrdtech/zap-mcp@0.3.0`. Eve upstream is at `0.44.3`; **Zap stays pinned at `eve@0.22.4`** for v5 (non-goal §2).

---

## 1. Hard constraints

C1–C12 are the locked composer constraints (verbatim). C13–C18 are the locked agents-as-code constraints from the brief's §0.5 addendum (verbatim in substance; §4.12 and §5.12 are their mechanism, and on *how an agent is written* they win over every other section). C19–C30 are added by this spec after auditing the code and the primary docs. A constraint is never "worked around"; if one blocks a task, the task is wrong or the constraint needs a human (§14).

| # | Constraint |
|---|---|
| **C1** | Do not rewrite Zap 0.3.1 recipes, Convex schema, or Eve skill layout unless a test proves it is required. |
| **C2** | Box (ascii.dev) is the default sandbox. Other providers implement the same contract. |
| **C3** | Kernel is Cordis-inspired, not a Cordis fork, and **`@wzrdtech/zap-kernel` has no runtime dependency on Cordis** (§4.3 records the one narrow exception and who may invoke it). Stay compatible with DeepSeek Harness plugin shapes where they overlap (`{ name, inject, apply(ctx, config) }`, service keys `ctx.tools`, `ctx.llm`, `ctx.sessions`). **Public surfaces never name Cordis or any other agent platform**: `docs/**`, `public/llms.txt`, `README.md`, `CHANGELOG.md`, package descriptions, JSDoc, error messages, `--json` output, and Studio copy describe the kernel and the programming model as Zap. Internal references (this file, code comments in `packages/kernel/src/internal/`, `docs/verify-log.md`) are the only places the prior art is named. `tests/no-platform-names.test.ts` greps the public surfaces and fails on a hit. |
| **C4** | CPU is the default. GPU providers are opt-in plugins for gen-media / training steps. |
| **C5** | Plan-only / dry-run is default. Live spend needs `--live` **and** a payer. No payer + `--live` = error `PAYER_MISSING`, never a silent downgrade. "Live spend" means side-effecting execution (lanes, media submits, paid API calls, browser purchases, on-chain actions); thinking tokens under a configured payer are metered plan-mode spend and do not require `--live` (C25 defines the boundary). |
| **C6** | No secrets in templates, snapshots, or logs. Box uses `noEnv: true`; per-box env is tenant-only. |
| **C7** | Self-host is BYOK (API keys, OpenAI/Codex auth, Claude Code auth). Managed is x402/MPP via Thirdweb. Both ship. |
| **C8** | Zap does not custody user funds. x402/MPP `payTo` is the tenant or platform treasury (`ZAP_TREASURY`), never an intermediate wallet Zap holds. The facilitator only broadcasts client-signed transfers. |
| **C9** | Template names are `zap-<light\|med\|heavy>-<harness>`. The three weight bases are named `zap-<weight>` and are the only exceptions; environment overlays are `env-<name>`. |
| **C10** | Catalog APIs attach through Composio + open-connector + Context7. Do not write 80 first-party adapters in v5. |
| **C11** | airv2 `ARCHITECTURE.md` wins on Box lifecycle questions (fork, snapshot, stop, `host --private`, `--no-env`, never `force`). |
| **C12** | Node 24.x. Publish `@wzrdtech/zap@5.0.0` from `packages/cli`. |
| **C13** | **Agent functions are reactive renders.** They return instructions (a string) for the next model step. They do not call models or tools. |
| **C14** | **Hooks may be conditional and must be synchronous.** Side effects belong in tools. Tools that do CPU work go through `sandbox.exec`. |
| **C15** | **Secrets are write-only.** Injected only into declared connections after origin, method, pathPrefix, agent, and environment checks. Never in prompts, logs, templates, snapshots, `--json`, API responses, or env dumps. |
| **C16** | **`defineConnection` allowlists HTTPS origin, methods, and pathPrefix.** `fetch` takes relative paths only; absolute URLs fail closed; hard-coded sensitive headers (`Authorization`, `Cookie`, `X-API-Key`) are build errors. |
| **C17** | **Sessions are durable turns bound to a deployment** addressed as `agent-id@alias`. Resume does not rebuild history locally. Moving an alias (including advancing `production`) never mutates in-flight sessions. |
| **C18** | **Agents are written as `defineAgent` + hooks + auto-packed `skills/`** (§4.12, §5.12). Zap hosts the render on its kernel and the work on Box. Do not introduce a second agent runtime, a hosted-only agent cloud, or a fork of an external agent SDK. |
| **C19** | **"Box" means ascii.dev Box** (`https://ascii.dev/api/box/v1`, `@asciidev/box-sdk`), never Box.com. The `developer.box.com/llms.txt` link in the product brief is a naming collision; Box.com is at most a Composio connector in the catalog. Any PR that imports a Box.com SDK as a sandbox is a constraint violation. |
| **C20** | **Every plugin registers an inverse.** Every sandbox, socket, watcher, timer, meter reservation, hosted port, or file lock is acquired inside `ctx.effect(setup → dispose)`. Leak tests (1 000 fork/dispose cycles, zero live handles) fail the build. |
| **C21** | **Machine starts are the scarce resource, not dollars.** Box counts create, fork, *and resume* against plan ceilings (e.g. 150/day on the $20 plan; platform ceiling 1 500/day). The runtime uses one `stop_after` sweeper (airv2 §5.4), idle timeouts of 15–30 min not 2, and treats `429 start_limit_reached` as a first-class queued state. No per-sandbox timers. |
| **C22** | **Named snapshots are capped at 10 per Box account.** Templates are layered: three weight base snapshots (`zap-light`, `zap-med`, `zap-heavy`) plus named snapshots only for default-on, non-RC heavy harnesses; every other harness bakes as an overlay at create-from-snapshot time (`POST /boxes {from, setupScript ≤ 64 KB}`) or through `/commands` after `ready` — never "at fork" (the fork route has no `setupScript`). Prod snapshots are rebuilt in place under the same name; there is no second channel of snapshots. A template whose bake needs more than 10 named snapshots is a design bug. |
| **C23** | **Channels belong to the control plane; a runtime only knows how to run a turn.** Every harness template enables exactly one inbound surface (its API server on loopback/hosted-private) and explicitly disables every other adapter (Hermes: only `api_server`, generalizing airv2 C12). Zap's existing Slack/Telegram/iMessage channels stay in the Next.js control plane. |
| **C24** | **Secret-bearing URLs never reach a browser or a log.** Box hosted-URL `_token`, `desktopUrl`, Namespace bridge tokens, harness API keys, `API_SERVER_KEY`: server-side only, redacted by the log scrubber (port `airv2 lib/vault/scrub.ts` patterns into `packages/runtime/src/redact.ts`). |
| **C25** | **Meter after settle, never before.** A live unit is ledgered only after the payer returns success (x402 `settle.success === true`, MPP `withReceipt`, BYOK local ledger). Reservation is atomic (existing Upstash Lua pattern); replays of a payment nonce / challenge id never mint twice. **Plan-only semantics are precise:** without a payer, any prompt or command that would spend returns `PAYER_MISSING`; with a payer but without `--live`, the harness may think (LLM tokens are metered against the payer) while every side-effecting tool — lane execution, media submits, paid API calls, browser purchases, on-chain actions — is **quoted, not executed**; `--live` unlocks execution. |
| **C26** | **Idempotency keys everywhere a provider is charged.** Box create/fork are deduplicated by an Upstash `SET NX` on `zap:idem:box:<key>` (authoritative) and additionally send `Idempotency-Key` (best-effort, verify item 14); provider submits reuse the 0.3.1 `idemKey`; settle paths are keyed by EIP-3009 nonce / MPP challenge `id` with Upstash `SET NX zap:gate:nonce:<id>` as the single atomic replay check. Three replays, one effect — tested in the same PR. |
| **C27** | **Strict TypeScript, no `any`, in every TypeScript package** (`core, providers, agent, kernel, sandbox, memory, agent-code, runtime, templates, cloud`). Public types are the product; `tsgo --noEmit` gates CI. The two JavaScript packages (`cli`, `mcp`) carry `// @ts-check` + JSDoc types and import only typed packages. |
| **C28** | **Agent-first I/O.** Every CLI command and MCP tool returns machine-readable JSON with `--json`; humans get text. Errors are structured (`ZapRunError` shape from `lib/zap-errors.ts`: code, message, remediation, alternatives, retryable). |
| **C29** | **Eve stays pinned at `0.22.4`.** The Eve bridge (`packages/sandbox-adapters`, §5.3.6) is the only package that imports `eve/sandbox` types; `packages/sandbox` never does. An Eve bump is a separate, later spec. |
| **C30** | **Provider facts are pinned and verified at bake time.** Every template records the resolved refs it installed (`~/.zap/template.json`: harness ref/sha, package versions, `isolation`, ports) and `zap harness doctor` compares them; floating `main` is never baked. |

---

## 2. Non-goals for v5

- A new web Studio rewrite. The existing Next.js Studio stays; it gains a runtime panel, nothing more.
- Replacing Eve, Convex, or Upstash in this milestone. Eve stays at `0.22.4` (C29); Convex remains system of record for runs; Upstash remains idempotency/queue/meter.
- Implementing every catalog API as a first-party plugin (C10).
- Training foundation models or owning GPU capacity. Modal/Runpod are pass-through plugins.
- A custom chain or token. x402 on Base (USDC, `eip155:8453`) and MPP rails via Thirdweb / `mppx` only.
- Breaking `Zap.md` recipe frontmatter (C1). `Runtime.md` is additive.
- Running the literal **Grok Bot** product inside a VM. Grok Bot is a closed xAI consumer product (desktop/iOS, SuperGrok/Cursor plans) with no CLI, API, or self-host surface. `zap-heavy-grok` is an **xAI-routed** harness (xAI gateway route + Grok-compatible skills/AGENTS layout + a pluggable executor). Escalate if the product wants more (§14).
- Running arbitrary binaries (ffmpeg) inside core Hyperlight. Hyperlight runs typed guest functions and WASM components; ffmpeg-class binaries run in Microsandbox microVMs or a systemd-confined process (§4.6). `hyperlight-nanvix` static-binary support is tracked as a verify-first item (§3), not assumed.
- Hosting a multi-tenant Hermes (or any harness) process. One tenant = one runtime = one filesystem (airv2 I1).
- A second agent runtime, a hosted-only agent cloud, or a fork of an external agent SDK (C18). The agents-as-code layer is the first-party Zap harness (`harness.zap`); its render loop runs on the Zap kernel inside the tenant's runtime VM and its tools run on Box. Agent code never executes on the shared control plane.
- Naming or analogizing to other agent platforms anywhere a user can read (C3). Describe the model as Zap.
- Migrating the existing Supabase secret vault, wallet proof, or Sprite deployment flow. They are reused as-is.
- Publisher/marketplace features (paid runtime templates sold by third parties). Templates are first-party in v5; a store is a later spec.

---

## 3. Accounts, credentials, and verifications to obtain first

Missing credentials block milestones, not tasks — surface gaps the day they are found.

| Service | Needed for | Notes |
|---|---|---|
| **ascii.dev Box** — paid plan, not trial | Z2 (blocking), Z10 | Trial = 2 concurrent boxes, 5 starts/min, 25/h, 75/day, ≤ 2 h auto-stop, 25 h total. Template building alone burns that. Get the $20/mo plan minimum (100 concurrent; 10/50/150 starts) before Z2 day 2; $100/mo (20/100/300) before Z10. API key `box_…` as `BOX_API_KEY`; keep it in Vercel/CI secrets and the Supabase managed-secret bridge, never in a box (C6). Account must be a **team/org** if more than 10 named snapshots are ever needed (C22). |
| **Namespace** | Z4 | Workspace token `NSC_TOKEN` (`NAMESPACE_TOKEN`), region (`us`/`eu`), Linux amd64 with nested virt, macOS Apple-silicon quota (early access). |
| **Hetzner (or alt) KVM VPS** | Z4 self-host zap-VM | One `/dev/kvm`-capable host for the Microsandbox/Hyperlight lanes; SSH key; a DNS name for `zap-agentd`. |
| **Thirdweb project** | Z9 (blocking for managed mode) | `THIRDWEB_SECRET_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (exist), plus a **server wallet** (`THIRDWEB_SERVER_WALLET_ADDRESS`, optional `THIRDWEB_VAULT_ACCESS_TOKEN`) for the x402 facilitator gas payer. Facilitator base `https://api.thirdweb.com/v1/payments/x402` (0.3 % fee). |
| **Coinbase CDP** (alternate facilitator) | Z9 | `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`; `https://api.cdp.coinbase.com/platform/v2/x402`; first 1 000 settlements/month free, then $0.001. Use if the Thirdweb facilitator fails verification item 4 below. |
| **Tempo / Stripe** (MPP rail) | Z9 (optional) | `MPP_SECRET_KEY` (HMAC for challenge ids), `TEMPO_DEPOSIT_ADDRESS`; Stripe `STRIPE_SECRET_KEY` + `STRIPE_PROFILE_ID` only if fiat SPT charges are wanted. Without these, MPP still works on the EVM/Base rail via `mppx`'s `evm.charge` (x402-compatible). |
| **LLM / media keys** | Z6 | Existing `.env.example` set (OpenRouter, OpenAI, Anthropic, AI Gateway, fal, GMI, Prodia, Runware, Vertex, AWS) + `XAI_API_KEY`, `REPLICATE_API_TOKEN`. |
| **Memory** | Z5 | None for OpenViking (local, on the VM). `MEM0_API_KEY`, `ZEP_API_KEY` for the optional plugins. |
| **Connector fabric** | Z8 | `COMPOSIO_API_KEY` (exists), `CONTEXT7_API_KEY`, open-connector self-host secrets (`OOMOL_CONNECT_ENCRYPTION_KEY`, `OOMOL_CONNECT_RUNTIME_TOKEN`). |
| **Cloudflare** | Z7 (Cloudflare Sandbox adapter), Z9 only if §11 promotes the Workers adapter | Account id, API token with Workers + R2 + D1 + Containers; `wrangler` login in CI. The v5 control API ships on the Vercel adapter (§11); the Workers adapter is built and tested but not promoted unless the §11 rule triggers. |
| **Devin** | §13 | `DEVIN_API_KEY` for `POST https://api.devin.ai/v1/sessions`; optional `DEVIN_OUTPOSTS_TOKEN` to run a zap-heavy box as an Outpost worker (opt-in harness). |
| **npm** | Z11 | Trusted publishing or `NPM_TOKEN` with bypass-2FA for `@wzrdtech/{zap,core,providers,zap-mcp,zap-kernel,zap-sandbox,zap-memory,zap-agent,zap-runtime,zap-templates,zap-cloud,agent}` (existing release.yml pattern). |

**Verify before building** — cheap tests that change the design if the answer is wrong. Record each answer in `docs/verify-log.md` with date and evidence.

1. **Box named snapshot + `noEnv`.** `box new --from zap-heavy --no-env --json` produces a box that (a) boots enabled systemd units, (b) has none of the account secrets, (c) re-hosts ports via the baked `*-host.service`. If `from` and `noEnv` cannot combine, templates fork from a stopped template box instead (`POST /boxes/{templateId}/fork {noEnv:true}` — the airv2 path).
2. **Box `setupScript` as harness overlay.** A 30–60 KB overlay installing OpenCode/Pi/fx passed to `POST /boxes {from: "zap-heavy", setupScript}` completes inside the box's `setupStatus` cycle and is visible before `ready`. If `setupScript` is too small or too slow, overlays run through `POST /commands` from the control plane after `ready` (slower, but the same contract). Forks never carry a `setupScript`.
3. **Box `timeoutSeconds` on `/commands`.** OpenAPI says 1–600, the rendered docs say 1–60. Measure. Long ffmpeg/bake steps use `detached: true` + `/events` polling if 600 is not honored.
4. **Thirdweb facilitator with `mppx`.** `mppx`'s `evm.charge({ x402: { facilitator } })` needs the facilitator's auth headers (`x-secret-key`, `x-vault-access-token`). Confirm `facilitator().createAuthHeaders()` can be injected; if not, the x402 leg of the gate uses the CDP facilitator (`@coinbase/x402` `createFacilitatorConfig`) and Thirdweb remains the wallet/identity layer. Either way, confirm arbitrary per-request `payTo` (tenant payouts, C8) and x402 **v2** headers (`PAYMENT-SIGNATURE`) are accepted; `settlePayment` reads both v1 `X-PAYMENT` and v2.
5. **Namespace `SuspendInstance` / `WakeInstance` / `IssueIngressAccessToken`.** Pre-filled: `@namespacelabs/sdk@1.0.0` ships `SuspendInstance` and `WakeInstance` on `ComputeService`; `IssueIngressAccessToken` lives on the IAM service `nsl.tenants.TenantsService` at `NAMESPACE_IAM_API` (airv2 `lib/namespace/client.ts`), not on `ComputeService`. Confirm both against `buf.build/namespace/cloud` at bake and record the schema version; if suspend/wake regress, `stop` on Namespace = `DestroyInstance` after a disk snapshot (documented capability gap in `doctor --json`).
6. **Namespace nested virt.** `/dev/kvm` present on a Linux amd64 instance so `msb` can boot microVMs; note arm64 only on Apple-silicon-backed Linux.
7. **`hyperlight-nanvix` static ffmpeg.** Try a static `ffmpeg` under nanvix. Expected answer: no. Then the Hyperlight lane is WASM-only (`hyperlight-wasm` + `ffmpeg.wasm` for small jobs) and ffmpeg runs in Microsandbox. Document in `docs/providers/hyperlight.md`.
8. **DeepSeek Harness presets and headless entry.** The brief names `standard, code, minimal, creator`; `@deepseek-ai/dsh@0.1.1-rc.2` ships `code, cordis, minimal, standard` (no `creator`) and is a release candidate. Confirm the preset list and the exact **headless** invocation (non-web run entry, exit codes, JSON output) at the pinned version; record the invocation in the manifest (C30) and only `standard|code|minimal` in the manifest's preset list — the fourth preset's name is on the C3 deny-list and stays out of every public surface and `--json` fixture. While dsh is an RC, `zap-heavy-deepseek` ships as an overlay, not a named snapshot (§4.8).
9. **`@asciidev/eve-box` snapshot/fork.** Pre-filled: `@asciidev/eve-box@0.1.6` exposes only create/get/update/stop/resume/command/files — no fork, no snapshot. Therefore the Box adapter is built on `@asciidev/box-sdk` directly and the Eve bridge wraps the adapter (§5.3.6); `@asciidev/eve-box` stays only as the unchanged 0.3.1 fallback behind `ZAP_SANDBOX_BACKEND=box-legacy`. Re-confirm at the pinned SDK version.
10. **Hermes ref pin.** airv2 pins `HERMES_REF=7339f5f…` (v2026.8.16.2). Re-verify the API-server contract (`POST /v1/runs`, SSE `/v1/runs/{id}/events`, `API_SERVER_KEY`) at whatever ref v5 pins.
11. **Grok.** Confirm there is still no Grok Bot API/CLI. Ship `zap-heavy-grok` as xAI-routed (§2). Record the answer.
12. **Codex device auth.** `codex login --device-auth` must be enabled in the ChatGPT workspace; otherwise BYOK OpenAI auth on headless boxes is `OPENAI_API_KEY` only. Claude Code headless = `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`.
13. **Box deletion and webhooks.** The docs describe an async "permanently delete Box data" operation and `box.ready|box.error|box.archived` webhooks with `X-Ascii-Signature`, but `@asciidev/box-sdk@0.0.28` exposes neither (`stopAndRemove` states deletion is deliberately not an API operation). Confirm both. Until confirmed: `SandboxHandle.remove()` is optional, tenant deletion = `stop` + delete the tenant's named snapshots + a recorded manual delete, and the runtime state machine polls `GET /boxes/{id}` (5 s, 240 s budget) instead of relying on webhooks.
14. **Box `Idempotency-Key` and 429 codes.** The docs mention `Idempotency-Key` on create/fork (24 h) but the SDK does not send it; the docs list both `rate_limited` (plan per-minute) and `start_limit_reached` (platform ceilings). Confirm the header is honored; either way the Upstash `SET NX` dedup (C26) is authoritative and both 429 codes map to `SandboxStartLimit` with their own `retryAfter`.
15. **Box hosted routes.** The hosting docs describe `box host <port> --private` and a `POST /boxes/{id}/host` route, but the SDK has no such route and airv2 (which wins, C11) re-runs the in-VM `host url <port> --private` after every resume because the access token **rotates on stop/resume**. Confirm the API route; regardless, the adapter implements `host()` through `exec` of the in-VM `host` CLI and re-reads the URL/token after every `resume` before contacting the runtime (§4.5).
16. **Thirdweb managed signer.** Confirm that a thirdweb in-app/ecosystem wallet can grant a **session key** (scoped spend cap + expiry) usable by the CLI/agent through `wrapFetchWithPayment` without Zap ever holding the user's key (§5.7 managed signer). If session keys are unavailable for the chosen wallet type, the managed CLI path uses a user-supplied `ZAP_WALLET_PRIVATE_KEY` (BYO signer) and the Studio path uses the connected browser wallet; escalate before inventing a custodial workaround (C8).

## 4. The runtime model (read this twice)

### 4.1 Thesis

The kernel is a tiny host. Everything else is a plugin: sandbox, memory, gateway, harness, payer, channel, skill, meter. Plugins load and unload without leaking handles. A runtime profile (`light | med | heavy`) is a **declared plugin set**, not a fork of the codebase. A template is a **materialized runtime** (a Box named snapshot / Namespace image / self-host bundle) whose bake script is derived from the same plugin set. A *run* is a **fork** of a runtime context: it inherits the services, owns its own effects, and `dispose()` is the only teardown.

**Where things run — two kernel instances, one kernel package.** The same `@wzrdtech/zap-kernel` + `createRuntime` boots in two places, with different plugin sets (§4.7 shows both columns):

- The **caller kernel** runs in the caller's process — the `zap` CLI, the control API (`packages/cloud`), or the Eve agent. It composes runtimes, talks to providers (Box, Namespace, facilitators), holds the payer, and drives the VM over the sandbox contract (`sandbox.box`, `sandbox.namespace`, …). Harness services, `memory.openviking`, `ovctl`, and bake/doctor scripts are caller-side drivers that `exec` into the VM; the harness processes and OpenViking server themselves are in-VM systemd units.
- The **in-VM kernel** runs inside `zap-agentd serve` (from `@wzrdtech/zap-runtime`), the one process in the VM that also serves the contract endpoints, the lane executor and the capability probe. Its plugin set is `sandbox.local` (the §5.3 adapter for "this machine": `exec` through the `lanes` service, `fs` rooted at `/zap/fs`), `lanes.core` (the executor), `fs.core`, `tools.core`, `sessions.core`, `meter.reporter`, `pay.delegated`, `doctor`; at med+ `gateway.core` + routes (keys from `ctx.secrets.gatewayKey`, never `process.env`), `harness.zap` (the executor + `POST /v1/runs`), `agents.host` (`--serve-agents`), `secrets.env | secrets.control-plane`, `connections.core`, `mediafs.core`, `ffmpeg.presets`; on heavy `memory.openviking` + `skills.store` + `apistore.*`. The `zap` CLI is also installed in the VM so an agent inside can compose/quote/dry-run through the caller kernel.

**No model loop ever runs outside the VM.** `harness.zap` (E) is two things in one file (`packages/runtime/src/harness/zap.ts`): the **executor** (`ZapExecutor.executeStep`, §5.6 — a library over `ctx.llm` + a `SandboxHandle`, unit-tested in-process with fakes at Z6) and the **driver** (a `HarnessService` whose `run()` calls the VM's `POST /v1/runs`, `http-runs` adapter). The in-VM kernel mounts the executor and serves `/v1/runs` (E's route module `packages/runtime/src/agentd/runs.ts`) so `zap runtime exec --prompt` at med runs the loop **inside the VM**; the caller kernel (CLI, `packages/cloud`, Eve) mounts only the driver, and the control plane proxies `/v1/runtimes/{id}/exec` to `/v1/runs` exactly as it proxies third-party `http-runs` harnesses — it never holds a model turn (§4.2, C18). **Deployed agent bundles (§4.12) always execute inside the tenant's runtime VM under `zap-agentd serve --serve-agents`** — the render on the in-VM kernel, tool `run()` on the same VM, CPU work through `sandbox.exec` into lanes — never on the shared control plane. The CLI (`zap session`, `zap deploy`) and the control API are clients of that host: self-host talks to it over the Box `/commands` API or the token-gated hosted route, managed talks through `packages/cloud` `/v1/sessions`, which proxies to the tenant's VM and mirrors metadata only.

Two facts from airv2 carry over unchanged: **the agent's memory wants to be a filesystem and the product's routing wants to be a database, and these are not the same system** (ARCHITECTURE.md §0); and **the control plane stores routing and entitlements, never agent content** (airv2 I2/C4). In Zap v5 the VM filesystem (`/zap/*`, `~/.zap/*`, `~/.hermes/*`) is the source of truth for everything the agent knows; Convex/Supabase/Upstash hold run rows, meter rows, receipts, tenant routing, and encrypted credentials.

### 4.2 The four planes

| Plane | Owns | Forbidden from |
|---|---|---|
| **Channel** | CLI, MCP (stdio/HTTP), Studio, Slack/Telegram/iMessage (existing), Devin/Codex/Claude Code as callers | Knowing which machine runs a tenant. It knows principals and runtime slugs. |
| **Control** | `packages/cloud` (Hono): compose/registry API, the 402 gate, meter ledger, template registry, sweeper. Deployed to Cloudflare Workers or Vercel (§11). Plus the existing Next.js/Convex/Upstash/Supabase control plane. | Holding agent content, harness state, or provider keys inside a runtime. |
| **Agent** | The runtime VM: Box (default), Namespace instance, self-host microVM host, or a local Docker/fake sandbox for tests. Filesystem = truth. Harness + memory + skills + media FS live here. | Knowing other tenants exist. No platform credentials, no DB connection strings, no list of other runtimes (`noEnv`, per-box env only). |
| **Capability** | Gateways (LLM/media), GPU plugins (Modal/Runpod), Composio/open-connector/Context7, browser (Chrome-in-VM, Browserbase/Steel optional), Thirdweb wallet + facilitator, memory SaaS (Mem0/Zep) | Being reachable without a per-tenant credential or a settled payment. |

Invariants (airv2 I1–I6, restated for Zap): one tenant, one runtime, one filesystem (I1); shared DB holds routing never content (I2); the runtime dials out, nothing dials in except the control plane through a token-gated hosted route (I3); identity **and payer** are resolved before compute starts — never spend a machine start on an unverified or unpaid request (I4, extended); every ingested byte is untrusted (I5); any tenant is extractable with one query + one snapshot pull (I6).

### 4.3 Kernel semantics (prior-art mapping — internal to this file; never reproduced in docs)

Cordis's contribution is *spatiotemporal composability*: the **temporal** axis asks "when the plugin leaves, what remains?" (answer: nothing — effects are reversible); the **spatial** axis asks "who does the plugin depend on now?" (answer: declared services resolved by the context, so topology can change at runtime). Zap's kernel adopts these mechanisms and keeps the vocabulary where DeepSeek Harness uses it (C3).

**Decision — do we use Cordis?** No, not as a dependency. `@wzrdtech/zap-kernel` is Zap's own implementation of these semantics (about 1.5–2 k lines: context, fiber, effect, service, events, loader). Reasons: the upstream API is documented as unstable and may change without notice; the kernel is the product's public type surface and must satisfy C27 (strict, no `any`) and the leak tests on code we own; and keeping public docs free of platform names (C3) is trivial when there is nothing to name. **One narrow exception, decided by session A only:** if implementing loader reconciliation + HMR costs more than two working days, A may vendor the upstream core under `packages/kernel/src/internal/` as an unexported implementation detail behind Zap's own `Context` types — with the coordinator's approval recorded in `docs/verify-log.md`, no re-export of upstream types, no mention in any public surface (the `tests/no-platform-names.test.ts` grep still applies), and the leak/reconcile suites unchanged. Either way, nothing a user reads names it.

| Cordis | Zap v5 kernel (`@wzrdtech/zap-kernel`) |
|---|---|
| `ctx.effect(setup)` → disposer, run LIFO on unload | Same. Every sandbox, socket, watcher, timer, meter reservation, hosted port, and file lock registers an inverse (C20). Disposers are "witnessed" at acquisition time; the author supplies both directions. |
| Services + `inject[]`; plugin waits PENDING until satisfied | Named services: `sandbox`, `fs`, `memory?`, `gateway?`, `pay?`, `meter`, `tools`, `sessions`, `llm?`, `skills?`, `harness?`, `doctor`. Load order is expressed by requirements, never by boot sequencing. |
| Fiber lifecycle `PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED | FAILED` | Same states, exported as `FiberState`. FAILED recovers already-collected effects. Provider identity change → consumer UNLOADING with its *committed view*, then LOADING with the new provider (no in-place mutation). |
| Guarded withdrawal order | Provider stops accepting resolutions → consumers deactivate against committed view → consumers finish cleanup → provider recovers → replacement activates. |
| `fork` / `dispose` / `ready` | `Runtime.fork({ purpose })` for a run or a child agent; child effects never leak to the parent; `dispose()` is idempotent and the only teardown; `ready` fires when all `inject`ed services of the root are ACTIVE. |
| Path independence / loader reconciliation | The final plugin set, keyed by stable entry id, determines the runtime. `compose()` reconciles a desired tree against the running fiber tree: mount/update/unmount only the delta. Order of `plugins[]` never changes the result. |
| Isolation realm / interception | `ctx.isolate(['sandbox'])` gives a subtree its own resolution of a key (e.g. a child run on a different provider). `ctx.intercept('sandbox', wrapper)` adds metering/audit without changing satisfaction. Neither is a security boundary — the VM is (§4.6). |
| Events: `emit / parallel / serial / waterfall` | Same four dispatch modes. `waterfall` is the policy chain (`(...args, next)`; return without `next()` to short-circuit) used by the payer gate and budget guard. |
| Everything is a plugin | Sandboxes, memory, gateways, harnesses, pay, channels, skills, meter, doctor — no core special cases. `definePlugin()` and `class extends Service` are the only two shapes. |

Non-transferable Cordis limitations, stated so nobody designs around them: emissions across the system boundary (a provider charge, a sent message, an on-chain settle) cannot be made historically nonexistent — they require **withholding** (plan-only default, C5) or **compensation** (refund path, out of scope); disposers can be wrong (tests prove them, §10); HMR/reconcile does not migrate private state (durable state lives in a longer-lived service: the filesystem, Convex, Upstash).

### 4.4 Services on `ctx`

| Key | Type (package) | Provided by | Required at weight |
|---|---|---|---|
| `sandbox` | `SandboxService` (`@wzrdtech/zap-sandbox`) | `sandbox.core` (registry + `acquire` dispatch; kernel-adjacent). Adapter plugins (`sandbox.box` default, `sandbox.namespace`, …, `sandbox.local` in the in-VM kernel) `inject: ["sandbox","meter"]` (`sandbox.local` also `"lanes"`), call `ctx.sandbox.register(provider)`, and are never themselves the provider of the `sandbox` key | light+ |
| `lanes` | `LaneExecutor` (`@wzrdtech/zap-sandbox` contract type; §4.6) — `run({ lane, argv, cwd, env, timeoutMs, signal })` with the allowlist, `systemd-run` / `msb` / wasm / GPU dispatch and the isolation record | `lanes.core` (`packages/runtime/src/lanes`): in the in-VM kernel it executes; in the caller kernel it dispatches to the VM's `/v1/lane` over the sandbox handle | light+ |
| `fs` | `RuntimeFs` — typed view of `/zap/fs`, `/zap/media`, `/zap/skills`, `~/.zap` inside the sandbox | `fs.core` (kernel-adjacent, needs `sandbox`) | light+ |
| `meter` | `MeterService` — units, quotes, reserve/settle, ledger emit | `meter.core` in the caller kernel and the control plane (Upstash Lua reserve/settle, Convex ledger). **In the in-VM kernel `meter.reporter`**: `quote()` pure over the shipped `pricing.json`, `emit(lines)` attaches usage to the outgoing event stream (`run.completed.usage`, `turn.completed.usage`, `tool.result.usage` — §5.6/§5.12); `reserve/settle/settleIdle/ledger` throw `METER_OFF_VM` — a VM never reaches Upstash or Convex (§4.2). **Who reserves and settles:** BYOK/self-host — the caller-side `harness.zap` driver and `agents.client` call `meter.reserve(await meter.quote(estimate))` before `POST /v1/runs` / `/turns` and `meter.settle(usage)` from the `run.completed` / `turn.completed` payload against the local `.zap/ledger.jsonl`. Managed — the caller's `meter` is a pass-through client (`quote` via `POST /v1/pay/quote`, no reserve/settle; the CLI holds no Upstash/Convex credentials), and **only the control plane** reserves (after the gate's receipt, §4.10) and settles around its proxy; the `gateway_*` lines its gateway proxy meters are authoritative while VM-reported token lines are informational (never double-counted: the settle merges by `sku` and keeps the proxy's figure) | light+ (BYOK ledger is local) |
| `tools` | `ToolRegistry` — `register(defineTool(...))`, dsh-compatible | `tools.core` (both kernels) | light+ |
| `sessions` | `SessionService` — run records, event log, resume | `sessions.core` (both kernels; in-VM it is the store under `/zap/sessions` that `agents.host` uses) | light+ |
| `doctor` | `DoctorService` — every plugin contributes `{ id, ok, capabilities, missing, verified }` | kernel | light+ |
| `gateway` | `GatewayService` — `llm(route, opts)`, `media(provider, opts)`, deterministic router, plan-only quoting | `gateway.core` + route plugins (in-VM: keys via `ctx.secrets.gatewayKey(route)`, §5.12; managed: the control-plane proxy) | med+ |
| `mediafs` | `MediaFs` — content-addressed store + sidecar JSON | `mediafs.core` | med+ |
| `llm` | dsh-compatible alias of `gateway.llm` (`ctx.llm.complete/stream`) | `gateway.core` | med+ |
| `memory` | `MemoryService` (`@wzrdtech/zap-memory`) | `memory.openviking` (default) / `memory.mem0` / `memory.zep` | heavy (optional on light/med) |
| `skills` | `SkillStore` — `/zap/skills` + harness skill dirs, SKILL.md contract | `skills.store` | heavy (optional on med) |
| `executor` | `ZapExecutor` (§5.6) — `executeStep(ctx, caps, opts)`: one model call plus its tool calls, plan-only aware | `harness.zap` in the **in-VM** kernel (E's executor library; the §4.12 turn loop and `POST /v1/runs` are built on it) | med+ (in-VM) |
| `harness` | `HarnessService` — `bake/boot/run/health` for the harness `zap runtime exec --prompt` talks to | **caller kernel:** `harness.zap` (med, or heavy without a named harness: a driver whose `run()` calls the VM's `POST /v1/runs` — no model loop in the caller, §4.1) or `harness.<name>` (heavy with a third-party harness: its driver). Exactly one provider of `harness` per kernel; `harness.zap` steps aside when a named harness is mounted, and `zap session` still reaches agent-code through `agents` | med+ |
| `agents` | `AgentHost` (`@wzrdtech/zap-runtime/agentd/agents`) — loads deployment bundles, resolves `agent-id@alias`, runs renders on the kernel, owns sessions/turns | `agents.host` (in-VM, inside `zap-agentd serve --serve-agents`); the caller kernel gets a thin client of the same interface (`agents.client`, K) over `/v1/sessions` | med+ |
| `secrets` | `SecretResolver` — resolves a `SecretRef` for a declared connection or MCP server after scope checks, and `gatewayKey(route)` for `gateway.core`; write-only | `secrets.env` (self-host) / `secrets.control-plane` (managed) — in-VM only | med+ (in-VM) |
| `pay` | `PayService` — `status()`, `quote()`, `authorize()`, `settle()` | caller kernel and control plane: `pay.byok` / `pay.x402` (managed) — exactly one, selected by `ZAP_PAYER_MODE`. **In-VM kernel: `pay.delegated`** — `status()` returns the payer mode the caller pinned on this run/turn (`POST /v1/runs` and `POST /v1/sessions/{id}/turns` carry `{ live, payer }` under `RUNTIME_TOKEN`); it is consulted **before every model call**: a missing or `"missing"` payer fails the run/turn with `PAYER_MISSING` in plan-only mode too, because thinking tokens are spend (C5/C25); `live` additionally gates side-effecting tools; `quote()` is pure; `authorize()`/`settle()` throw `PAY_OFF_VM` — reservation and settlement happen on the caller side (§4.4 `meter`) | light+ (`status()` is consulted by every spend path) |

### 4.5 Box lifecycle (airv2 wins — C11)

```
  provisioning ──fork/create completes──▶ ready ──run starts──▶ running
       │                                    ▲                     │
       │                                    │              run completes
       │                                    │                     ▼
       │                                    └──── resume ───── idle ──stop_after──▶ archiving ──▶ archived (stopped, free)
       └── fork fails ──▶ error
```

Rules, all enforced in `packages/sandbox/src/adapters/box/`:

- Every runtime box is created with **`noEnv: true`** and a per-box `env` drawn **only** from the single per-runtime list in §7 (`TENANT_ID`, `RUNTIME_ID`, `RUNTIME_TOKEN` — per-box random, gates the in-VM `zap-agentd` — plus the harness's own per-box key and, in BYOK mode with `keysInRuntime: true`, the tenant's provider keys). In managed mode a model-provider key in per-box env is a C6 violation; `box.test.ts` asserts the env keys against §7.
- **Templates are named snapshots** (`POST /boxes {from: "zap-heavy-hermes", noEnv: true}` or fork of a stopped template box). Forks are seconds and roughly constant cost regardless of template size.
- **Snapshots capture the filesystem every minute and on stop; they do not capture processes, memory, open ports, or hosted URLs.** Therefore: every long-lived process is a systemd unit (`/etc` is snapshotted; enabled units restart on resume); every hosted port is re-registered by a `*-host.service` oneshot (`After=` the app unit; retry loop for the transient `agent_revoked` 401 after fork/resume). Baked into the template — never done from the control plane per cold start.
- `host <port> --private` (the in-VM CLI, run through `exec`) gives `https://<sub>-<port>.on.ascii.dev?_token=…`; the URL is sticky but the **access token rotates on stop/resume** (airv2 `orchestrator/boxes.ts`), so after every `resume` the adapter re-runs `host url <port> --private`, parses the fresh URL/token from stdout, and persists it **before** contacting the runtime; ≤ 50 hosted ports per box; the app must bind `0.0.0.0`. The `_token` and any `API_SERVER_KEY` are server-side only (C24). The control-plane client sends `Cookie: _port_auth=<token>` (the `?_token` redirect cannot be followed by server-side fetch — airv2 `lib/hermes/client.ts`). The `*-host.service` oneshot re-hosts at boot so the route exists immediately; the adapter's post-resume re-read is what learns the new token (verify item 15).
- **`stop_after` is set on every run completion and cleared on every run start.** One sweeper (`packages/cloud/src/sweep.ts`, cron every 2 min) stops boxes whose `stop_after < now()`; it never `force`s (C11). Idle default 20 min (`ZAP_IDLE_STOP_MINUTES`), never < 15 in production (C21).
- **Never `stop {force:true}`.** A refused stop means the final snapshot is failing; Box keeps the machine running and does not bill for it.
- `ttlSeconds` on fork/resume is a **backstop** (`ZAP_BOX_TTL_SECONDS=86400`), not the idle mechanism — it counts from start, not last activity.
- `429 start_limit_reached` (platform ceiling) and `429 rate_limited` (plan per-minute) both → `SandboxStartLimit` with their own `retryAfterSeconds`: the run is queued, the caller gets `{status:"queued", retryAfter}`, and a metric `zap_starts_per_hour` increments. Instrument starts from day one; it is the number that tells you when the architecture must change (~150 tenants on aggressive stop/resume).
- Idempotency: Upstash `SET NX zap:idem:box:<runId>` before create/fork (authoritative) + `Idempotency-Key: <runId>` header (best-effort, verify item 14) (C26).
- Warm the template before publishing: resume → boot units once → stop. Box learns the file-read order; forks inherit it.
- Deletion: until verify item 13 confirms an API delete, tenant deletion = `stop` + delete the tenant's named snapshots + a recorded manual delete; the I6 extraction path (`zap memory export`, `zap fs get`, snapshot pull) never depends on delete.

### 4.6 Isolation ladder (what "microVM optimized for CPU clouds" means, honestly)

Isolation is a property of the **host**, discovered at bake time and recorded in `~/.zap/capabilities.json` (`isolation`, `kvm`, `lanes[]`, `gpu`, `desktop`), then reported by `doctor --json`. The runtime never guesses.

| Host | Isolation boundary for the runtime | Isolation for a *lane* run inside the runtime | Notes |
|---|---|---|---|
| **ascii.dev Box** (default) | The Box VM itself (dedicated VM, `--no-env`) | `systemd-run --user` sandbox (`NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ReadWritePaths=/zap`) — the airv2 `zap-exec-loop` fallback — or Docker-in-VM (`docker run --rm` with a per-lane image) | Box has no nested KVM (undocumented, treat as absent). Docker, Chrome, FFmpeg, Node/Bun, Python, Rust, Codex CLI, Claude CLI are preinstalled. `capabilities.json.isolation = "process"` or `"docker"`. |
| **Namespace Linux amd64** | The instance (KVM-backed) | **Microsandbox** (`msb`, libkrun) microVM per lane run — `isolation = "microvm"`; optional `hyperlight-wasm` for WASM function lanes — `isolation = "hyperlight-wasm"` | `/dev/kvm` available. Also hosts Firecracker/QEMU if a future lane needs it. |
| **Self-host zap-VM** (Hetzner or any KVM VPS, `infra/self-host/`) | The VPS | Same as Namespace Linux: Microsandbox microVMs + Hyperlight-wasm lanes; `zap-agentd` exposes the sandbox contract over HTTPS + `RUNTIME_TOKEN` | This is "the Hyperlight-optimized microVM inside a Hetzner VPS" from the brief, stated precisely: **Hyperlight isolates WASM/guest-function lanes; Microsandbox isolates full-binary lanes (ffmpeg, Python, Node); the VPS isolates the tenant.** |
| **Namespace macOS** | The Mac (native, no container) | Process sandbox (`sandbox-exec` profile) via the template bridge (airv2 `template-macos/bridge.py` pattern, LaunchAgents) | No nested virt. Exec/files travel over the bridge, not an exec RPC. |
| **Omarchy** | A Box with the `env-omarchy` overlay (Arch userland + Hyprland headless desktop, airv2 `template-omarchy`) | As Box | An environment profile, not a provider (`ComputeEnvironment = ubuntu \| omarchy \| macos`). |
| **E2B / Daytona / Cloudflare / Modal / Runpod / Microsandbox-cloud** | The provider's sandbox | Provider process | Report exactly what the adapter supports; never forward guessed vendor fields (0.3.1 `resources.ts` rule). |
| **Docker (local) / fake (tests)** | Container / none | none | Dev and CI only. |

The **lane executor** (`packages/runtime/src/lanes/`, ported from airv2 `zap-exec-loop` and rewritten in TypeScript as `zap-agentd lane run`) accepts `{ id, lane: "ffmpeg" | "codegen" | "media-workflows" | "browser" | "wasm" | \`gpu:${string}\`, cmd[], cwd, timeoutMs, env allowlist }`, enforces the lane's binary allowlist (`ffmpeg|ffprobe|magick|vips|python3|node|bun|bash|chromium`; `wasm` lanes take a component path), picks the strongest isolation the host offers, streams stdout/stderr to `/zap/runs/<id>.log`, and writes `/zap/runs/done/<id>.json` with `{exit, isolation, cpuSeconds, bytesIn, bytesOut}` for the meter. Isolation kinds are a property of the lane executor, not sandbox providers: `hyperlight-wasm` is the isolation used for `wasm` lanes on KVM hosts (there is no `hyperlight` sandbox provider — it cannot run the conformance suite's shell fixture); `gpu:<class>` lanes are dispatched to the GPU plugin (`modal` first-party; `runpod` catalog stub) and never to the CPU sandbox. Plan-only mode (`--dry-run`) validates, quotes, and writes the plan without executing.

### 4.7 Profiles (weights)

| | **zap-light** (zap-VM) | **zap-med** (gateway + media FS) | **zap-heavy** (agent-runtime) |
|---|---|---|---|
| Line | CPU microVM: ffmpeg, code exec, files, browser-use, APIs, writes | Light + LLM/gen-media gateway, ffmpeg presets, image/audio/video/3D store | Med + memory, API/skills stores, and a named harness |
| Bake | Ubuntu (Box base) + Node 24 + Python 3.12 + Bun + Rust toolchain; ffmpeg (full), ffprobe, ImageMagick, libvips, jq, ripgrep, git, gh, curl, wasmtime; Docker-in-VM (Box) or Microsandbox + Hyperlight (KVM hosts); Chrome + Playwright (`box-browser-use` wrapper pattern); file store `/zap/fs` (survives snapshot); `zap` CLI + `zap-mcp` + `zap-agentd` (lane executor, contract daemon); `~/.zap/capabilities.json`; systemd `zap-agentd.service`, `zap-host.service` | Everything in light; gateway routes: OpenRouter (default LLM), Vercel AI Gateway, OpenAI, Anthropic, xAI, GMI; media: fal, Prodia, Runware, Replicate, GMI/Seedance; media FS `/zap/media/{image,audio,video,3d}` content-addressed + sidecar JSON; ffmpeg presets; optional `/zap/skills`; plan-only default, `--live` needs a payer | Everything in med; OpenViking server loopback `:1933` (`~/.zap/memory/openviking`, `ovctl`), optional Mem0/Zep plugins; API store: Context7 MCP + open-connector (`:3000`, loopback) + Composio entity; skills store `/zap/skills` with SKILL.md contract; the named harness + its systemd units + `*-host.service`; `verify-box.sh` health gate |
| Packages on the VM | `@wzrdtech/zap` (CLI), `@wzrdtech/zap-runtime` (`zap-agentd`, lanes, capability probe) and their typed deps (`zap-kernel`, `zap-sandbox`, `core`) | + `@wzrdtech/providers` (media adapters used by the in-VM CLI for quoting) | + `@wzrdtech/zap-memory` (`ovctl`), `@wzrdtech/zap-templates` (doctor manifests), `@wzrdtech/agent` |
| ffmpeg | Presets: `concat, probe, transcode, extract-audio, thumbnail, lut, scale, burn-subtitles`. All dry-runnable (`--dry-run` prints the exact argv + quote). | Light presets + `stitch, overlay, gen-media post` | Inherited |
| Default plugin graph — **caller kernel** (CLI / control API / Eve; §4.1) | `sandbox.core` + `sandbox.<provider>`, `fs.core`, `meter.core`, `pay.byok \| pay.x402`, `tools.core`, `sessions.core`, `lanes.core` (remote dispatch to `/v1/lane`), `doctor` | + `gateway.core` + route plugins (quoting; the caller never runs a model loop), `mediafs.core` (client), `ffmpeg.presets` (dry-run), `harness.zap` **driver** (`run()` → the VM's `POST /v1/runs`), `agents.client` | + `memory.openviking` driver (`ovctl` over `exec`), `skills.store` driver, `apistore.*` drivers, `harness.<name>` driver (bake/boot/health/run of a third-party in-VM harness; replaces `harness.zap` as the `harness` provider), `mcp.stdio` |
| Default plugin graph — **in-VM kernel** (`zap-agentd serve`; §4.1) | `sandbox.local`, `lanes.core` (the executor), `fs.core` (`/zap/fs`), `tools.core`, `sessions.core`, `meter.reporter`, `pay.delegated`, `doctor` | + `gateway.core` + route plugins (keys via `ctx.secrets.gatewayKey`, never `process.env`), `mediafs.core`, `ffmpeg.presets`, `harness.zap` (executor + `/v1/runs`), `agents.host` (`--serve-agents`), `secrets.env \| secrets.control-plane`, `connections.core` | + `memory.openviking` (loopback `:1933`), `skills.store` (`/zap/skills` + auto-packed agent skills), `apistore.*` (in-VM endpoints) |

### 4.8 Template naming and the matrix

`zap-<light|med|heavy>-<harness>` (C9). `<harness>` for light/med is the primary lane or executor. The v5 matrix (ship = built, snapshotted, `doctor`-verified; overlay = bake script applied at fork, no named snapshot — C22):

| Template | Weight | Base | Harness / lane | Ship state | Named snapshot? |
|---|---|---|---|---|---|
| `zap-light` | light | Box base | lanes only (ffmpeg, codegen, browser) | ship | **yes** (base 1/10) |
| `zap-light-ffmpeg` | light | `zap-light` | ffmpeg lane presets, media tools | ship (alias of base + presets on) | no (config) |
| `zap-light-browser` | light | `zap-light` | Chrome + Playwright + `box-browser-use` | ship | no (overlay) |
| `zap-light-code` | light | `zap-light` | codegen lane (Node/Python/Bun/Rust), Docker-in-VM | ship | no (config) |
| `zap-med` | med | `zap-light` | gateway + media FS + presets | ship | **yes** (base 2/10) |
| `zap-med-genmedia` | med | `zap-med` | fal/Runware/Prodia/Replicate/GMI defaults, stitch presets | ship (alias) | no |
| `zap-med-interpreter` | med | `zap-med` | Open Interpreter (`interpreter app-server`) | ship | no (overlay) |
| `zap-med-fx` | med | `zap-med` | fx (`fx ask --json`, `fx acp`) | ship | no (overlay) |
| `zap-heavy` | heavy | `zap-med` | memory + API store + skills store, no harness | ship | **yes** (base 3/10) |
| `zap-heavy-hermes` | heavy | `zap-heavy` | Hermes gateway `:8642` + dashboard `:9119` (airv2 template ported) | ship, default-on | **yes** (4/10) |
| `zap-heavy-openclaw` | heavy | `zap-heavy` | OpenClaw gateway `:18789` (`/v1/chat/completions`) | ship, default-on | **yes** (5/10) |
| `zap-heavy-opencode` | heavy | `zap-heavy` | `opencode serve :4096` + AGENTS.md | ship, default-on | **yes** (6/10) |
| `zap-heavy-deepseek` | heavy | `zap-heavy` | `@deepseek-ai/dsh` headless entry (`cli-exec`; presets `standard\|code\|minimal` — the only presets Zap lists, documents or accepts in `Runtime.md`; dsh's fourth preset is neither named nor selectable, C3); kernel-as-host is a later spec | ship, default-on | no while dsh is an RC (overlay; verify item 8) — slot 7 stays free |
| `zap-heavy-grok` | heavy | `zap-heavy` | xAI-routed: `gateway.llm("xai")` + Grok-compatible skills + OpenCode executor | ship, default-on (see §2) | no (overlay on `zap-heavy-opencode`) |
| `zap-heavy-omg` | heavy | `zap-heavy` | omg.dev control plane `:8766` driving tmux'd CLIs | ship, default-on | no (overlay) |
| `zap-heavy-pi` | heavy | `zap-heavy` | Pi (`pi --mode rpc`) | opt-in | no |
| `zap-heavy-cursor` | heavy | `zap-heavy` | Cursor-shaped: `.cursor/rules`, AGENTS.md, `.cursor/mcp.json`, `agent -p` CLI, OpenCode fallback | opt-in | no |
| `zap-heavy-devin` | heavy | `zap-heavy` | Devin Outposts worker (`devin worker start --outpost`) — a Zap VM as Devin's machine | opt-in | no |
| `zap-heavy-kimi` | heavy | `zap-heavy` | Kimi Code CLI (`kimi web :58627`) | opt-in | no |
| `zap-heavy-agno` | heavy | `zap-heavy` | Agno AgentOS `:7777` | opt-in | no |
| `zap-heavy-prime` | heavy | `zap-heavy` | prime-agent (`--mode rpc`, IPython kernel) | opt-in | no |
| `zap-heavy-headlong` | heavy | `zap-heavy` | headlong daemon + dashboard `:8080` (needs Docker-in-VM ✓) | opt-in | no |
| `zap-heavy-frontier` | heavy | `zap-heavy` | FrontierAgent (`frontier-agent -p --no-tui`) | opt-in | no |
| `env-omarchy` | any | applied over `zap-light` … `zap-heavy-*` | Environment overlay (not a harness): Arch userland + Hyprland headless desktop (airv2 `template-omarchy`); `Runtime.md sandbox.environment: omarchy` | opt-in | no (uses slots 7–10 only if a customer needs it) |
| `env-macos` | any | Namespace macOS | Environment: native Mac + bridge (airv2 `template-macos`); `sandbox.environment: macos` | opt-in, Namespace only | n/a (bootstrap script, no snapshot) |

Named snapshots are **prod-only and rebuilt in place** (same name; `template-build.yml` replaces the snapshot after `verify-template.sh` passes); the `dev` channel forks from the stopped build box, never from a second named snapshot. Overlays run through `POST /boxes {from, setupScript}` (the fork route has no `setupScript`) or through `/commands` after `ready`. Slots 7–10 stay free. Every template directory: `packages/templates/<name>/{template.json, bake.sh, bake.d/NN-<domain>.sh, doctor.sh, units/*.service, skills/*/SKILL.md, AGENTS.md, README.md}` — `bake.sh` sources `bake.d/*` in order so domain sessions contribute fragments (§13) — and a doc page `docs/templates/<name>.md` with the compose snippet.

### 4.9 Memory locality

Memory is content; content lives on the VM (airv2 C4). OpenViking runs **inside** the runtime on `127.0.0.1:1933` with `storage.workspace = ~/.zap/memory/openviking/data` (config at `~/.zap/memory/openviking/ov.conf`, started with `openviking-server --config …`), local AGFS + local vector store + built-in local embeddings (so no memory bytes leave the box unless the tenant opts a VLM route through the gateway). Harnesses reach it as an MCP server (`http://127.0.0.1:1933/mcp`). **Content methods (`remember`, `search`, `read`) are callable only from inside the VM (`zap-agentd`, the in-VM `zap` CLI, the harness) or from the self-host CLI that owns the VM; the managed control API (`packages/cloud`) exposes only `status`, `forget`, and `export --consent`** through the in-VM `ovctl` (`status | add-resource | rm | reindex | export`) over the sandbox `exec` contract, and its logs are canary-tested for memory bytes. `zap memory export` is the I6 extraction path. Mem0/Zep are SaaS plugins: enabling one moves content off-box and requires explicit `consent: true` recorded on the runtime row.

### 4.10 Pay flow

```
zap run [--live]   (or MCP zap_run, or POST /v1/runtimes/{id}/exec)
  → ctx.pay.status()
      "missing"  → ZapRunError PAYER_MISSING for anything that would spend — including a prompt (LLM tokens are spend)
      "byok"     → meter.reserve(local ledger) → run → meter.settle(actual)
                    keys: env → `zap keys` store → device-auth tokens → Supabase vault; ZAP_PAYER_MODE=byok makes status()=byok
                    even with zero keys (ffmpeg-only self-host is free); a route/provider without a key fails at route time
      "managed"  → meter.quote() → 402 gate as Hono middleware on the live endpoint (x402 v2 + MPP advertised together)
                    ← the caller's signer pays: Studio = connected browser wallet; CLI/agent = a thirdweb session key
                      (scoped spend cap = maxValue, expiry; issued by the user's thirdweb in-app/ecosystem wallet at
                      `zap pay login --managed`, stored 0600 in .zap/auth.json) or BYO `ZAP_WALLET_PRIVATE_KEY`
                    → facilitator verify → settle (payTo = ZAP_TREASURY or tenant payTo; Zap never holds a key or funds)
                    → receipt (nonce/challenge id, Upstash SET NX) → THEN reserve → run → settle actual
                    → difference credited/debited on `balances` (§8) and applied to the next quote
  plan-only (no --live) with a payer: the harness may think (tokens metered); every side-effecting tool is quoted, not executed
  --live:              side-effecting tools execute; every unit is reserved before and settled after
```

Inside a **managed** runtime no provider key exists: harnesses point their OpenAI/Anthropic-compatible base URL at the control API's per-runtime gateway (`POST /v1/runtimes/{id}/gateway/llm/v1/chat/completions`, `/v1/messages`, `/gateway/media/*`), authenticated by `RUNTIME_TOKEN` and metered against the run's reservation (airv2 C2 generalized). The managed path meters **sandbox-seconds × size multiplier (idle seconds between runs are billed to the runtime as `sandbox_second` lines with `runId: null`, so the 20-minute idle window is visible, never hidden), gateway tokens, GPU-seconds, API calls, browser-minutes, computer-use minutes, egress bytes**. Prices live in `packages/runtime/src/meter/pricing.json` with env overrides using the 0.3.1 `operatorPricedModels` pattern; the runtime never invents a price (`PRICE_UNKNOWN` is fatal in live mode). MPP is an alternate rail for the same meter, not a second meter. x402 **v1** (`X-PAYMENT`) is not served by the `mppx` gate (it is v2-only); a documented v1 shim that routes `X-PAYMENT` to `thirdweb/x402` `settlePayment` exists behind `ZAP_X402_V1_SHIM=1`, off by default.

### 4.11 Default plugin graph (heavy)

```
                       agents/<id>/agent.ts  ──render──▶  instructions + attached capabilities   (agent-code, §4.12)
                                   │ hooks: useModel · useTool · useMcpServer · useSubagent · useSessionData · useSecret
                                   ▼
kernel (Context root, doctor)   ◀── agents.host (zap-agentd serve, in-VM): sessions · turns · deployments · aliases
 ├─ sandbox.core           registry/acquire   ├─ gateway.core + gateway.{openrouter,ai-gateway,openai,anthropic,xai,gmi}
 ├─ sandbox.box            default adapter    ├─ gateway.media.{fal,prodia,runware,replicate,gmi}
 ├─ sandbox.namespace      optional adapter   ├─ mediafs.core        /zap/media
 ├─ sandbox.selfhost       zap-VM (KVM host)  ├─ ffmpeg.presets
 ├─ fs.core                /zap/fs            ├─ memory.openviking   default (mem0 / zep opt-in, consent)
 ├─ lanes.core             zap-agentd; wasm / gpu:<class> lanes dispatch to hyperlight-wasm / modal   ◀── tools run() → sandbox.exec (the work)
 ├─ meter.core             units + ledger     ├─ skills.store        /zap/skills (+ auto-packed agents/<id>/skills)
 ├─ pay.byok | pay.x402    exactly one         ├─ apistore.{context7,open-connector,composio}
 ├─ tools.core             dsh-compatible     ├─ harness.zap         first-party (render loop)  +  harness.<name>  hermes | openclaw | opencode | …
 ├─ sessions.core                              ├─ secrets.env | secrets.control-plane   write-only SecretRef resolution
 └─ connections.core       allowlisted HTTPS   └─ mcp.stdio (+ mcp.http optional)
```

### 4.12 Agents as code (locked programming model — C13–C18)

Read this before writing any agent. Everything below is Zap's model, described as Zap. If any other section of this file conflicts with it on how an agent is written, this section wins.

**The split.** The agent **function is a render**: it returns the instructions (a string) for the next model step. The **runtime executes**: it runs the model, calls tools, streams events, and continues the session. Rendering is cheap (think); tools are the work (do); CPU work goes through `sandbox.exec`. Target doing:thinking ≥ 10:1. The function is re-rendered before **every** model step, so conditional hooks let an agent attach exactly what the current input needs and nothing else.

**Layout (locked).**

```
agents/<id>/agent.ts                 default export: defineAgent(function Agent() { … })
agents/<id>/tools/*.ts               defineTool(...) — one typed run() each; CPU work via sandbox.exec
agents/<id>/connections.ts           defineConnection(...) / defineMcpServer(...) — allowlisted egress, write-only secrets
agents/<id>/skills/<skill>/SKILL.md  auto-packaged at deploy; tools execute, skills instruct
project.ts                           defineProject({ agents, runtime, aliases })
```

Package `packages/agent-code` → `@wzrdtech/zap-agent`. An agent is addressed as `<id>@<alias>` — `transcode@development`, `transcode@production`. Agents need a model, so they run on **med and heavy** runtimes (`harness.zap`); a light runtime has no agent host.

**The canonical agent** (this file must live at `agents/transcode/agent.ts` in the repo and compile — it is the north-star for session K):

```ts
import { defineAgent, defineTool, useInput, useModel, useTool, useSubagent } from "@wzrdtech/zap-agent";

export const transcode = defineTool({
  name: "ffmpeg_transcode",
  description: "Transcode a file on the Zap CPU sandbox",
  input: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  async run({ input, sandbox, signal, reportProgress }) {
    await reportProgress({ phase: "exec" });
    return sandbox.exec(
      ["ffmpeg", "-i", String(input.path), "-y", "/zap/fs/out.mp4"],
      { signal },
    );
  },
});

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  if (/transcode|ffmpeg/i.test(input.text ?? "")) useTool(transcode);
  if (/research/i.test(input.text ?? "")) useSubagent("researcher");
  return input.text
    ? `Do the work. Plan-only unless --live. Request: ${input.text}`
    : "You are a Zap CPU agent. Plan first.";
});
```

**Companion files** (also committed at Z0 by A, then owned by K; together with the canonical agent they exercise every capability shape — tool, read-only tool, connection, MCP server, subagent, skill):

```ts
// agents/transcode/connections.ts
import { defineConnection, useSecret, bearer } from "@wzrdtech/zap-agent";
export const webhook = defineConnection({ id: "webhook", origin: "https://hooks.example.com", methods: ["POST"], pathPrefix: "/zap/", headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) } });

// agents/researcher/tools/probe.ts
import { defineTool } from "@wzrdtech/zap-agent";
export const probe = defineTool({ name: "ffprobe", description: "Inspect a media file (read-only)", readOnly: true,
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  run: ({ input, sandbox, signal }) => sandbox.exec(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", String(input.path)], { signal }) });

// agents/researcher/tools/notify.ts
import { defineTool } from "@wzrdtech/zap-agent";
export const notify = defineTool({ name: "notify", description: "POST a completion note to the declared webhook",
  input: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false },
  async run({ input, connections, signal }) { const r = await connections.webhook.fetch("/zap/done", { method: "POST", body: JSON.stringify({ note: input.note }), signal }); return { status: r.status }; } });

// agents/researcher/connections.ts
import { defineConnection, defineMcpServer, useSecret, bearer } from "@wzrdtech/zap-agent";
export const webhook = defineConnection({ id: "webhook", origin: "https://hooks.example.com", methods: ["POST"], pathPrefix: "/zap/", headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) } });
export const context7 = defineMcpServer({ id: "context7", url: "https://mcp.context7.com/mcp", headers: { CONTEXT7_API_KEY: useSecret("CONTEXT7_API_KEY") } });

// agents/researcher/agent.ts
import { defineAgent, useInput, useModel, useTool, useMcpServer } from "@wzrdtech/zap-agent";
import { probe } from "./tools/probe";
import { notify } from "./tools/notify";
export default defineAgent(function Researcher() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6", { reasoning: "low" });
  useMcpServer("context7");
  useTool(probe);
  if (input.live) useTool(notify);
  return `Research the request and answer with sources. Read-only unless --live. Request: ${input.text ?? ""}`;
});

// project.ts
import { defineProject } from "@wzrdtech/zap-agent";
export default defineProject({ agents: { transcode: () => import("./agents/transcode/agent"), researcher: () => import("./agents/researcher/agent") } });
```

`agents/researcher/skills/summarize/SKILL.md` (frontmatter `name: summarize`, one paragraph of procedure) rounds out the set. Test-only agents (I/O in render, hard-coded headers, `http://` origins) live under `packages/agent-code/tests/fixtures/agents/` and are never packed.

**Hook rules (locked).**

| Hook | Does | Does not |
|---|---|---|
| `useInput()` | Read `{ source, text?, payload?, live }` for this turn | Fetch, mutate |
| `useModel(id)` | Select the model for this step (`<route>/<model>`, e.g. `openrouter/anthropic/claude-sonnet-4.6`) | Call the model |
| `useTool(tool)` | Expose one typed operation to this step | Run it |
| `useMcpServer(id)` | Attach a remote tool collection declared in `connections.ts` or `Runtime.md` | Proxy by hand |
| `useSubagent(id)` | Offer a child agent (own instructions, tools, kernel fork) as a delegate tool | Inline that work |
| `useSessionData(key)` | Read a durable session value as of the start of this step — stored in OpenViking on the VM (heavy, the brief's store, `viking://user/<tenant>/sessions/<id>/`); a med runtime has no memory service, so there the store is `/zap/sessions/<id>/data.json` (same API, recorded as the one refinement of the brief in `docs/verify-log.md`) | Write secrets, block |
| `useSecret(name)` | Bind a write-only `SecretRef` into a connection header | Return the value |

- Hooks **may** be conditional. There is no hook-order state: each render starts from an empty capability set, so `if (…) useTool(x)` is the intended idiom.
- Hooks **must** be synchronous. No `await`, no `fetch`, no `sandbox.exec`, no `process.env` in the agent function. The runtime renders inside a guard that throws `AGENT_RENDER_IO` if the function touches I/O and `AGENT_RENDER_ASYNC` if it returns a Promise.
- Return value = instructions for that step. An empty string is allowed (the runtime uses the previous instructions).

**Capabilities — pick one shape.**

- **Tool** — one typed `run()`. You own it. CPU work: `sandbox.exec`. Tools are side-effecting by default; `readOnly: true` marks tools that plan-only mode may execute.
- **MCP server** — a service that already publishes many tools. Attach, don't rewrite.
- **Skill** — `SKILL.md` frontmatter + procedure + optional files. Auto-packaged from `skills/` into the deployment and into `/zap/skills/<agent>/`. Tools execute; skills instruct.
- **Subagent** — delegate focused work. Child context via kernel `fork`. Own model, tools, instructions. Bounded turns; plan-only propagates.
- **Connection** — constrained outbound HTTPS. Not a tool by itself. Called from a tool's `run()` as `connections.<id>.fetch(relativePath, init)`.
- **Recipe tool** — `defineRecipeTool("zap-world-cup-entrance")` exposes an existing `Zap.md` recipe (plan by default, live with a payer) so v5 agents can drive 0.3.1 recipes without rewriting them.

**Secrets and egress (locked).** `defineConnection({ id, origin, methods, pathPrefix, headers })`. `origin` must be HTTPS. `fetch` takes a **relative** path only; absolute URLs fail closed with `CONNECTION_ABSOLUTE_URL`; a method outside `methods` → `CONNECTION_METHOD_DENIED`; a path outside `pathPrefix` (after normalization, so `..` cannot escape) → `CONNECTION_PATH_DENIED`; all three are checked before any header is attached. Destination, method, pathPrefix, agent, environment (alias), and project are validated **before** any header is attached. Sensitive headers (`Authorization`, `Cookie`, `X-API-Key`, and any header named in `sensitiveHeaders`) **must** use `useSecret("NAME")` / `bearer(useSecret("NAME"))`; a hard-coded value is a **build error** (`ZAP_BUILD_SECRET_LITERAL`). Secret values never appear in source bundles, instructions, snapshots, templates, logs, `--json`, or API responses. They are write-only and resolved at request time only, by the `secrets` service, inside the runtime VM. Outbound auth goes through connections, never `process.env`.

**Sessions and deploys (locked).** A **session** is a durable conversation with a deployed agent. A **turn** is one input plus streamed events. Resume does not rebuild history locally — history lives with the deployment host (`/zap/sessions/<id>/messages.jsonl` + `turns.jsonl` in the VM; metadata mirrored to the control plane). A session binds to the **deployment it started on** (`deploymentId`, content-addressed); moving an alias does not mutate in-flight turns. The `development` alias auto-syncs: `zap deploy --watch`. `production` is an **immutable** snapshot: advance only with `zap deploy --alias production`. Plan-only is the default render; `--live` is an input flag (`input.live === true`) and requires a payer; fail closed otherwise (C5, C25).

**The turn loop** (`harness.zap`, run by `agents.host` inside `zap-agentd serve`):

```
turn(input)
  1. snapshot session data (sync read for useSessionData)
  2. render: instructions ← Agent()  (guarded, sync)  →  capabilities: model, tools, mcp servers, subagents
  3. model step via the in-VM gateway (BYOK: the key comes from the `secrets` service — synced into zap-agentd memory by the CLI, never process.env, §7; managed: the control-plane gateway proxy with RUNTIME_TOKEN) with the tool schemas from step 2
  4. for each tool call:
       readOnly tool, or input.live → execute run({ input, sandbox, fs, connections, session, signal, reportProgress }) → tool.result
       side-effecting tool and !input.live → do not execute → tool.planned { tool, input, estimate } back to the model
       subagent → kernel fork → child turn loop → result
  5. if the model asked for more tools → back to 2 (re-render); else turn.completed
  events streamed the whole time: session.started · turn.started · render · text.delta · tool.call · tool.result · tool.planned · approval.required · subagent.started/completed · turn.completed · turn.failed
```

**CLI the agent developer uses** (all with `--json`): `zap agent new <id>`, `zap agent ls`, `zap agent render --agent <id> --input "…"` (deterministic render, no model), `zap agent lint`, `zap deploy --watch`, `zap deploy --alias production`, `zap session --agent <id>[@<alias>] [--session <id>] [--live] [--verbose|--json] "…"` (no `@<alias>` = `development`), `zap sessions ls`, `zap secret set|list|remove NAME --agent <id> --env <alias> [--persist-env]`, `zap doctor --json`. Humans get text; agents get JSON.

## 5. Contracts and interfaces (authoritative on mechanism)

Public types are the product (C27). The code below is the contract; implementations may add fields but never remove or rename these.

### 5.1 Package layout

```
packages/
  core/              existing  @wzrdtech/core        + src/runtime-spec.ts (Runtime.md schema), src/template-manifest.ts
  providers/         existing  @wzrdtech/providers   unchanged API; gateway.media wraps it
  agent/             existing  @wzrdtech/agent       + runtime instructions
  cli/               existing  @wzrdtech/zap         + compose/runtime/harness/pay/memory/fs/ffmpeg/template/doctor --json
  mcp/               existing  @wzrdtech/zap-mcp     + runtime tools, optional Streamable HTTP transport
  sandbox-adapters/  existing  (private)             becomes the Eve bridge over packages/sandbox (§5.3.6)
  kernel/            NEW       @wzrdtech/zap-kernel  Context, effect, service, fork, dispose, events, loader/reconcile
  sandbox/           NEW       @wzrdtech/zap-sandbox contract + core.ts + adapters/{fake,local,docker,box,namespace,selfhost,microsandbox,e2b,daytona,cloudflare,modal,catalog/*}
  memory/            NEW       @wzrdtech/zap-memory  contract + {openviking,mem0,zep}
  runtime/           NEW       @wzrdtech/zap-runtime compose(), profiles, sandbox/ (typed plugin factories over zap-sandbox adapters), memory/ (over zap-memory), gateway/, mediafs/, ffmpeg/, lanes/, meter/, pay/, auth/, secrets/, connections/, harness/ (zap.ts = the executor loop, + third-party manifests), agentd/ (contract server + lanes + agents/ = the in-VM agent host: deployments, aliases, sessions, turns), apistore/, doctor/, redact.ts, testing.ts (fake services for tests)
  agent-code/        NEW       @wzrdtech/zap-agent   defineAgent, defineTool, defineConnection, defineMcpServer, defineProject, defineRecipeTool, hooks (useInput, useModel, useTool, useMcpServer, useSubagent, useSessionData, useSecret), bearer; render/ (guard, hook frame), build/ (esbuild bundle + lint), testing.ts — depends on core/kernel/sandbox/memory types only (§5.12)
  templates/         NEW       @wzrdtech/zap-templates template manifests, bake.sh, units, skills, doctor.sh per template
  cloud/             NEW       @wzrdtech/zap-cloud   Hono app: /v1/runtimes, /v1/sessions (proxy to the tenant VM's agent host), /v1/pay (mppx gate), /v1/meter, /v1/templates, sweeper; adapters for Cloudflare Workers + Vercel
agents/
  transcode/         the canonical agent from §4.12 (agent.ts byte-identical, tool inline; connections.ts)
  researcher/        the subagent it delegates to (agent.ts, tools/{probe,notify}.ts, connections.ts, skills/summarize/SKILL.md)
project.ts           defineProject({ agents, runtime?, aliases? }) — the §4.12 companion file
infra/
  box/               template build + publish: build-template.sh, publish-snapshot.sh, verify-template.sh (ports airv2 boxctl/verify-box/release)
  namespace/         create-instance.ts, bridge/ (macOS LaunchAgent bridge, ported from airv2 template-macos)
  self-host/         setup.sh (KVM VPS: msb, hyperlight, zap-agentd), zap-agentd.service
docs/
  providers/<id>.md  one page + compose snippet per provider (§5.11)
  templates/<name>.md
  harnesses/<id>.md
  runtime.md, compose.md, pay.md, memory.md, isolation.md, verify-log.md
```

### 5.2 Kernel API (`@wzrdtech/zap-kernel`)

```ts
// packages/kernel/src/index.ts — public surface
export type FiberState = "PENDING" | "LOADING" | "ACTIVE" | "UNLOADING" | "DISPOSED" | "FAILED";
export type Disposer = () => void | Promise<void>;

export interface Plugin<C = unknown> {
  name: string;                       // stable id, e.g. "sandbox.box"
  inject?: readonly string[];          // required service keys; fiber stays PENDING until all ACTIVE
  optionalInject?: readonly string[];  // used if present, never awaited
  schema?: import("zod").ZodType<C>;   // config validation at LOADING
  apply(ctx: Context, config: C): void | Promise<void>;
}
export interface PluginEntry<C = unknown> { readonly plugin: Plugin<C>; readonly config: C; readonly entryId: string; }   // entryId = name + stable config hash unless overridden
export type PluginFactory<C> = ((config?: C) => PluginEntry<C>) & { readonly plugin: Plugin<C> };
export function definePlugin<C>(plugin: Plugin<C>): PluginFactory<C>;                       // dsh-compatible: `plugin` is also usable as a raw Plugin
export abstract class Service { constructor(ctx: Context, key: string); protected abstract start(): void | Promise<void>; protected stop?(): void | Promise<void>; }

export interface Context {
  readonly id: string; readonly parent?: Context; readonly state: FiberState;
  effect(setup: () => Disposer | void | Promise<Disposer | void>): Promise<void>;   // LIFO on dispose
  provide<T>(key: string, value: T): Disposer;                                       // withdraws on dispose
  get<T>(key: string): T | undefined;                                               // no wait
  inject<T>(key: string): Promise<T>;                                               // waits until ACTIVE provider
  plugin<C>(plugin: Plugin<C>, config?: C): Promise<Fiber>;                         // mount child fiber
  fork(options?: { purpose?: string; isolate?: readonly string[] }): Context;        // child context; effects scoped
  isolate(keys: readonly string[]): Context;                                        // resolution realm
  intercept<T>(key: string, wrap: (svc: T, meta: { fiber: Fiber }) => T): Disposer;
  on<E extends keyof Events>(event: E, listener: Events[E]): Disposer;
  emit<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): void;
  parallel<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<void>;
  serial<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): Promise<ReturnType<Events[E]>[]>;
  waterfall<E extends keyof Events>(event: E, ...args: Parameters<Events[E]>): ReturnType<Events[E]>;
  ready(): Promise<void>;                                                            // root inject set ACTIVE
  dispose(): Promise<void>;                                                          // idempotent; reverse order
  // typed service accessors (declaration-merged by plugins, dsh-compatible names)
  sandbox: SandboxService; fs: RuntimeFs; meter: MeterService; tools: ToolRegistry; sessions: SessionService; doctor: DoctorService;
  gateway?: GatewayService; llm?: LlmService; mediafs?: MediaFs; memory?: MemoryService; skills?: SkillStore; harness?: HarnessService; pay?: PayService;
}
export interface Fiber { readonly id: string; readonly plugin: Plugin; readonly state: FiberState; readonly ctx: Context; readonly committed: ReadonlyMap<string, string>; dispose(): Promise<void>; }

export interface RuntimeOptions { weight: "light" | "med" | "heavy"; plugins: ReadonlyArray<PluginEntry<unknown> | Plugin<unknown>>; entryIds?: Record<string, string>; }   // raw Plugins are wrapped with config undefined
export interface Runtime { readonly ctx: Context; readonly weight: RuntimeOptions["weight"]; fork(options?: { purpose: string }): Promise<RunSession>; reconcile(next: RuntimeOptions): Promise<{ mounted: string[]; updated: string[]; unmounted: string[] }>; dispose(): Promise<void>; }
export interface RunSession { readonly ctx: Context; readonly id: string; run(input: RunInput): Promise<RunResult>; events(): AsyncIterable<RunEvent>; dispose(): Promise<void>; }
export function createRuntime(options: RuntimeOptions): Promise<Runtime>;
export function loadRuntimeConfig(spec: RuntimeSpec): RuntimeOptions;   // Runtime.md → plugin tree (stable entry ids)
```

North-star compose usage (kept verbatim from the locked brief). It **compiles at Z0** against typed stubs that session A ships as integration files — `packages/runtime/src/{sandbox/box,memory/openviking,harness/hermes,pay/x402}.ts` export correctly typed `PluginFactory`s whose `apply` throws `NOT_IMPLEMENTED` until B/D/I/H replace the bodies — and **runs at Z3** once those sessions land. The `@wzrdtech/zap/*` subpaths are typed re-exports of `@wzrdtech/zap-runtime/*` and ship `.d.ts`:

```ts
import { createRuntime, definePlugin, type Context } from "@wzrdtech/zap-kernel";
import { box } from "@wzrdtech/zap/sandbox/box";            // = @wzrdtech/zap-runtime/sandbox/box (PluginFactory)
import { openviking } from "@wzrdtech/zap/memory/openviking";
import { hermes } from "@wzrdtech/zap/harness/hermes";
import { x402 } from "@wzrdtech/zap/pay/x402";

const zap = await createRuntime({
  weight: "heavy",
  plugins: [
    box({ template: "zap-heavy-hermes", size: "default" }),
    openviking(),
    hermes({ profile: "standard" }),
    x402({ chain: "base" }),
  ],
});

const session = await zap.fork({ purpose: "run" });
try {
  await session.run({ prompt: "transcode last night's takes" });
} finally {
  await session.dispose(); // ctx.effect inverses run in reverse
}
```

Plugin shape (dsh-compatible):

```ts
import { definePlugin, type Context } from "@wzrdtech/zap-kernel";
import { boxProvider } from "./provider";                    // implements SandboxProvider over @asciidev/box-sdk
export const box = definePlugin<{ template: string; size?: "small" | "default" | "large" }>({
  name: "sandbox.box",
  inject: ["sandbox", "meter"],                               // sandbox.core provides the registry; adapters register into it
  async apply(ctx: Context, config) {
    const provider = boxProvider(config);
    await ctx.effect(() => ctx.sandbox.register(provider));  // register returns its own disposer
    ctx.sandbox.default = "box";
    const vm = await ctx.sandbox.acquire({ provider: "box", template: config.template, size: config.size, purpose: "runtime", idempotencyKey: ctx.id });
    ctx.provide("sandbox.handle", vm);
    await ctx.effect(() => () => vm.release());               // temporal composability
  },
});
```

Kernel invariants (each is a test in `packages/kernel/tests/`): disposers run in reverse registration order; a forked child's effects never run parent disposers and vice versa; `dispose()` twice is a no-op; `inject` of a missing key resolves only when provided and rejects with `SERVICE_MISSING` on `dispose`; provider replacement moves consumers through UNLOADING→LOADING against their committed view; `reconcile` mounts/unmounts only the delta and is order-independent; 1 000 fork/dispose cycles leave `process.getActiveResourcesInfo()` unchanged and heap growth < 5 %; `waterfall` short-circuits when a listener returns without `next()`.

### 5.3 Sandbox contract (`@wzrdtech/zap-sandbox`)

```ts
// packages/sandbox/src/contract.ts — owned by session B; adapters implement it; nobody else edits it
export type SandboxProviderId = "box" | "namespace" | "selfhost" | "microsandbox" | "e2b" | "daytona" | "cloudflare" | "docker" | "local" | "fake" | "modal" | `catalog:${string}`;   // "local" = this machine, mounted only under zap-agentd serve (exec: lane-less = `bash -lc` under the daemon's own confinement, lane set = ctx.lanes; fs at /zap/fs; acquire() returns the one handle for the VM itself; capabilities snapshot/fork/stop/resume/host all false — the VM cannot operate on itself; §4.1); "fake" mounts only with ZAP_ALLOW_FAKE_SANDBOX=1; hyperlight is a lane isolation kind (§4.6), runpod is catalog:runpod
export interface SandboxCapabilities {
  exec: true; files: true; readdir: boolean; detached: boolean;
  snapshot: boolean; fork: boolean; stop: boolean; resume: boolean;
  ports: boolean; privatePorts: boolean; desktop: boolean; ssh: boolean;
  networkPolicy: "none" | "allow-deny" | "domains";
  gpu: boolean; kvm: boolean; docker: boolean;
  isolation: "vm" | "microvm" | "container" | "process" | "hyperlight-wasm" | "none";
  sizes: readonly string[]; maxCommandSeconds: number;
}
export interface SandboxSpec {
  provider: SandboxProviderId; template?: string; size?: string; region?: string;
  env?: Record<string, string>;          // per-sandbox only; validated against the template allowlist
  ttlSeconds?: number | null; tags?: Record<string, string>;
  existing?: { id: string; metadata?: Record<string, unknown> };   // reconnect
  idempotencyKey: string;                // C26
  purpose: "template-build" | "runtime" | "run" | "lane" | "test";
}
export type LaneId = "codegen" | "ffmpeg" | "media-workflows" | "browser" | "wasm" | `gpu:${string}`;   // §4.6
export interface ExecOptions { cwd?: string; env?: Record<string, string>; timeoutMs?: number; detached?: boolean; signal?: AbortSignal; stdin?: Uint8Array; lane?: LaneId; }   // lane set → the lane executor (allowlist + isolation record; remote handles call /v1/lane, sandbox.local calls ctx.lanes in-process); unset → plain exec under the provider's default confinement
export interface LaneRun { id?: string /* default: ulid; names /zap/runs/<id>.log and done/<id>.json (§4.6) */; lane: LaneId; argv: readonly string[]; cwd?: string; env?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal; }
export interface LaneExecutor { run(r: LaneRun): Promise<ExecResult & { id: string; isolation: SandboxCapabilities["isolation"] | "gpu"; lane: LaneId }>; allowed(lane: LaneId, argv0: string): boolean; }   // the `lanes` service (§4.4); provided by packages/runtime lanes.core, typed here so sandbox.local can inject it without a runtime import
export interface ExecResult { exitCode: number; stdout: string; stderr: string; timedOut: boolean; truncated: boolean; startedAt: string; finishedAt: string; usage: { cpuSeconds?: number; bytesIn: number; bytesOut: number }; }
export interface SandboxFs { read(path: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array | null>; write(path: string, bytes: Uint8Array): Promise<void>; readdir?(path: string): Promise<Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }>>; remove(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>; resolve(path: string): string; }
export interface SnapshotRef { provider: SandboxProviderId; id: string; name?: string; createdAt: string; }
export interface HostedPort { port: number; url: string; token?: string /* server-side only, redacted in logs */; isPrivate: boolean; }
export interface SandboxHandle {
  readonly id: string; readonly provider: SandboxProviderId; readonly capabilities: SandboxCapabilities;
  state(): Promise<"provisioning" | "ready" | "running" | "idle" | "stopped" | "error" | "queued">;
  exec(command: string | readonly string[], opts?: ExecOptions): Promise<ExecResult>;   // string = `bash -lc`; argv = no shell (required when opts.lane is set)
  readonly fs: SandboxFs;
  snapshot?(name?: string): Promise<SnapshotRef>;
  fork?(spec: Pick<SandboxSpec, "idempotencyKey" | "purpose"> & Partial<SandboxSpec>): Promise<SandboxHandle>;   // idempotencyKey required (C26)
  stop?(): Promise<void>;                // never force
  resume?(): Promise<void>;              // Box: re-reads hosted URLs/tokens afterwards (§4.5)
  host?(port: number, opts?: { private?: boolean; title?: string }): Promise<HostedPort>;   // Box: exec of in-VM `host` CLI
  desktop?(opts?: { vnc?: boolean }): Promise<{ url: string } /* never logged */>;
  setNetworkPolicy?(policy: "allow-all" | "deny-all" | { allow: string[] }): Promise<void>;
  remove?(): Promise<void>;              // optional until verify item 13; never implied by release()
  release(): Promise<void>;              // the ctx.effect inverse — release matrix: purpose runtime|template-build → stop (keep disk);
                                         //   run|lane → keep running (parent runtime owns it); test → stop then remove if supported
  captureState(): Promise<{ provider: SandboxProviderId; metadata: Record<string, unknown> }>;
}
export interface SandboxProvider { readonly id: SandboxProviderId; capabilities(): Promise<SandboxCapabilities>; acquire(spec: SandboxSpec): Promise<SandboxHandle>; templates?(): Promise<Array<{ name: string; ref: SnapshotRef }>>; doctor(): Promise<DoctorReport>; }
export interface SandboxService { register(provider: SandboxProvider): Disposer; acquire(spec: SandboxSpec): Promise<SandboxHandle>; providers(): SandboxProviderId[]; default: SandboxProviderId; }
export class SandboxStartLimit extends Error { readonly code = "START_LIMIT_REACHED"; readonly retryAfterSeconds: number; }
```

**5.3.1 Conformance suite** (`packages/sandbox/tests/contract.test.ts`, one suite, every adapter runs it). Steps: acquire (`purpose: "test"`) → `resolve("fixture/input.txt") === "<workdir>/fixture/input.txt"` → `exec("mkdir -p fixture")` → `fs.write` → `exec("tr … < input.txt > output.txt && printf ':%s' \"$CONTRACT_SUFFIX\" >> output.txt", { cwd: "fixture", env })` → `fs.read` equals `ZAP:ready` → `fs.remove` recursive → read returns `null` → `captureState().provider === id` → if `capabilities.snapshot`: `snapshot()` then `fork()` reads the file back → if `stop`/`resume`: stop, state `stopped`, resume, file persists → if `ports`: `host(8080, {private:true})` returns a URL and the token never appears in the log buffer (C24 assertion) → `release()` twice is a no-op → `exec` after release throws `SANDBOX_RELEASED`. The fake adapter runs in CI; hosted adapters run under `RUN_HOSTED_SANDBOX_TESTS=1` and skip individually when their credential is absent (0.3.1 pattern).

**5.3.2 Box adapter** (`packages/sandbox/src/adapters/box/`): wraps `@asciidev/box-sdk` (`BoxApi`, `waitUntilReady`, `execCommand`) with a thin typed client whose method names map 1:1 to airv2 `lib/box/client.ts`:

| airv2 `lib/box/client.ts` | Zap `adapters/box/client.ts` | Box API |
|---|---|---|
| `fork({templateId, env, size, ttlSeconds})` (asserts `TENANT_ID`, `GATEWAY_TOKEN`; `noEnv:true`) | `fork({ templateId, env, size, ttlSeconds })` (asserts `TENANT_ID`, `RUNTIME_ID`, `RUNTIME_TOKEN`; always `noEnv:true`) | `POST /boxes/{id}/fork` (202, `box.forking`) |
| — | `createFromSnapshot({ from, env, size, ttlSeconds, setupScript })` | `POST /boxes {from, noEnv:true, …}` |
| `resume(boxId)` | `resume(boxId)` (re-applies `ttlSeconds` backstop) | `POST /boxes/{id}/resume` |
| `stop(boxId)` — never `force` | `stop(boxId)` — never `force` (C11) | `POST /boxes/{id}/stop` |
| `deleteBox(boxId)` | `remove(boxId)` — optional; behind verify item 13 (SDK has no delete route) | async "permanently delete Box data" operation, unconfirmed |
| `getBox`, `waitForBox` | `get`, `waitUntilReady` (timeouts 240 s; `error` state throws) | `GET /boxes/{id}` |
| `command(boxId, cmd, timeoutSeconds)` (HTTP timeout = `timeoutSeconds + 60`) | `exec` (+ `detached`, `/events` cursor polling for long runs) | `POST /boxes/{id}/commands` |
| `readFile` (via `cat`), `writeFile` | `fs.read` (files API GET, fallback `cat`), `fs.write` | `GET/PUT /boxes/{id}/files` |
| `requestDesktop(boxId, {vnc})` | `desktop({vnc})` — URL is never persisted/logged | `POST /boxes/{id}/desktop` |
| airv2 re-runs `host url <port> --private` after every wake (`orchestrator/boxes.ts`) and bakes `hermes-host.service` | `host(port, {private})` = `exec("/home/user/.ascii/host url <port> --private")` + stdout parse; called by `resume()` for every hosted port to learn the rotated token; `zap-host.service` re-hosts at boot | in-VM `host` CLI (the `POST /boxes/{id}/host` route is verify item 15) |
| `isStartLimit(error)` / `START_LIMIT_REACHED` | `SandboxStartLimit` for both `start_limit_reached` and `rate_limited`, `retryAfterSeconds` from headers or 60 | 429 |
| `BOX_TTL_SECONDS = 86400` | `ZAP_BOX_TTL_SECONDS` default 86400 | `ttlSeconds` |
| `renameBox` | `rename` (`zap-<tenant>-<runtime>`, ≤ 120 chars) | `PATCH /boxes/{id}` |

Also: Upstash `SET NX` + `Idempotency-Key` on create/fork (C26, verify item 14); runtime-row state machine driven by polling `GET /boxes/{id}` (5 s interval, 240 s budget) — the webhook receiver `POST /v1/sandbox/box/webhook` in `packages/cloud` (signature `X-Ascii-Signature`, > 5 min rejection, idempotent on `delivery_id`) is added only once verify item 13 confirms the webhook contract, and polling remains the fallback either way; `ready → ready`, `error → error`, `archived → stopped`.

**5.3.3 Namespace adapter** (`adapters/namespace/`): Connect/JSON over fetch to `https://{region}.compute.namespaceapis.com/namespace.cloud.compute.v1beta.ComputeService/{CreateInstance, DescribeInstance, WaitInstanceSync, SuspendInstance, WakeInstance, DestroyInstance, CreateIngress}` and `CommandService/RunCommandSync`; ingress access tokens from `NAMESPACE_IAM_API/nsl.tenants.TenantsService/IssueIngressAccessToken` (5-min cache; verify item 5). Linux instances: `containers[{ imageRef: "<zap-heavy image>", exportPorts }]` built from the same `bake.sh` via `nsc devbox image build`; the `zap-agentd` bridge on `:8722` gives exec/files when `CommandService` is not enough (macOS: always). Sizes map `small→2x4`, `default→4x8`, `large→8x16`.

**5.3.4 Self-host adapter** (`adapters/selfhost/`): talks to `zap-agentd` (`/v1/health`, `/v1/exec`, `/v1/files`, `/v1/lane`, `/v1/snapshot`, `/v1/capabilities`) over HTTPS with `ZAP_SELFHOST_TOKEN` (the VPS-level bearer; inside Box/Namespace runtimes the same daemon is gated by the per-runtime `RUNTIME_TOKEN`). `zap-agentd` binds `0.0.0.0:8722` everywhere — Box hosted routes, Namespace ingress, and the macOS bridge all reach it from outside the process (airv2 §5.2: never loopback for a hosted service) — and is protected by its token, not by its bind address. Lanes inside use Microsandbox (`msb`, npm `microsandbox@0.6.15`: `Sandbox.builder(name).image().cpus().memory().volume().create()`, `exec`, `snapshot`) or `hyperlight-wasm` for `wasm` lanes when `capabilities.kvm`.

**5.3.5 Other adapters** (Z7): `microsandbox` (cloud backend `MSB_API_KEY`, `https://api.microsandbox.dev/v1/sandboxes`), `e2b` (`Sandbox.create/connect`, `pause`), `daytona` (`@daytonaio/sdk`, snapshots, `getPreviewLink`), `cloudflare` (`@cloudflare/sandbox` `getSandbox`, `exec`, `exposePort`, `createBackup/restoreBackup`), `docker` (local dev; implemented on `dockerode` — no Eve imports, C29), `modal` (GPU lane target: `gpu: true`, `purpose: "lane"` only — C4), catalog stubs `catalog:runpod|blaxel|freestyle|orgo|tensorlake|baseten` (manifest + doctor entry `verified:false`; `acquire()` throws `CATALOG_STUB` with the docs URL; Runpod and Baseten have no sandbox product and are documented as GPU/inference targets only).

**5.3.6 Eve bridge** (`packages/sandbox-adapters/src/index.ts` keeps its exports): `resolveSandboxBackend(env, factories?)` keeps its signature. For v5 adapter ids (`box | docker | daytona | e2b | namespace | selfhost | microsandbox | fake`) it lazily creates one module-level `createRuntime({ weight: "light", plugins: [sandboxCore(), <adapter for the selected id>] })` and returns `eveBackendFromProvider(runtime.ctx.sandbox, providerId)` — an Eve `SandboxBackend` whose `create()` calls `acquire({ purpose: "runtime", existing, idempotencyKey: sessionKey })`, whose `SandboxSession` is `buildVendorSandboxSession(driverFromHandle(handle))`, and whose `shutdown` calls `handle.release()`. The Eve-native ids `vercel | auto | box-legacy` keep their 0.3.1 factories unchanged (bridge bypass; `box-legacy` = today's `@asciidev/eve-box` path). `ZAP_SANDBOX_BACKENDS` becomes `vercel | box | box-legacy | daytona | e2b | docker | auto | namespace | selfhost | microsandbox | fake` (`fake` only with `ZAP_ALLOW_FAKE_SANDBOX=1`); the `factories` parameter becomes `Partial<Record<ZapSandboxBackendName, () => T>>` so the existing six-key test objects still type-check. `tests/sandbox-selector.test.ts` and `tests/sandbox-contract.test.ts` keep their assertions (superset-only edits) (C1, C29).

### 5.4 Memory contract (`@wzrdtech/zap-memory`)

```ts
export interface MemoryScope { tenantId: string; runtimeId: string; sessionId?: string; }
export interface MemoryItem { uri: string; kind: "memory" | "resource" | "skill" | "message"; text?: string; metadata?: Record<string, unknown>; score?: number; }
export interface MemoryService {
  readonly provider: "openviking" | "mem0" | "zep"; readonly locality: "on-vm" | "saas";
  status(): Promise<{ healthy: boolean; items: number; bytes?: number }>;
  remember(scope: MemoryScope, input: { text: string; metadata?: Record<string, unknown>; durable?: boolean }): Promise<MemoryItem>;
  addResource(scope: MemoryScope, input: { path: string; uri?: string }): Promise<MemoryItem>;
  search(scope: MemoryScope, query: string, opts?: { limit?: number; kinds?: MemoryItem["kind"][] }): Promise<MemoryItem[]>;
  read(scope: MemoryScope, uri: string): Promise<string | null>;
  forget(scope: MemoryScope, uri: string): Promise<void>;
  wipeSession(scope: MemoryScope): Promise<void>;     // dispose: session-scoped keys only; durable tenant memory stays
  export(scope: MemoryScope): Promise<AsyncIterable<MemoryItem>>;   // I6; managed mode requires consent on the runtime row
  mcp?(): { url: string };                              // on-vm providers expose an MCP endpoint for harnesses
}
// Locality rule (§4.9): remember/search/read/addResource are available in-VM and to the self-host CLI only.
// The managed control API surfaces status/forget/export; a MemoryService instantiated there throws MEMORY_CONTENT_OFF_VM for content methods.
```

`memory.openviking` (default): ensures `~/.zap/memory/openviking/ov.conf` (`server.host 127.0.0.1`, `port 1933`, `auth_mode dev`, local agfs/vectordb, local embeddings; VLM through the gateway only when `--consent`), systemd `zap-openviking.service`, `ovctl` port of airv2's `ovctl.py`; URIs `viking://user/<tenant>/memories/…`, `viking://~/resources`, `viking://agent/skills`; MCP at `/mcp`. `memory.mem0` (`mem0ai`, `MEM0_API_KEY`, `user_id = tenantId`, `run_id = sessionId`); `memory.zep` (`@getzep/zep-cloud`, `ZEP_API_KEY`, user graph = tenant, thread = session). Contract suite `packages/memory/tests/contract.test.ts` runs against an in-process fake and, opt-in, each provider.

### 5.5 Gateway + media FS (`@wzrdtech/zap-runtime/gateway`, `/mediafs`)

```ts
export type LlmRouteId = "openrouter" | "gateway" | "openai" | "anthropic" | "xai" | "gmi";        // "gateway" = Vercel AI Gateway (0.3.1 default route id kept)
export type MediaProviderId = import("@wzrdtech/providers").ProviderId | "replicate";               // aws|vertex|gmi|fal|prodia|runware + replicate
export interface GatewayService {
  llm(route: LlmRouteId, opts: { model: string; auth?: "byok" | "claude-code" | "codex" | "managed" }): LlmService;
  media(provider: MediaProviderId, opts: { model?: string }): MediaService;   // wraps ProviderAdapter.submit/poll/price with the deterministic router
  route(capability: import("@wzrdtech/core").ZapStepKind, hint?: { provider?: MediaProviderId; model?: string }): { provider: MediaProviderId; model: string; usdEstimate: number };
  quote(plan: import("@wzrdtech/core").ZapPlan): Promise<{ usd: number; lines: Array<{ stepId: string; usd: number; unit: string }> }>;  // never calls a provider
}
export interface MediaFs {
  put(kind: "image" | "audio" | "video" | "3d", bytes: Uint8Array | ReadableStream, sidecar: MediaSidecar): Promise<{ sha256: string; path: string }>;   // /zap/media/<kind>/<sha256[0:2]>/<sha256>.<ext> + .json
  get(sha256: string): Promise<{ bytes: Uint8Array; sidecar: MediaSidecar } | null>;
  list(filter?: Partial<Pick<MediaSidecar, "kind" | "provider" | "model" | "runId">>): AsyncIterable<MediaSidecar>;
  link(sha256: string, into: string): Promise<void>;  // hardlink into /zap/fs project dirs
}
export interface MediaSidecar { schema: 1; sha256: string; kind: "image" | "audio" | "video" | "3d"; mime: string; bytes: number; createdAt: string; runId?: string; stepId?: string; provider?: string; model?: string; prompt?: string; parents?: string[]; ffmpegPreset?: string; usd?: number; width?: number; height?: number; durationS?: number; }
```

Plan-only is enforced structurally: `quote()` and `route()` are pure over `modelRates`/`operatorPricedModels`; `MediaService.submit` throws `LIVE_REQUIRED` unless the session carries `live: true` and `ctx.pay.status() !== "missing"`. ffmpeg presets (`packages/runtime/src/ffmpeg/presets.ts`) are data: `{ id, argv(inputs, params), estimateCpuSeconds(probe), outputs }`, dry-run prints argv + estimate; execution goes through the `ffmpeg` lane (§4.6) and writes results into the media FS with `ffmpegPreset` set.

### 5.6 Harness contract (`@wzrdtech/zap-runtime/harness`)

```ts
export interface HarnessManifest {
  id: "zap" | "hermes" | "openclaw" | "opencode" | "deepseek" | "grok" | "omg" | "pi" | "cursor" | "devin" | "kimi" | "interpreter" | "agno" | "prime" | "headlong" | "frontier" | "fx";
  minWeight: "light" | "med" | "heavy";
  inProcess?: true;                             // only "zap": the harness IS zap-agentd — no extra process, units or ports beyond zap-agentd.service / 8722 (declared as its single `api` port), no managedGateway (the in-VM gateway service is used directly); run = "http-runs" against /v1/runs
  pullOnly?: true;                              // only "devin": the worker pulls its own sessions; run() returns HARNESS_PULL_ONLY
  pins: Record<string, string>;                 // resolved refs recorded at bake (C30)
  ports: Array<{ port: number; role: "api" | "dashboard" | "bridge"; hostPrivate: boolean }>;   // exactly one "api" port for http-runs|openai-compat|ws-jsonrpc (for `zap` that is zap-agentd's 8722); zero for cli-exec|rpc-jsonl
  units: string[];                              // systemd units (or LaunchAgents on macOS)
  stateDirs: string[];                          // e.g. ["~/.hermes"], ["~/.openclaw", "~/.openclaw/workspace"]
  skillsDirs: string[];                         // where SKILL.md are discovered by this harness
  mcpConfig: { path: string; format: "yaml" | "json" | "json5" | "toml" | "cli" };   // how to register OpenViking/Context7/open-connector/Composio MCP
  llmAuth: Array<{ env: string; mode: "byok" | "claude-code" | "codex" | "managed" }>;
  disabledInbound: string[];                    // every adapter the bake must set enabled:false (C23); may be empty only when the harness has a single inbound by construction
  run: "http-runs" | "openai-compat" | "rpc-jsonl" | "cli-exec" | "ws-jsonrpc";   // exactly one adapter kind per harness (table below)
  managedGateway?: { file: string; key: string; flavor: "openai" | "anthropic" };   // in managed mode the bake writes baseUrl = `${ZAP_API_URL}/v1/runtimes/{id}/gateway/llm/v1` (openai flavor: clients append /chat/completions) or `${ZAP_API_URL}/v1/runtimes/{id}/gateway/llm` (anthropic flavor: clients append /v1/messages); e.g. Hermes `~/.hermes/.env: OPENAI_BASE_URL` openai, OpenClaw `models.providers.zap.baseUrl` openai, OpenCode `provider.zap.options.baseURL` openai
}
export interface HarnessService {
  manifest(): HarnessManifest;
  bake(sandbox: SandboxHandle): Promise<void>;                       // idempotent; runs bake.sh; writes ~/.zap/template.json
  boot(sandbox: SandboxHandle): Promise<void>;                       // enable units; wait for health
  health(sandbox: SandboxHandle): Promise<{ ok: boolean; checks: Array<{ name: string; ok: boolean }> }>;   // doctor.sh
  run(sandbox: SandboxHandle, input: RunInput): Promise<RunHandle>;  // normalizes to {id, events(): AsyncIterable<RunEvent>, stop(), approve()}
}

// harness.zap only — the executor interface (E owns the implementation in packages/runtime/src/harness/zap.ts; K composes it, never edits it)
export interface StepCapabilities { instructions: string; model: import("@wzrdtech/zap-agent").ModelId; tools: ReadonlyMap<string, import("@wzrdtech/zap-agent").AnyTool>; mcpServers: ReadonlySet<string>; subagents: ReadonlyMap<string, { maxTurns?: number }> }
export interface McpClient { listTools(): Promise<Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>>; callTool(name: string, input: unknown, opts?: { signal?: AbortSignal }): Promise<unknown>; close(): Promise<void>; }
export interface ExecuteStepOptions {
  signal: AbortSignal;
  history: ReadonlyArray<import("@wzrdtech/zap-agent").TurnMessage>;             // the session transcript so far (all prior turns, windowed by the host to the model's context), then this turn's messages
  mcp: ReadonlyMap<string, { definition: import("@wzrdtech/zap-agent").McpServerDefinition; client(): Promise<McpClient> }>;   // one entry per id in caps.mcpServers; K builds the clients with headers resolved through secrets (§5.12); MCP tools are read-only unless the definition marks them side-effecting
  delegate?(subagentId: string, input: { text?: string; payload?: unknown }): Promise<{ text: string; events: RunEvent[] }>;   // K's agent host runs the child turn loop in a kernel fork; E only calls it
  onEvent(e: StepEvent): void;
  toolContext: Omit<import("@wzrdtech/zap-agent").ToolContext<never>, "input" | "signal">;   // sandbox (the handle), fs, connections, session, memory?, reportProgress, live (plan-only flag, C25), log — built once per turn by the host (run() builds an ephemeral session { id: runId, alias: "run", data: in-memory })
}
export type StepEvent = Extract<RunEvent, { type: "text.delta" | "tool.call" | "tool.result" | "tool.planned" | "approval.required" }>;   // executeStep emits step-scoped events only; run.* / turn.* / session.* / render / subagent.* are emitted by the caller (run() or the agent host)
export type TokenUsage = { inputTokens: number; outputTokens: number; reasoningTokens?: number; usd: number };
export type StepResult = { kind: "final"; text: string; usage: TokenUsage } | { kind: "needs-render"; messages: import("@wzrdtech/zap-agent").TurnMessage[]; usage: TokenUsage };   // needs-render = the model asked for tools that ran; re-render (§4.12 step 5)
export interface ZapExecutor { executeStep(ctx: Context, caps: StepCapabilities, opts: ExecuteStepOptions): Promise<StepResult> }   // ctx.llm for the model call (in-VM gateway); one model call + its tool calls per invocation; ctx.pay.status() === "missing" → PAYER_MISSING before the call in every mode (C5/C25)
```

In the VM, `POST /v1/runs` (the `zap runtime exec --prompt` path at med) is `executeStep` in a loop with a **static** capability set (`instructions` = the prompt, built-in tools: lanes, fs, mediafs, ffmpeg presets; no subagents, no MCP) until `kind === "final"`, wrapping the step events in `run.started … run.completed | run.failed`. K's agent host runs the same loop with the capabilities returned by each render (§4.12). The caller-kernel `harness.zap` driver's `run()` is just the `http-runs` client of that route.

Run adapters (one per harness; the manifest's `run` field must match this table exactly):

| Adapter | Mechanism | Harnesses |
|---|---|---|
| `http-runs` | harness-specific HTTP run API + SSE/poll | **`zap`** (zap-agentd `POST /v1/runs { prompt, live, payer, tools? }`, SSE `/v1/runs/{id}/events`, `Idempotency-Key`; E's route module `packages/runtime/src/agentd/runs.ts` on the in-VM executor), Hermes (`POST /v1/runs`, SSE `/v1/runs/{id}/events`, `X-Hermes-Session-Id`, `Idempotency-Key`), OpenCode (`POST /session`, `POST /session/:id/message`, SSE `/event`), Kimi Code (`POST /api/v1/sessions/<id>/prompts`, WS `/api/v1/ws`), Agno (`POST /agents/{id}/runs`) |
| `openai-compat` | `POST /v1/chat/completions` (+ `/v1/responses`) with SSE | OpenClaw (`x-openclaw-session-key`) |
| `rpc-jsonl` | stdin/stdout JSONL over `exec` (detached process) | Pi (`--mode rpc`), prime-agent (`--mode rpc`) |
| `cli-exec` | one-shot CLI with JSON output over `exec` | fx (`fx ask --json`), FrontierAgent (`frontier-agent -p --no-tui`), Cursor (`agent -p --output-format json`), headlong (`<agent> "<prompt>"`), dsh (headless entry, verify item 8), devin (`pullOnly: true` — `doctor` only) |
| `ws-jsonrpc` | WebSocket JSON-RPC | Open Interpreter (`interpreter app-server --listen ws://127.0.0.1:9000` — its only adapter; `interpreter exec --json` is used solely by `doctor.sh`), omg (`OMG` live transport) |

Every adapter emits the same `RunEvent` union (`run.started { live, payer } | text.delta | tool.call | tool.result { usage?: MeterLine[] } | tool.planned { tool, input, estimate } | approval.required | run.completed { usage: { tokens: TokenUsage; lines: MeterLine[] } } | run.failed { code, remediation }` — `tool.planned` is what any harness emits for a side-effecting tool in a plan-only run, C25; third-party harnesses that cannot plan a tool emit `approval.required` instead) so `zap runtime exec --prompt` and MCP `zap_runtime_exec` behave identically across harnesses. `zap-heavy-devin` (`pullOnly`) has no live run path — the Outpost worker pulls its own sessions — so `zap runtime exec --prompt` returns `HARNESS_PULL_ONLY` and only `doctor` applies.

### 5.7 Pay + meter contract (`@wzrdtech/zap-runtime/pay`, `/meter`)

```ts
export type PayerMode = "missing" | "byok" | "managed";
export type MeterUnit = import("@wzrdtech/core").MeterUnit;   // = "sandbox_second" | "gateway_input_token" | "gateway_output_token" | "media_request" | "gpu_second" | "api_call" | "browser_minute" | "computer_minute" | "egress_byte" — defined in packages/core/src/meter.ts (A, Z0, additive) so that @wzrdtech/zap-agent can name it without depending on runtime
export interface MeterLine { unit: MeterUnit; qty: number; usd: number; sku: string; }   // sku e.g. "box.default", "openrouter/anthropic/claude-sonnet-4.6", "fal-ai/flux/dev"
export interface MeterService {
  quote(plan: { lines: Array<Omit<MeterLine, "usd">> }): Promise<{ usd: number; lines: MeterLine[]; creditApplied: number }>;   // pure over prices + balances; PRICE_UNKNOWN throws in live mode
  reserve(scope: { principalId: string; runId: string }, quoteUsd: number): Promise<{ capUsd: number; totalReservedUsd: number }>;   // atomic (Upstash Lua, 0.3.1 wzrd-cloud-meter)
  settle(scope: { principalId: string; runId: string }, actual: MeterLine[]): Promise<void>;  // only after PayService.settle succeeded (C25); writes the reserve-vs-actual difference to balances
  settleIdle(scope: { principalId: string; runtimeId: string }, lines: MeterLine[]): Promise<void>;   // idle sandbox-seconds between runs; no run, no reservation; ledgered with runId: null
  ledger(scope: { principalId: string; from?: string; to?: string }): AsyncIterable<MeterLine & { runId: string | null; runtimeId?: string; at: string; payer: PayerMode; receiptId?: string }>;
}
// Payer-mode resolution (in this order): `Runtime.md pay.mode` for that runtime → `ZAP_PAYER_MODE` → if unset: "byok" when any provider key or device token resolves, else "missing".
// A 0.3.1 user with FAL_KEY and no ZAP_PAYER_MODE therefore keeps working under --live exactly as before.
export interface PayService {
  status(): Promise<{ mode: PayerMode; detail: string; wallet?: `0x${string}` }>;
  quote(lines: MeterLine[]): Promise<{ usd: number; accepts: Array<{ protocol: "x402" | "mpp"; network: string; asset: string; amount: string; payTo: string }> }>;
  authorize(req: Request | { headers: Headers }): Promise<{ ok: true; receipt: Receipt } | { ok: false; challenge: Response /* 402 with PAYMENT-REQUIRED + WWW-Authenticate: Payment */ }>;
  settle(receipt: Receipt): Promise<Receipt>;   // idempotent on receipt.id
}
export interface Receipt { id: string /* EIP-3009 nonce or MPP challenge id */; protocol: "x402" | "mpp" | "byok"; network?: string; payer?: string; amount: string; asset?: string; payTo?: string; tx?: string; settledAt?: string; runId: string; }
```

`pay.byok` reports `status() = "byok"` whenever `ZAP_PAYER_MODE=byok` (a self-host user running only free lanes needs no key); it resolves provider keys at route time in this order and never logs them: process env → `zap keys` encrypted store (`.zap/credentials.json`) → device-auth tokens (`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`; Codex `~/.codex/auth.json` via `codex login --device-auth` or `--with-api-key`) → Supabase user vault (web); a route whose key is absent fails with `KEY_MISSING` for that provider only. Inside a VM the in-VM `gateway.core` obtains BYOK keys from `ctx.secrets.gatewayKey(route)` (§5.12) — synced from this same store by the CLI — and a key that is configured on the caller but not yet synced fails that route with `KEY_UNAVAILABLE` (remediation: `zap secret sync` / any CLI contact).

`pay.x402` (managed) = the `mppx` gate in `packages/cloud/src/gate.ts`, applied as Hono middleware to every endpoint that spends: `POST /v1/runtimes/{id}/exec` in its prompt form (**both** modes — thinking tokens are spend, C25; the quote is the plan-only token estimate, larger with `live:true`), `POST /v1/sessions/{id}/turns` (both modes; K's sessions proxy mounts behind H's gate middleware), `/v1/runtimes/{id}/gateway/*`, GPU lanes and paid connections. Not gated: `exec` with a `command` (no model), free BYOK lanes, and every read endpoint. The gate's receipt is what funds the reservation: `Mppx.create({ methods: [evm.charge({ currency: USDC on eip155:8453, recipient: ZAP_TREASURY, x402: { facilitator: <thirdweb or CDP> } }), tempo.charge(...)?], secretKey: MPP_SECRET_KEY })`; it advertises `PAYMENT-REQUIRED` (x402 v2) and `WWW-Authenticate: Payment` (MPP) on one 402 and accepts whichever credential arrives (x402 v1 only via the off-by-default shim, §4.10). Thirdweb is the default facilitator (`thirdweb/x402` `facilitator({ client, serverWalletAddress })` → `https://api.thirdweb.com/v1/payments/x402/{verify,settle,supported}`) and the wallet/identity layer (SIWE via `createAuth`, existing); CDP is the alternate (verify item 4). Replay authority is Upstash `SET NX zap:gate:nonce:<id>` (both cloud adapters); Convex/D1 are ledgers only.

**Managed signer (C8, verify item 16).** Zap never holds a user key. Studio pays with the connected browser wallet (`wrapFetchWithPayment(fetch, client, wallet, maxValue)` via `thirdweb/react` `useFetchWithPayment`). The CLI and agents pay with a **scoped session key**: `zap pay login --managed` authenticates the user's thirdweb in-app/ecosystem wallet (email/phone/passkey/SIWE), requests a session key with `maxValue` (default `$5`), allowed targets (the control API origin), and expiry (24 h), and stores it 0600 in `.zap/auth.json`; `@wzrdtech/zap-runtime/pay/client` wraps `fetch` with that key (thirdweb signer, or `@x402/fetch` + `mppx/client` with a viem account) and refuses any payment above the cap. Fallback for headless agents: `ZAP_WALLET_PRIVATE_KEY` (a key the user owns; never generated or stored by Zap). If session keys prove unavailable for the chosen wallet type, escalate — do not invent a custodial workaround.

### 5.8 `Runtime.md` (agent-authored compose) and `zap.config.ts`

`Runtime.md` mirrors `Zap.md`/`Sprite.md` conventions (YAML frontmatter is the source of truth; prose is context). Schema in `packages/core/src/runtime-spec.ts` (zod, exported as `runtimeSpecSchema`, `parseRuntimeMarkdown`, `serializeRuntimeMarkdown`):

```yaml
---
runtime: film-ops           # slug ^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$
version: 1
weight: heavy               # light | med | heavy
sandbox:
  provider: box             # box | namespace | selfhost | microsandbox | e2b | daytona | cloudflare | docker (| fake with ZAP_ALLOW_FAKE_SANDBOX=1)
  template: zap-heavy-hermes
  size: default             # provider-mapped
  environment: ubuntu       # ubuntu | omarchy | macos
  idleStopMinutes: 20
memory: { provider: openviking }            # or mem0 | zep (+ consent: true)
gateway: { llm: openrouter, model: anthropic/claude-sonnet-4.6, media: [fal, runware] }
harness: { id: hermes, profile: standard }  # med: { id: zap } (harness.zap, always mounted) is the default; heavy adds a named harness beside it
pay: { mode: managed, keysInRuntime: false } # byok | managed; keysInRuntime only meaningful for byok — default true when a third-party harness is mounted (they read llmAuth[].env), false otherwise (agents-as-code keys travel by secrets sync, §7)
skills: [zap-runtime, zap-lanes, browser-use, openviking-memory]   # browser-use + openviking-memory ship in packages/templates/zap-light-browser and zap-heavy (§5.11)
connections: [{ id: context7, kind: mcp, url: https://mcp.context7.com/mcp }, { id: composio, kind: plugin }]
env: { allow: [TZ, LANG] }                   # per-runtime env allowlist; never secrets
lanes: [ffmpeg, codegen, browser]            # also wasm, gpu:<class> (e.g. gpu:L40S)
---
# Film Ops
Operational context for the agent…
```

`zap compose` accepts `Runtime.md` or `zap.config.ts` (the TS form in §5.2), validates (`zap compose --validate`), prints the resolved plugin tree with stable entry ids (`zap compose --json`), and writes `.zap/runtime.lock.json` (resolved providers, template refs, pins). `Sprite.md` continues to work; `zap runtime import-sprite <Sprite.md>` produces a `Runtime.md`.

### 5.9 CLI surface (keep every 0.3.1 command; add these; every command has `--json`, exit codes 0/1/2)

| Command | Behaviour |
|---|---|
| `zap compose [Runtime.md\|zap.config.ts] [--weight light\|med\|heavy] [--sandbox box] [--validate] [--dry-run]` | Resolve + validate plugin tree; `--dry-run` prints tree + quote, never acquires. Writes `.zap/runtime.lock.json`. |
| `zap runtime up [--from Runtime.md] [--wait]` / `down` / `ps` / `logs <id>` / `exec <id> -- <cmd>` / `exec <id> --prompt "…"` / `snapshot <id> [--name]` / `fork <id>` / `stop <id>` / `resume <id>` / `desktop <id>` / `import-sprite` | Lifecycle over the sandbox + harness contracts. `exec --prompt` uses the harness run adapter and streams `RunEvent` (text; `--json` = JSONL). `desktop` prints a one-time redirect URL to stdout only when `--i-understand-secret-url` is present. |
| `zap harness ls` / `bake <template>` / `doctor <id\|template>` / `run <template> --prompt` | List manifests (with `minWeight`, ports, verified), build a template (bake + verify + snapshot + `docs/verify-log.md` entry), health checks, one-shot run. |
| `zap pay status` / `quote <Runtime.md\|Zap.md> [--live]` / `receipts [--from --to]` / `login --managed` | `status` → `byok \| managed \| missing` + remediation; `quote` never spends; `receipts` reads the ledger; `zap pay login --managed` = thirdweb wallet auth + session key (§5.7 managed signer), stored 0600 in `.zap/auth.json`. This is the only managed login command. |
| `zap keys add\|list\|test\|remove\|sync` (existing) + `zap login --provider claude-code\|codex\|openai\|anthropic\|openrouter` | BYOK device-auth flows; tokens into the encrypted store; never printed. |
| `zap memory status\|search <q>\|export\|forget <uri>` | Over `MemoryService`. |
| `zap fs ls\|get\|put [--runtime id] <path>` and `zap media ls\|get <sha>` | Over `RuntimeFs` / `MediaFs`. |
| `zap ffmpeg <preset> [--input …] [--live]` | Presets; **dry-run by default everywhere** (prints argv + estimate); `--live` executes through the lane (free under BYOK; metered under managed). |
| `zap template ls\|create --from-run <runId>\|publish <name>` | Templates from a run trajectory (extends `save_zap`), publish = build + snapshot + registry row. |
| `zap doctor --json` | Aggregates `DoctorService`: node, project, providers (sandbox/memory/gateway/pay), templates verified, payer, starts budget, missing credentials, agents (project.ts parses, bundles lint clean, aliases resolve). Checks carry `required: boolean`; `payer`, hosted credentials, and template verification are informational (`required:false`) so CI exits 0 with `payer:"missing"`; exit 1 only when a `required:true` check fails (node version, project files, typed packages resolvable). |
| `zap mcp [--http :port]` | stdio (default) or Streamable HTTP. |
| `zap agent new <id>` / `ls` / `render --agent <id> [--input "…"\|--input-json …] [--alias a]` / `lint` | Scaffold `agents/<id>/…` and register it in `project.ts`; list agents with aliases → deploymentIds; **deterministic render** (runs the agent function in the guard with a synthetic input, prints `{ instructions, model, tools[], mcpServers[], subagents[], secretsBound[] }` — never calls a model or the sandbox; the console's render playground is this command); lint = the build checks without bundling. |
| `zap deploy [<Zap.md>] [--agent <id>\|--all] [--watch] [--alias <alias>]` | **Positional `<Zap.md>` keeps the 0.3.1 behaviour** (upload a draft recipe). Without a positional: bundle + lint `project.ts`/`agents/**`, upload the deployment to the runtime VM, and move the `development` alias; `--watch` rebuilds on change; `--alias production` promotes the current build to the immutable `production` alias (a new deploymentId is never created by an alias move). |
| `zap session --agent <id>[@<alias>] [--session <id>] [--live] [--verbose\|--json] "<text>"` / `zap sessions ls [--agent]` | Create or resume a durable session and run one turn; streams events (text pretty-printed; `--verbose` adds `render` events with attached capability ids; `--json` = JSONL of the event union). No `@<alias>` = `development`. `--live` sets `input.live` and requires a payer. Never rebuilds history locally. |
| `zap secret set NAME [--agent <id>] [--env <alias>] [--stdin] [--persist-env]` / `list` / `remove` / `sync [--runtime <id>]` | Write-only agent secrets scoped to (agent, alias); `list` shows names + scopes + last4 only. Self-host: encrypted in `.zap/secrets.json` (0600) and synced in-memory to `zap-agentd` over `POST /v1/secrets/sync` on `set`, on `deploy`, and on the first contact after a VM restart; `--persist-env` additionally stores the value as per-box `env` `ZAP_SECRET_<NAME>` (provider-side, not snapshotted, §7) for operators who need secrets to survive a restart without a CLI round-trip. The same sync path carries the BYOK gateway keys the in-VM gateway needs (`zap login`/`zap keys` store → `secrets.env`), so `pay.keysInRuntime` stays `false` by default for med and for agents-only heavy runtimes (it defaults to `true` only when a third-party harness is mounted, §7) and no provider key is ever in a snapshot. Managed: Supabase vault via the control API; nothing is synced into the VM. |

### 5.10 MCP tools (extend the existing 10; same shell-out-with-`--json` pattern; no key-writing tool; secrets never returned)

`zap_compose`, `zap_runtime_up`, `zap_runtime_down`, `zap_runtime_ps`, `zap_runtime_exec` (`{ runtimeId, command? | prompt?, live?: false }`), `zap_runtime_snapshot`, `zap_runtime_fork`, `zap_fs_list`, `zap_fs_read` (size-capped, text only), `zap_fs_write`, `zap_sandbox_exec` (alias with `lane`), `zap_harness_ls`, `zap_harness_doctor`, `zap_pay_status`, `zap_pay_quote`, `zap_memory_search`, `zap_memory_remember`, `zap_ffmpeg_preset` (dry-run default), `zap_template_ls`, `zap_doctor`, and the agents-as-code set: `zap_agent_ls`, `zap_agent_render` (`{ agent, input }` — deterministic, `readOnlyHint`), `zap_deploy_agent` (`{ agent?, alias?: "development" }`; the existing `zap_deploy` keeps its recipe meaning), `zap_session` (`{ agent, alias?: "development", sessionId?, text, live?: false }` → returns the session id and the event list), `zap_sessions_ls`, `zap_secret_list` (names + scopes + last4 only; there is no secret-writing tool). `live: true` on any tool requires a payer and is annotated `destructiveHint: true`; plan/quote/render/list tools are `readOnlyHint: true`.

### 5.11 Skills and the agent-plugin

Ship `skills/zap-runtime`, `skills/zap-compose`, `skills/zap-templates`, `skills/zap-pay`, `skills/zap-memory`, `skills/zap-lanes` (each `SKILL.md` ≤ 2 KB, hash-manifested, served at `/api/skills/<skill>`), plus the in-VM skills that ship with templates: `browser-use` (`packages/templates/zap-light-browser/skills/browser-use/SKILL.md`, ported from airv2), `openviking-memory` (`packages/templates/zap-heavy/skills/openviking-memory/SKILL.md`, ported from airv2), and one `SKILL.md` per harness in `packages/templates/<name>/skills/`. Package the agent-plugin three ways from the same sources: Claude Code plugin (`.claude-plugin/plugin.json` + `mcpServers` pointing at `npx @wzrdtech/zap mcp`), Codex/Cursor/OpenCode MCP config snippets (`docs/agent-plugin.md`), and `llms.txt` at the site root listing CLI, kernel, sandbox contract, templates, providers. Every provider page `docs/providers/<id>.md` contains: what it is, env vars, the compose snippet (the `PROVIDERS[].snippet` seeds from the locked brief, **corrected to the §5.2/§5.3 factories that actually exist** so `tests/docs-snippets.test.ts` type-checks them: `box({ template: "zap-heavy-hermes", size: "default" })`, `namespace({ image: "zap-heavy-hermes", environment: "omarchy" })`, hyperlight is not a sandbox provider — its page shows the lane form `createRuntime({ weight: "light", plugins: [box({ template: "zap-light" }), lanes({ enable: ["wasm"] })] })` (`lanes` = the `lanes.core` factory from `@wzrdtech/zap/lanes`) and a `sandbox.exec(argv, { lane: "wasm" })` call, `openviking({ path: "~/.zap/memory/openviking" })`, `mem0({ userId, consent: true })` / `zep({ sessionId, consent: true })` with `userId`/`sessionId` plain strings the caller supplies, `x402({ chain: "base" })` (facilitator and `payTo` come from §7 env inside the plugin, never from a snippet), `gateway.llm("openrouter", { model: "anthropic/claude-sonnet-4.6" })`, `gateway.media("fal", { model: "fal-ai/flux/dev" })`), the capability row from `doctor --json`, and the verify-log link.

### 5.12 `@wzrdtech/zap-agent` — agents as code (locked API; session K)

Public exports (exactly these names, plus the three additive helpers marked †): `defineAgent`, `defineTool`, `defineConnection`, `useInput`, `useModel`, `useTool`, `useMcpServer`, `useSubagent`, `useSessionData`, `useSecret`, `bearer`, †`defineMcpServer`, †`defineProject`, †`defineRecipeTool` (plus the types below). **Dependency direction:** `@wzrdtech/zap-agent` sits *below* `@wzrdtech/zap-runtime` in the build order (core → kernel → sandbox → memory → providers → **agent-code** → runtime → …): it imports types only from `@wzrdtech/core`, `@wzrdtech/zap-kernel`, `@wzrdtech/zap-sandbox` and `@wzrdtech/zap-memory`, defines `MediaFsLike` structurally (runtime's `MediaFs` satisfies it), and never imports `@wzrdtech/zap-runtime`, `eve`, or `@wzrdtech/agent`. Runtime's agent host imports `@wzrdtech/zap-agent` (render frame, guard, types); the Studio bridge lives in `packages/agent/src/zap-bridge.ts` (K-owned) so `eve` stays out of this package.

```ts
// packages/agent-code/src/index.ts — public surface
export type AgentInput = { source: "cli" | "mcp" | "api" | "studio" | "channel" | "subagent"; text?: string; payload?: unknown; live: boolean; sessionId: string; turn: number; alias: string };
export type ModelId = `${"openrouter" | "gateway" | "openai" | "anthropic" | "xai" | "gmi"}/${string}`;
export type SecretRef = { readonly __brand: "SecretRef"; readonly name: string };            // opaque; never carries a value
export type HeaderValue = string | SecretRef | { readonly __brand: "HeaderValue"; readonly scheme: "Bearer"; readonly ref: SecretRef };
export type JsonSchema = Record<string, unknown>;                                            // JSON Schema 2020-12 object schema
export type ToolInput = Record<string, unknown>;                                             // default I: property access is allowed, values are unknown until the tool narrows them (this is what makes the §4.12 canonical agent compile: String(input.path))
export type MeterUnit = import("@wzrdtech/core").MeterUnit;                                 // moved to core (additive) so agent-code needs no runtime import; §5.7 re-exports it
export interface MediaFsLike { put(kind: "image" | "audio" | "video" | "3d", bytes: Uint8Array | ReadableStream, sidecar: Record<string, unknown>): Promise<{ sha256: string; path: string }>; get(sha256: string): Promise<{ bytes: Uint8Array; sidecar: Record<string, unknown> } | null>; link(sha256: string, into: string): Promise<void> }
export type TurnMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; toolCallId?: string; toolCalls?: Array<{ id: string; name: string; input: unknown }> };   // the transcript unit written to messages.jsonl and replayed to the executor (turns.jsonl holds events)

export interface ToolContext<I> {
  input: I;
  sandbox: { exec(argv: readonly string[] | string, opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number; lane?: import("@wzrdtech/zap-sandbox").LaneId; signal?: AbortSignal }): Promise<import("@wzrdtech/zap-sandbox").ExecResult> };   // = SandboxHandle.exec of the VM's sandbox.local handle (§5.3)
  fs: { read(path: string): Promise<Uint8Array | null>; write(path: string, bytes: Uint8Array | string): Promise<void>; readdir(path: string): Promise<string[]> };   // rooted at /zap/fs
  mediafs?: MediaFsLike;                                                                      // runtime's MediaFs (§5.5) satisfies it
  connections: Record<string, { fetch(relativePath: string, init?: { method?: string; headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal }): Promise<Response> }>;
  session: { id: string; alias: string; data: { get<T = unknown>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> } };
  memory?: import("@wzrdtech/zap-memory").MemoryService;                                     // heavy only; content methods allowed here (in-VM)
  signal: AbortSignal;
  reportProgress(p: { phase: string; percent?: number; note?: string }): Promise<void>;
  live: boolean;                                                                              // false = plan-only turn; a side-effecting tool is never invoked when false
  log(entry: Record<string, unknown>): void;                                                  // redacted (C24) before it leaves the VM
}
export interface ToolDefinition<I extends ToolInput = ToolInput, O = unknown> { name: string; description: string; input: JsonSchema; readOnly?: boolean; estimate?(input: I): { unit: MeterUnit; qty: number; sku?: string }[]; run(ctx: ToolContext<I>): Promise<O>; }   // run/estimate are declared method-style, so every Tool<I, O> is assignable to AnyTool
export interface Tool<I extends ToolInput = ToolInput, O = unknown> { readonly __brand: "Tool"; readonly definition: ToolDefinition<I, O> }
export type AnyTool = Tool<ToolInput, unknown>;
export function defineTool<I extends ToolInput = ToolInput, O = unknown>(def: ToolDefinition<I, O>): Tool<I, O>;
export function defineRecipeTool(slug: string, opts?: { extendCount?: number }): Tool<{ inputs: Record<string, string> }, { runId: string; status: string; quoteUsd: number }>;   // wraps a 0.3.1 Zap.md recipe; plan by default

export interface ConnectionDefinition { id: string; origin: `https://${string}`; methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[]; pathPrefix: `/${string}`; headers?: Record<string, HeaderValue>; sensitiveHeaders?: readonly string[]; timeoutMs?: number; }
export function defineConnection(def: ConnectionDefinition): Connection;
export interface McpServerDefinition { id: string; url?: `https://${string}`; command?: readonly string[]; headers?: Record<string, HeaderValue>; sensitiveHeaders?: readonly string[]; toolFilter?: { include?: string[]; exclude?: string[] }; sideEffecting?: readonly string[] /* MCP tool names plan-only must not call; default: none — MCP tools are treated as read-only */; }
export function defineMcpServer(def: McpServerDefinition): McpServerRef;
export function useSecret(name: string): SecretRef;                                           // mints an opaque ref; legal anywhere (agent render, connections.ts module scope, tools) — it is not a render hook and never throws HOOK_OUTSIDE_RENDER
export function bearer(ref: SecretRef): HeaderValue;

export function useInput(): AgentInput;
export function useModel(id: ModelId, opts?: { reasoning?: "low" | "medium" | "high"; maxOutputTokens?: number }): void;
export function useTool<I extends ToolInput, O>(tool: Tool<I, O>): void;
export function useMcpServer(id: string): void;
export function useSubagent(id: string, opts?: { maxTurns?: number }): void;
export function useSessionData<T = unknown>(key: string): T | undefined;                     // sync; snapshot taken before render
export function defineAgent(render: () => string, meta?: { id?: string; description?: string; skillsDir?: string }): Agent;
export function defineProject(p: { name?: string /* default: nearest package.json name */; agents: Record<string, () => Promise<{ default: Agent }>>; runtime?: string | import("@wzrdtech/core/runtime-spec").RuntimeSpec; aliases?: readonly string[] /* default ["development","production"] */ }): Project;
```

**Render guard** (`packages/agent-code/src/render/guard.ts`): `renderAgent(agent, frame)` installs a hook frame, patches `globalThis.fetch`, `setTimeout`, `setInterval`, `queueMicrotask` (throw `AGENT_RENDER_IO`), and shadows `process.env` with a throwing proxy for the duration of the call; a non-string return → `AGENT_RENDER_ASYNC` (Promise) or `AGENT_RENDER_TYPE`. The render hooks (`useInput`, `useModel`, `useTool`, `useMcpServer`, `useSubagent`, `useSessionData`) called outside a render throw `HOOK_OUTSIDE_RENDER`; `useSecret` and `bearer` are plain constructors of opaque refs and work anywhere. The frame collects `{ model?, tools: Map<name, Tool>, mcpServers: Set<id>, subagents: Map<id, opts> }` and returns `{ instructions, capabilities }`; when a render never calls `useModel`, `capabilities.model` falls back to the runtime's `Runtime.md gateway.{llm,model}` (`<llm>/<model>`), and if that is unset too the render fails with `AGENT_NO_MODEL`. `zap agent render` additionally prints `secretsBound[]` from the build manifest's `secretsReferenced` for the agent (secrets are bound at declaration time in `connections.ts`, not during a render). Rendering is pure and deterministic given `(input, sessionDataSnapshot)`, which is what `zap agent render` prints.

**Build** (`packages/agent-code/src/build/`): `esbuild` bundles `project.ts` + `agents/**` (ESM, `node24`, `external: ["@wzrdtech/*"]`), packs `agents/<id>/skills/**` into the deployment, writes `manifest.json` `{ project, agents: { [id]: { tools: [{name, readOnly, inputSchema}], connections: [{ id, origin, methods, pathPrefix, headerNames, sensitiveHeaderNames }], mcpServers: [ids], subagents: [ids], skills: [names], secretsReferenced: [names] } }, bundleSha, builtAt, pins }` — **no secret values, ever** — and runs the lint pass with these build errors: `ZAP_BUILD_SECRET_LITERAL` (a sensitive header whose value is not a `SecretRef`/`bearer(SecretRef)`), `ZAP_BUILD_ORIGIN_NOT_HTTPS`, `ZAP_BUILD_PROCESS_ENV` (`process.env` referenced anywhere under `agents/**`), `ZAP_BUILD_ASYNC_AGENT` (`async function` or `.then` in an agent render), `ZAP_BUILD_UNDECLARED_SUBAGENT`, `ZAP_BUILD_UNDECLARED_MCP`. `zap agent lint` runs the same pass without bundling.

**Deployments and aliases** (`packages/runtime/src/agentd/agents/`): a deployment is immutable and content-addressed: `/zap/deployments/<bundleSha>/{bundle.mjs, manifest.json, skills/}`; `/zap/aliases/<alias>` holds `{ deploymentId, movedAt, by }`. `zap deploy` (no positional) = build → lint → `fs.write` the deployment into the VM → `POST agentd /v1/deployments` (registers) → move `development`; `--watch` repeats on file change (debounced, one machine start never consumed — the VM stays up); `--alias production` copies the `development` pointer's `deploymentId` into `production` (the bundle is already immutable; nothing is rebuilt). Alias moves are journaled in `/zap/aliases/history.jsonl` and mirrored as metadata to `deployments` (§8).

**Sessions and turns**: `/zap/sessions/<sessionId>/{meta.json (agentId, deploymentId, alias, createdAt, payer, lastLive — `live` is a per-turn input carried on `turn.started`; a session may mix plan-only and live turns), turns.jsonl (the §5.12 events, append-only), messages.jsonl (the `TurnMessage` transcript the executor replays — `ExecuteStepOptions.history` is this file, windowed by the host to the model's context), data.json (session data KV; on heavy, keys are also mirrored into OpenViking under viking://user/<tenant>/sessions/<id>/)}`. `POST agentd /v1/sessions {agent, alias}` resolves alias → deploymentId **once** and pins it; `POST /v1/sessions/{id}/turns {text|payload, live}` runs the turn loop (§4.12) and streams SSE; `GET /v1/sessions/{id}` returns meta + last event; `GET /v1/sessions` lists. Resume = same endpoint with an existing id; the host reads `messages.jsonl` (and `turns.jsonl` for `GET`), the client sends only the new input. Concurrency: one turn at a time per session (`SESSION_BUSY` otherwise). Managed mode exposes the same shape at `packages/cloud` `/v1/sessions/*` (proxy + metadata mirror; the transcript never leaves the VM except through `zap session --json` for the owning principal).

**Secrets** (`packages/runtime/src/secrets/`): `interface SecretResolver { resolve(ref: SecretRef, scope: { project: string; agentId: string; alias: string; connectionId: string; origin: string; method: string; path: string }): Promise<string>; gatewayKey(route: string): Promise<string> }`. `resolve` serves connections **and MCP servers** (an MCP server's scope is `{ connectionId: id, origin: new URL(url).origin, method: "POST", path: new URL(url).pathname }`; `command`-style servers get their headers as env of the child process through the same check). A header is *sensitive* when its name is `Authorization`, `Cookie`, `X-API-Key`, is listed in `sensitiveHeaders`, **or its value is a `SecretRef`/`bearer()` — sensitive by construction**; only sensitive headers are ever resolved. Both implementations check the deployment manifest first (connection or MCP server declared, origin/method/pathPrefix match, header sensitive) and throw `SECRET_SCOPE_DENIED` before looking anything up (C15). `gatewayKey(route)` is a separate namespace (`gateway:<route>`, e.g. `gateway:openrouter`) readable only by `gateway.core` (the resolver checks `ctx` identity) — never by tools, connections or renders — and is how the in-VM gateway gets BYOK keys (§5.7 `KEY_UNAVAILABLE` until synced). `secrets.env` (self-host): values live in `zap-agentd` memory, delivered by `zap secret set` / `zap deploy` over the token-gated route (`POST /v1/secrets/sync`, never written to disk, so never in a snapshot) and re-synced by the CLI on its next contact after a VM restart; until then a connection fails closed with `SECRET_UNAVAILABLE`. Optional `--persist-env` stores them as per-box `env` (`ZAP_SECRET_<NAME>`, provider-side, not snapshotted). `secrets.control-plane` (managed): `POST ZAP_API_URL/v1/runtimes/{id}/secrets/resolve` with `RUNTIME_TOKEN` + the scope; the control plane applies the same manifest check against the deployment it recorded and returns the value for that request only; values come from the existing Supabase vault (`user_secrets`, key `agent:<project>:<agentId>:<alias>:<NAME>`). `connections.<id>.fetch` attaches the resolved header to that single request and discards it. The redaction layer (C24) holds a rolling set of resolved values to scrub from any log line or `--json` payload for the lifetime of the process.

**Event union** (extends `RunEvent` from §5.6): `session.started { agent, alias, deploymentId } | turn.started { turn, live, payer } | render { instructions, capabilities } | text.delta | tool.call | tool.result { usage? } | tool.planned { tool, input, estimate } | approval.required | subagent.started | subagent.completed | turn.completed { usage: { tokens, lines } } | turn.failed { code, remediation }`. `zap session --json` emits exactly these as JSONL; `--verbose` prints `render` and `tool.planned` in text mode.

**Weight and harness placement**: `harness.zap` is `inProcess` and mounted on every med+ runtime; `agents.host` starts with `zap-agentd serve` in `zap-med` and `zap-heavy*` templates (`units/zap-agentd.service` gains `--serve-agents`). A heavy runtime with a named harness (e.g. Hermes) runs both: `zap session` talks to agent-code deployments, `zap runtime exec --prompt` talks to the named harness. The Eve Studio agent can call a deployed agent through `packages/agent/src/zap-bridge.ts` (`zapAgentTool("transcode@production")` → an Eve tool that opens a session over `/v1/sessions`; lives in the Eve package so `@wzrdtech/zap-agent` never depends on `eve`).

## 6. Milestones

Each milestone lists Tasks (imperative, with paths) and Acceptance (checkboxes a human or a Devin session ticks with evidence). A milestone is done only when every box is ticked **and** §12 passes. Milestone IDs are stable; child sessions (§13) reference them.

### Z0 — Audit, package layout, CI spine

Tasks

- Add workspaces `packages/{kernel,sandbox,memory,runtime,agent-code,templates,cloud}` with `package.json` (`@wzrdtech/zap-kernel`, `@wzrdtech/zap-sandbox`, `@wzrdtech/zap-memory`, `@wzrdtech/zap-runtime`, `@wzrdtech/zap-agent`, `@wzrdtech/zap-templates`, `@wzrdtech/zap-cloud`; `"type":"module"`, `engines.node 24.x`, `tsconfig.build.json` copied from `packages/core`, build via `tsc` + `scripts/rewrite-dts-imports.mjs`). Extend root `build:packages` in dependency order: core → kernel → sandbox → memory → providers → agent-code → runtime → templates → cloud → agent (agent-code sits below runtime, §5.12). Add `agents/` and `project.ts` to the root `tsconfig.json` `include` so the canonical agent (§4.12) type-checks from Z0 against A's typed `@wzrdtech/zap-agent` stubs (`packages/agent-code/src/index.ts` exporting the §5.12 signatures with `NOT_IMPLEMENTED` bodies; K replaces them).
- Add typed subpath exports: `@wzrdtech/zap-runtime` publishes `./sandbox/*`, `./memory/*`, `./harness/*`, `./pay/*`, `./meter/*`, `./gateway/*`, `./mediafs/*`, `./lanes`, `./agentd/*` with `.d.ts`; `packages/cli/package.json` `exports` re-maps `@wzrdtech/zap/sandbox/box` etc. to those (JS re-export files + copied `.d.ts`) without changing `bin/zap.js` behaviour.
- Version plan: **every** `@wzrdtech/*` workspace (including `core`, `providers`, `agent`, `zap-mcp`) moves to `5.0.0-alpha.N` together (additive changes only in `core`/`providers`); internal dependencies use exact workspace versions; the Z0 smoke `npm pack`s every workspace and installs the tarball set into a clean Node 24 container.
- Freeze the regression set **as fixtures, not as test files**: `npm run test:regression` = `npm run test:cli` (world-cup-entrance validate + plan) + `tests/zap-recipes-golden.test.ts` + `tests/sandbox-selector.test.ts` + `tests/sandbox-contract.test.ts` + a new `tests/regression-fixtures.test.ts` that diffs `--json` outputs of `validate`, `run` (plan), `inspect`, `gallery` against `tests/fixtures/regression/*.json` **after normalization** (`runId`, timestamps, absolute paths, and the CLI version string are replaced by placeholders before comparison; `docs --json` is excluded because its text embeds the version). `tests/mcp-server.test.ts` and `tests/cli-acceptance.test.ts` are **extend-only** (superset assertions: `toEqual(expect.arrayContaining(...))`, version read from `package.json`), edited by G and C respectively, and are not part of `test:regression`.
- `vitest.config.ts`: `include: ["tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"]`; add `npm run test:kernel`, `test:sandbox`, `test:memory`, `test:runtime`, `test:cloud` per-package scripts.
- Typed stubs (integration files, A-authored): `packages/runtime/src/{sandbox/box,memory/openviking,harness/hermes,pay/x402}.ts` exporting correctly typed `PluginFactory`s whose `apply` throws `NOT_IMPLEMENTED`, `packages/agent-code/src/index.ts` (the §5.12 signatures, bodies throw `NOT_IMPLEMENTED`), `agents/transcode/agent.ts` (§4.12 canonical agent, byte-identical) + the §4.12 companion files (`agents/transcode/connections.ts`, `agents/researcher/**`, `project.ts`, verbatim), `packages/core/src/meter.ts` (`MeterUnit`, additive), plus `packages/runtime/src/testing.ts` (`fakeSandboxService()`, `fakePayService({ mode })`, `fakeMeterService()`, `fakeGateway(fixture)`, `fakeAgentd()` — an in-process zap-agentd over the fake sandbox (`ZAP_ALLOW_FAKE_SANDBOX=1`, which the executor's mount guard accepts) implementing the route-module type A also writes at Z0, `packages/runtime/src/agentd/routes.ts` (`{ prefix: string; mount(app, ctx): Disposer }`, an integration file B's `serve.ts` implements against), so E's `/v1/runs` and K's `/v1/sessions` mount on it) so C, D, E, G, K can test gates, renders and CLI plumbing before B/H land.
- Document the CLI command-registration convention here (implemented by C in Z3): `packages/cli/src/commands/<domain>/*.js` export `{ name, run, help, jsonSchema }`; the dispatcher auto-discovers them; the `commands[]` list and help text are generated from the discovered set.
- `tests/docs-snippets.test.ts` (type-checks fenced ```ts blocks tagged `zap-snippet` under `docs/**`) lands here, empty-passing, so every later session's docs page is checked on arrival.
- `tests/no-platform-names.test.ts` (C3) lands here too: a grep over the public surfaces — `docs/**`, `public/llms.txt`, `README.md`, `CHANGELOG.md`, every workspace `package.json` `description`, every `packages/*/src/**` JSDoc line and error-message string, every `packages/cli/tests/fixtures/*.json`, `skills/**/SKILL.md`, `packages/templates/**/{README.md,AGENTS.md,template.json}`, and Studio copy under `app/**` — for the deny-list kept in `tests/fixtures/platform-names.txt`, seeded with exactly these case-insensitive tokens: `cordis`, `cordiverse`, `opencomputer`, `open-computer`, `diggerhq` (sessions may add agent-platform names, never the names of hosted harnesses, sandbox providers, LLM providers or memory services that Zap explicitly integrates — those are product surface, not prior art). It passes on day one and stays in `npm test`; the allowed exceptions are `goal.md`, `docs/verify-log.md`, and comments under `packages/kernel/src/internal/`.
- CI workflow `.github/workflows/ci.yml`: `npm ci` → `typecheck` → `test:regression` → `test` → `cli -- doctor --json` (exit 0 in CI with `payer: "missing"` because payer is `required:false`) → `evals` (dry-run). Live suites (`RUN_HOSTED_SANDBOX_TESTS`, `EVALS_LIVE`) are separate manual workflows.
- Write `docs/verify-log.md` skeleton with the 16 verify items from §3 (items 5 and 9 pre-filled). Add the §0 audit table to `CHANGELOG.md` under `5.0.0-alpha.0 — Unreleased`.
- Bump every workspace `package.json` to `5.0.0-alpha.0` (integration files). `packages/cli/src/cli.js` keeps its hard-coded string until C (Z3) makes it read `package.json`.

Acceptance

- [ ] `npm run build:packages` succeeds with the seven new typed packages; `npm run typecheck` green; the §5.2 north-star file compiles as `packages/runtime/tests/fixtures/north-star.ts` and the §4.12 canonical agent compiles at `agents/transcode/agent.ts`, both against the stubs.
- [ ] `npm run test:regression` green; `tests/fixtures/regression/*.json` committed and identical to normalized 0.3.1 outputs.
- [ ] `npm pack` of every workspace + install into a clean Node 24 container → `zap --help` runs and all 28 existing commands still run (the printed version is aligned in Z3).
- [ ] CI runs regression before anything else and fails the job on drift.

### Z1 — Kernel (`@wzrdtech/zap-kernel`)

Tasks

- `packages/kernel/src/{context,fiber,effect,service,events,loader,errors,index}.ts` implementing §5.2 exactly. No dependency on Cordis (C3). Zod for `Plugin.schema`.
- Errors: `SERVICE_MISSING`, `PLUGIN_FAILED`, `CYCLE_DETECTED` (provider-precedence graph must be acyclic), `DISPOSED`.
- `loader.ts`: `reconcile(desired, running)` keyed by stable entry id (`plugin.name` + config hash or explicit `entryIds`), returning `{ mounted, updated, unmounted }`.
- README `packages/kernel/README.md` with the public Context API, lifecycle diagram, and the "not a security boundary" note.

Acceptance (all in `packages/kernel/tests/`)

- [ ] `effect.test.ts`: disposers run in reverse registration order; async disposers awaited; a throwing disposer does not skip the rest and is reported.
- [ ] `fork.test.ts`: fork isolates effects from parent; disposing the child leaves parent services ACTIVE; disposing the parent disposes children first.
- [ ] `dispose.test.ts`: dispose is idempotent; operations after dispose throw `DISPOSED`.
- [ ] `inject.test.ts`: inject waits; missing service fails closed on dispose with `SERVICE_MISSING`; provider replacement cycles consumers UNLOADING→LOADING with the committed view.
- [ ] `reconcile.test.ts`: config reconcile mounts/unmounts only the delta; plugin order permutations yield identical fiber trees.
- [ ] `leak.test.ts`: 1 000 fork/dispose cycles; `process.getActiveResourcesInfo()` identical before/after; heap delta < 5 %.
- [ ] `events.test.ts`: emit/parallel/serial/waterfall semantics, including waterfall short-circuit.
- [ ] `createRuntime` + `definePlugin` exported; typecheck + vitest green with zero network.

### Z2 — Sandbox contract, Box adapter, fake adapter, Eve bridge, `zap-light`

Tasks

- `packages/sandbox/src/contract.ts` (§5.3) — **session B owns this file; adapters may not edit it.**
- `sandbox.core` plugin (`packages/sandbox/src/core.ts`: registry, `acquire` dispatch, `default`), `adapters/fake/` (in-memory fs + exec stub honoring `cwd`, `env`, `timeoutMs`, snapshot/fork/stop/resume/ports emulation; mounts only with `ZAP_ALLOW_FAKE_SANDBOX=1`), `adapters/docker/` (local dev on `dockerode`; no Eve imports — C29) and `adapters/local/` (the in-VM kernel's own machine, §4.1: `acquire()` returns the single handle for this VM; lane-less `exec` = `bash -lc` under the daemon's own `systemd-run` confinement (no allowlist — it is the same trust as `/v1/exec`), `exec` with `opts.lane` = `ctx.lanes.run(...)` (allowlist + isolation record; `inject: ["sandbox","meter","lanes"]`, the `LaneExecutor` type comes from the contract so there is no runtime import); `fs` is rooted at `/zap/fs`; `snapshot/fork/stop/resume/host` report `capabilities: false` — it never calls a provider; mounts only when running under `zap-agentd serve` (`RUNTIME_TOKEN` or `ZAP_SELFHOST_TOKEN` present) or with `ZAP_ALLOW_LOCAL_SANDBOX=1` (CI, tests)).
- `adapters/box/{client,adapter,webhook,capabilities}.ts` per §5.3.2 on `@asciidev/box-sdk` (pin the version in `packages/sandbox/package.json`; keep `@asciidev/eve-box` as a peer for the bridge). `capabilities()`: `{ snapshot:true, fork:true, stop:true, resume:true, ports:true, privatePorts:true, desktop:true, ssh:true, docker:true, kvm:false, gpu:false, isolation:"vm", sizes:["small","default","large"], maxCommandSeconds: <verify item 3> }`.
- Lane executor daemon `packages/runtime/src/agentd/` (`zap-agentd`): HTTP on **`0.0.0.0:8722`** (`/v1/health`, `/v1/exec`, `/v1/files`, `/v1/lane`, `/v1/capabilities`), bearer `RUNTIME_TOKEN` (or `ZAP_SELFHOST_TOKEN` on a VPS), lanes per §4.6, allowlist, `systemd-run` confinement on Box, `msb` on KVM. Unit `units/zap-agentd.service` (`NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=/zap /home/user/.zap`). Unit `units/zap-host.service` (oneshot, re-runs the in-VM `host 8722 --private` at boot/resume with the airv2 retry loop). The Box adapter prefers the `/commands` API for exec/files and uses the hosted `zap-agentd` route only for streaming lanes and the macOS/Namespace bridge.
- `packages/runtime/src/redact.ts` + `packages/runtime/tests/redact.test.ts` (canary classes: Box key, hosted `_token`, `desktopUrl`, `RUNTIME_TOKEN`, provider keys, Thirdweb/CDP/MPP secrets, bridge tokens) — lands here because every later session logs through it.
- `packages/templates/zap-light/{template.json,bake.sh,doctor.sh,units/,README.md}`: bake per §4.7 light column; `bake.sh` is idempotent, pins versions, writes `~/.zap/capabilities.json` and `~/.zap/template.json`; `doctor.sh` prints `PASS/FAIL` lines (airv2 `verify-box.sh` style) for ffmpeg, node, python, bun, docker, chrome, playwright, zap CLI, zap-mcp, zap-agentd active, `/zap/fs` writable, hosted route absent-or-private. Add `zap-light-ffmpeg`, `zap-light-code` as config aliases and `zap-light-browser` as an overlay (`bake.sh` installs `browser-use` CLI pinned + `box-browser-use` wrapper pattern from airv2).
- `infra/box/build-template.sh <template>`: create box (`type default`, `ttlSeconds 7200`) → upload `packages/templates/<name>` (files API) → run `bake.sh` via `/commands` (detached + `/events` if > 600 s) → `doctor.sh` → warm (stop → resume → doctor → stop) → `box snapshot <id> <name>` (replacing the prod snapshot of the same name in place) → record `{ name, boxId, snapshotId, sha256 of template dir, bakedAt, pins }` in `packages/templates/registry.json` and `docs/verify-log.md`. `infra/box/verify-template.sh` creates a box `from` the snapshot with `noEnv:true`, runs `doctor.sh`, stops it (and removes it when verify item 13 confirms an API delete; otherwise it is tagged `zap-verify` for the manual sweep).
- Eve bridge (§5.3.6) in `packages/sandbox-adapters/src/index.ts`; `agent/sandbox/sandbox.ts` unchanged.
- `docs/providers/box.md`, `docs/templates/zap-light.md` (the cross-provider isolation matrix `docs/isolation.md` is generated by F in Z7).

Acceptance

- [ ] `packages/sandbox/tests/contract.test.ts` green on `fake`, `local` (`ZAP_ALLOW_LOCAL_SANDBOX=1`, `/zap/fs` remapped to a `tmpdir`, a fake `lanes` service for the lane cases, real `bash -lc` for lane-less exec) and `docker` in CI; on `box` under `RUN_HOSTED_SANDBOX_TESTS=1 BOX_API_KEY=…` (manual workflow), including snapshot → fork → read-back, stop → resume persistence, private host URL, and the C24 log assertion.
- [ ] `packages/sandbox/tests/box.test.ts` (recorded HTTP fixtures with secrets stripped): `noEnv:true` on every create/fork body; per-box env keys ⊆ the §7 per-runtime list; missing `RUNTIME_TOKEN` in env throws before any request; `stop` never sends `force`; both 429 codes → `SandboxStartLimit`; create/fork replay (three calls, same `idempotencyKey`) → one request (Upstash `SET NX` memory mode) + `Idempotency-Key` header present; after `resume()` the adapter re-reads every hosted port and the new token never appears in the log buffer.
- [ ] `packages/runtime/tests/redact.test.ts` green for every canary class; `packages/sandbox/tests/eve-bridge.test.ts` proves `resolveSandboxBackend` parity for `box`, `docker`, `fake`.
- [ ] `tests/sandbox-selector.test.ts` and `tests/sandbox-contract.test.ts` (0.3.1) green with superset-only edits; `"mystery"` still throws with the full backend list.
- [ ] `zap-light` snapshot exists on the Box account; `infra/box/verify-template.sh zap-light` passes; `docs/verify-log.md` has verify items 1–3, 9 (`@asciidev/eve-box` fork/snapshot support — decides whether the bridge wraps the SDK directly), and 13–15 (deletion/webhooks, idempotency header + 429 codes, hosted-route API) answered with evidence.
- [ ] `zap-agentd` lane run: `{ lane:"ffmpeg", cmd:["ffprobe","-v","error","-show_format","in.mp4"] }` succeeds under `systemd-run` on Box and records `isolation:"process"`; a disallowed binary returns exit 126 without executing.
- [ ] `doctor --json` lists `box` first-party with the capability row above; `airv2 lib/box` method names map 1:1 (table in `docs/providers/box.md`).

### Z3 — CLI

Tasks

- Split `packages/cli/src/cli.js` into the Z0 convention (`src/commands/<domain>/*.js`, auto-discovered; `cli.js` stays the dispatcher and reads its version from `package.json`; `scripts/sync-cli-docs.mjs` regenerates the help text from the discovered set). C owns every legacy command file (init, new, validate, lint, run, status, dev, studio, add, docs, finalize, gallery, search, import, skills, doctor, embed, info, inspect, keys, login, logout, deploy, mcp, upgrade, improve, feedback, telemetry) plus the new `compose`, `runtime`, `fs`, `media`, `ffmpeg`, `template`, `mcp --http` and the shared `--json`/error/exit-code plumbing; the `memory` (D), `pay` (H), and `harness` (I) command directories are written by those sessions against C's registration API. `zap login --provider …` stays C's command file and delegates to H's `@wzrdtech/zap-runtime/auth/device-auth`. `.zap/auth.json` becomes namespaced — `{ apiToken, apiUrl, managed: { sessionKey, wallet, expiresAt } }` — so legacy `zap logout` clears only `apiToken` and `zap pay logout` (H) clears only `managed`. `commands/deploy/index.js` (C) keeps the 0.3.1 positional `deploy <Zap.md>` path byte-for-byte and dispatches the flag-only form (`--watch`, `--alias`, `--agent`, `--all`) to K's `commands/deploy/agent.js`; until K lands the flag form prints `AGENTS_NOT_AVAILABLE` with the Z12 pointer. Every command: `--json` fixture in `packages/cli/tests/fixtures/<command>.json`.
- `packages/cli/tests/disposal.test.ts`: after `zap runtime down` (fake provider) the CLI process's `process.getActiveResourcesInfo()` equals the pre-`up` baseline (§12.8).
- `zap compose`: reads `Runtime.md` (`@wzrdtech/core/runtime-spec`) or `zap.config.ts` (loaded via `node --experimental-strip-types` or a tiny esbuild step — pick one, pin it); resolves through `loadRuntimeConfig` → prints tree; `--dry-run` adds `meter.quote`.
- `zap runtime *`, `zap harness *`, `zap pay *`, `zap memory *`, `zap fs *`, `zap media *`, `zap ffmpeg *`, `zap template *`, `zap doctor --json`, `zap mcp --http`.
- Plan-only enforcement (C25 semantics): `run --live`, `runtime exec --prompt` (a prompt is spend), `ffmpeg --live`, and any `--live` path call `ctx.pay.status()`; `missing` → `ZapRunError{code:"PAYER_MISSING"}` with remediation `["zap keys add <provider> …", "zap login --provider claude-code", "zap pay login --managed"]`; with a payer and no `--live`, side-effecting tools are quoted not executed. `zap ffmpeg` and `zap run` are dry-run by default everywhere.
- Update `docs/reference/cli.md`, bundled `packages/cli/resources/docs/*` via `npm run docs:sync`, `skills/zap-cli/SKILL.md`, and `tests/docs-sync.test.ts`.

Acceptance

- [ ] `tests/cli-acceptance.test.ts` extended (superset): init → validate → new → run (plan) → status → `compose --dry-run --json` → `doctor --json` (exit 0, `payer:"missing"`) → `pay status --json` (`missing`) in a clean project with no network; `packages/cli/tests/disposal.test.ts` green.
- [ ] `packages/cli/tests/compose.test.ts`: `Runtime.md` and `zap.config.ts` produce identical trees; invalid weight/provider rejected with structured errors; `--dry-run` never calls `acquire` (spy).
- [ ] `packages/cli/tests/live-refused.test.ts` (uses A's `testing.ts` fake payer, no dependency on H): `zap run <Zap.md> --live` with the fake payer in `missing` mode → exit 1, JSON `code:"PAYER_MISSING"`; with the fake payer in `byok` mode → passes the gate (provider call mocked); once H merges the same test runs against the real `pay.byok` with `FAL_KEY` set.
- [ ] `npx @wzrdtech/zap compose --help` output is stable and committed as a fixture; `zap help` lists new commands without removing old ones.
- [ ] `npm run docs:sync && npm test` — `docs-sync` green.

### Z4 — Namespace, self-host zap-VM, host environments

Tasks

- `adapters/namespace/` per §5.3.3; `infra/namespace/create-instance.ts`; image build `infra/namespace/Dockerfile.zap-heavy` produced from `packages/templates/<name>/bake.sh` (same script, `TARGET=namespace`); ingress publish for `8722` (bridge, auth) and harness ports (open, service auth); `x-nsc-ingress-auth` token cache (5 min).
- Environment profiles `packages/runtime/src/environments.ts` ported from airv2 `lib/compute/environments.ts`: `ubuntu` (default), `omarchy` (Box; overlay `packages/templates/env-omarchy/` ports airv2 `template-omarchy/{setup.sh,packages.omarchy,omarchy-desktop.service,arch-root.service,monitors-headless.lua}`), `macos` (Namespace native; `packages/templates/env-macos/` ports `template-macos/{bootstrap.sh,setup.sh,bridge.py}` → `infra/namespace/bridge/`; LaunchAgents `tech.wzrd.zap.<service>`; `restartCommand()` = `systemctl` vs `launchctl kickstart`).
- Self-host: `infra/self-host/setup.sh` (Hetzner/any KVM host: probe `/dev/kvm`; install `microsandbox@0.6.15` (`curl -fsSL https://install.microsandbox.dev | sh`), optional Rust + `hyperlight-wasm` host build for `wasm` lanes; install Node 24 + `@wzrdtech/zap` + `@wzrdtech/zap-runtime`; `zap-agentd.service` on `0.0.0.0:8722` behind TLS (Caddy) + `ZAP_SELFHOST_TOKEN`; ufw allow 443 only). `adapters/selfhost/` + `adapters/microsandbox/`; the `wasm` lane isolation (`packages/runtime/src/lanes/hyperlight.ts`) documents `files: host callbacks`.
- `capabilities.json` writer shared by all bake targets; `doctor` shows `isolation` per lane.
- Docs: `docs/providers/{namespace,selfhost,microsandbox,hyperlight}.md`, `docs/templates/{env-omarchy,env-macos}.md`, verify items 5–7 in `docs/verify-log.md`.

Acceptance

- [ ] Conformance suite green on `selfhost` (against a real KVM VPS, manual workflow) and on `namespace` Linux (manual) with `kvm:true`; `packages/runtime/tests/lanes.test.ts` (against the VPS, manual) records `isolation:"microvm"` for the ffmpeg lane and `"hyperlight-wasm"` for a WASM `hello` lane.
- [ ] `packages/sandbox/tests/namespace.test.ts` (recorded): per-instance env asserts `TENANT_ID`/`RUNTIME_ID`/`RUNTIME_TOKEN`; bridge requests carry both `x-nsc-ingress-auth` and `X-Zap-Bridge-Token`; `IssueIngressAccessToken` goes to `NAMESPACE_IAM_API`; RPCs not yet confirmed by verify item 5 are feature-flagged and reported in `doctor` as `unverified`.
- [ ] A dry-run ffmpeg lane request submitted directly to `zap-agentd` on the VPS (`POST /v1/lane {dryRun:true}`) returns the argv + estimate without executing; a live one executes under `msb` and stops the microVM (no `zap runtime up` dependency here — that end-to-end lands in Z6).
- [ ] `env-omarchy` applied over `zap-light` boots the headless Hyprland unit and its `doctor.sh` passes (manual); `env-macos` bootstrap reaches `bridge /v1/health ready:true` (manual, Namespace early access — marked `comingSoon` in `doctor` if quota is absent, never silently skipped). Their use over `zap-heavy-*` is verified in Z10.
- [ ] Verify items 5–7 answered with evidence; `docs/providers/hyperlight.md` states plainly what Hyperlight does and does not run.

### Z5 — Memory

Tasks

- `packages/memory/src/{contract,fake,openviking,mem0,zep,index}.ts` per §5.4.
- `openviking`: `ovctl.ts` (TypeScript port of airv2 `ovctl.py`: `ensure | status | add-resource | rm | reindex | export`), `units/zap-openviking.service`, `ov.conf` renderer, MCP registration helper for each harness `mcpConfig` format (Hermes `config.yaml mcp_servers.openviking.url`, OpenClaw `mcp.servers`, OpenCode `mcp.<name>{type:"remote",url}`, Open Interpreter `[mcp_servers.openviking] url`, Cursor `.cursor/mcp.json`, Pi/prime via extension, fx `/mcp add --transport http`).
- Bake fragment `packages/templates/zap-heavy/bake.d/40-openviking.sh` (owned by D; sourced by I's `bake.sh`): `uv venv ~/.zap/memory/openviking/venv --python 3.12`, `uv pip install 'openviking[local-embed]==<pin>' 'openviking-sdk==<pin>'`, `chmod 700`, `.boxignore` for caches, unit install.
- `mem0`/`zep` adapters + `consent` gate in `Runtime.md`.
- `zap memory *` commands; `docs/memory.md`, `docs/providers/{openviking,mem0,zep}.md`.

Acceptance

- [ ] `packages/memory/tests/contract.test.ts` green on `fake`; opt-in on `openviking` (docker-compose service in `packages/memory/tests/docker/`), `mem0`, `zep` with keys.
- [ ] `dispose.test.ts`: `wipeSession` removes session-scoped items and keeps durable tenant memory; `export` streams every item (I6).
- [ ] OpenViking is bound to `127.0.0.1:1933` only (test greps `ov.conf` and asserts no `0.0.0.0`); memory bytes never appear in control-plane logs (`redact` test with a canary string).
- [ ] `memory.openviking` is default-on in the `heavy` profile and absent from `light` unless `Runtime.md` asks; Mem0/Zep refuse to mount without `consent: true`; a `MemoryService` instantiated in `packages/cloud` throws `MEMORY_CONTENT_OFF_VM` for content methods.
- [ ] The MCP-registration helper produces a correct config fragment for every harness `mcpConfig` format (unit test with fixtures per format); the in-template check `mcp-openviking` is ticked in Z10 when the templates exist.

### Z6 — Gateway, media FS, ffmpeg presets (`zap-med`)

Tasks

- `packages/runtime/src/gateway/{index,routes/{openrouter,ai-gateway,openai,anthropic,xai,gmi}.ts,media.ts,router.ts}`: `gateway.core` wraps `lib/llm-route.ts` semantics (route ids kept: `gateway` = Vercel AI Gateway) and `@wzrdtech/providers` (`getProviderAdapter`, `priceGeneration`, `listModelRates`). Add `xai` (`XAI_API_KEY`, models `grok-4*`) and `replicate` (`REPLICATE_API_TOKEN`; adapter in `packages/providers/src/replicate.ts` following `fal.ts` shape, added to `providerAdapters` and `zapProviderSchema` **as an additive enum member** — confirm `tests/zap-parser.test.ts` still passes). Deterministic router = existing `lib/providers/router.ts` logic moved into the package with a shim left in `lib/`.
- `mediafs/` per §5.5 with sidecar zod schema `mediaSidecarSchema` and a JSON-schema snapshot test.
- `ffmpeg/presets.ts` + `ffmpeg/estimate.ts` (probe-based CPU-seconds estimate) + lane integration; presets: light set + `stitch`, `overlay`, `gen-media post`.
- `harness.zap` (`packages/runtime/src/harness/zap.ts`, owned by E) — two exports, one file: (a) the **executor**, the §5.6 `ZapExecutor.executeStep(ctx, caps, opts)` — steps 3–5 of the §4.12 turn loop as one model call plus its tool calls over `ctx.llm` and a provided `StepCapabilities`, honoring C25 plan-only (side-effecting tools → `tool.planned`; `readOnly` tools and `live` turns → executed through `opts.toolContext.sandbox`), dispatching subagent calls to `opts.delegate` (K's host implements it; E never forks), calling MCP tools through `opts.mcp`, emitting `StepEvent`s through `opts.onEvent`; the model sees exactly `caps.tools` (+ the MCP tools of `caps.mcpServers`) — the built-in lane/fs/mediafs/ffmpeg-preset tools are ordinary `Tool`s that only the `/v1/runs` static capability set includes, never implicitly added to an agent's render (§4.12); provided as the in-VM `executor` service; (b) the **driver**, the caller-side `HarnessService` (`http-runs` against zap-agentd `/v1/runs`; `bake` no-op, `boot` = verify `zap-agentd.service` active, `health` = `/v1/health`). Two named factories so the role is explicit: `harnessZapExecutor()` (in-VM; refuses to mount unless the registered sandbox is `local`, or `fake` under `ZAP_ALLOW_FAKE_SANDBOX=1`) and `harnessZapDriver()` (caller kernel; refuses to mount beside `sandbox.local`); `compose()` picks by kernel. Plus `packages/runtime/src/agentd/runs.ts`: the in-VM `POST /v1/runs` + SSE route = `executeStep` in a loop with a static capability set, wrapped in `run.started … run.completed|run.failed`, checking `ctx.pay.status()` (`pay.delegated`) before the first model call. No model loop runs in the caller (§4.1). K (Z12) supplies the render step (1–2), sessions and deployments on top of the executor without changing the interface.
- Med harness manifests `packages/runtime/src/harness/{interpreter,fx}.ts` (owned by E; `minWeight: "med"`) and `packages/templates/zap-med/` (bake: light + gateway env allowlist + `/zap/media` dirs + presets manifest + optional `/zap/skills`), aliases `zap-med-genmedia`, overlays `zap-med-interpreter` (Open Interpreter native binary: `curl -fsSL https://www.openinterpreter.com/install | sh`, `~/.openinterpreter/config.toml` with `[mcp_servers]`, `interpreter app-server --listen ws://127.0.0.1:9000`, AGENTS.md), `zap-med-fx` (`curl -fsSL https://fx.sh/setup.sh | bash`, `~/.fx/settings.json`, `~/.fx/mcp.json`).
- `zap template create --from-run <runId>`: captures a run's `RunEvent`s + media sidecars into a `Zap.md` (existing `save_zap` compile path) and a `Runtime.md`.
- Docs: `docs/providers/{openrouter,ai-gateway,openai,anthropic,xai,gmi,fal,prodia,runware,replicate,vertex,aws}.md`, `docs/templates/zap-med*.md`, `docs/mediafs.md`.

Acceptance

- [ ] `packages/runtime/tests/gateway-dry-run.test.ts`: plan-only never calls a provider (fetch spy = 0 calls across every route/provider); `quote()` totals equal the 0.3.1 `planZapRun` estimate for the golden recipes (bit-for-bit).
- [ ] `packages/runtime/tests/router.test.ts`: deterministic router preserved — same inputs → same provider/model as `tests/provider-router.test.ts` fixtures; `PRICE_UNKNOWN` thrown in live, `usd:0`+warning in plan.
- [ ] `packages/runtime/tests/mediafs.test.ts`: content-addressed (same bytes → same path, `put` idempotent); sidecar JSON schema snapshot; `list` filters; `link` hardlinks into `/zap/fs`.
- [ ] `packages/runtime/tests/ffmpeg-presets.test.ts`: every preset dry-runs to a stable argv fixture; `estimateCpuSeconds` monotonic in duration; execution path only via the lane with `isolation` recorded.
- [ ] `zap-med` snapshot built + verified; `zap-med-interpreter` and `zap-med-fx` overlays pass `doctor.sh` (`interpreter --version`, `fx doctor`, MCP config contains OpenViking when memory is enabled).
- [ ] `packages/runtime/tests/harness-zap.test.ts` — (1) executor, in-process with fakes: `executeStep(ctx, caps, opts)` with a recorded LLM fixture, `fakeSandboxService`, and `pay.delegated` pinned from a test `{ live, payer }`: payer `byok`, `live:false` → the plan is returned with LLM token usage reported and the ffmpeg lane **quoted not executed** (`tool.planned` emitted, `usage.lanesExecuted === 0`); payer `missing` → `PAYER_MISSING` before any model call in **both** modes; payer `byok`, `live:true` → the lane executes (fake sandbox); a `readOnly` tool executes in both modes; an MCP tool from `opts.mcp` is listed and called; (2) route, `agentd/runs.ts` mounted on a test agentd (`testing.ts` `fakeAgentd()`): `POST /v1/runs` streams `run.started → … → run.completed` with the same fixture; (3) driver: `createRuntime({ weight: "med", plugins: [fakeSandboxService, fakePayService({ mode: "byok" }), harnessZapDriver()] })` + `RunSession.run({ prompt })` reserves through the fake meter, reaches the test agentd's `/v1/runs` (mounting `harnessZapExecutor()`) over the fake handle, relays the events unchanged and settles from `run.completed.usage`. Recorded as `packages/runtime/tests/fixtures/med-plan.jsonl` for J's eval. The CLI-driven form (`zap runtime up --from Runtime.md` → `zap runtime exec <id> --prompt …`) is ticked after C merges.

### Z7 — Remaining first-party sandboxes, GPU plugins, catalog stubs

Tasks

- `adapters/{e2b,daytona,cloudflare,microsandbox}` lifted onto the v5 contract (port 0.3.1 `e2b.ts`/`daytona.ts` drivers; new `cloudflare` on `@cloudflare/sandbox` with `createBackup/restoreBackup` as snapshot; `microsandbox` cloud + local).
- GPU plugin `adapters/modal/`: `purpose:"lane"` only, `gpu:true`, `capabilities.isolation:"container"`, pricing from `pricing.json` (`gpu_second` sku per GPU class); the lane dispatcher `packages/runtime/src/lanes/gpu.ts` (F may edit this one file) routes a lane there only when `Runtime.md.lanes` includes `gpu:<class>` or a media step declares `gpu` (C4). `runtimeSpecSchema.lanes` accepts `` `gpu:${string}` `` and `wasm`.
- Catalog stubs `adapters/catalog/{runpod,blaxel,freestyle,orgo,tensorlake,baseten}.ts`: manifest, docs page, `doctor` row `verified:false`, `acquire()` throws `CATALOG_STUB` with the docs URL. Runpod/Baseten have no sandbox product (verified) — documented as GPU/inference targets only; a Runpod Pods lane adapter is a later spec.
- The Cloudflare account (§3) is needed here for `adapters/cloudflare/` live tests, independent of the §11 control-API choice.
- `docs/providers/*.md` for each; capability matrix generated into `docs/isolation.md` from `capabilities()` (script `scripts/generate-capability-matrix.mjs`).

Acceptance

- [ ] Each first-party adapter passes `contract.test.ts` (fake-backed unit variant in CI; live variant opt-in with its key, skipping individually when absent).
- [ ] `doctor --json` lists every adapter with `tier: first-party | catalog`, `verified`, and the capability row; stubs are visibly `catalog-stub`.
- [ ] `packages/runtime/tests/lanes-gpu.test.ts`: a `Runtime.md` with `lanes: [gpu:L40S]` on the `heavy` profile routes exactly one lane to `modal` (spy) and everything else to the CPU sandbox; without the lane declaration `modal` never mounts.
- [ ] `scripts/generate-capability-matrix.mjs --check` is part of `npm test` (drift fails).

### Z8 — MCP, skills, agent-plugin, API store

Tasks

- `packages/mcp/src/server.js`: register the §5.10 tools (same `cliTool` shell-out; JSON schemas from `packages/cli/tests/fixtures`) through a tool-module convention `packages/mcp/src/tools/<domain>.js` (G owns all but `tools/agents.js`, which K adds in Z12 for `zap_agent_*`, `zap_deploy_agent`, `zap_session*`, `zap_secret_list`); add `--http` Streamable HTTP transport (`@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`) bound to `127.0.0.1` by default with `ZAP_MCP_TOKEN` bearer when non-loopback. Bump `ZAP_MCP_TOOLS` and `tests/mcp-server.test.ts`.
- `skills/{zap-runtime,zap-compose,zap-templates,zap-pay,zap-memory,zap-lanes}/SKILL.md`; regenerate `skills/skills-manifest.json` (`zap skills`); serve via `/api/skills`.
- Skill store in the VM: `/zap/skills/<name>/SKILL.md` contract = `packages/core/src/skill-manifest.ts` (frontmatter `name`, `description`, `version`, optional `metadata.zap.{weight,lanes,harnesses}`) validated by `zap skills check`; `skills.store` plugin symlinks/copies into each harness's `skillsDirs` at boot.
- API store (heavy): `apistore.context7` (registers `https://mcp.context7.com/mcp` with `CONTEXT7_API_KEY` in each harness `mcpConfig`), `apistore.open-connector` (self-hosted inside the VM: `git clone` pinned ref, `npm ci`, `OOMOL_CONNECT_*` env from per-box env, `zap-open-connector.service` on `127.0.0.1:3000`, MCP `http://127.0.0.1:3000/mcp`), `apistore.composio` (`@composio/core` entity = tenant id, hosted MCP session URL from the control plane — existing `lib/sprite-composio.ts`). Typed catalog `packages/runtime/src/apistore/catalog.json` (the ~80 catalog APIs from the brief with `{ id, name, kinds[], via: "composio" | "open-connector" | "context7" | "first-party" }`) rendered to `docs/catalog.md`.
- Agent-plugin packaging (§5.11): `.claude-plugin/plugin.json`, `docs/agent-plugin.md` (Claude Code, Codex, Cursor, OpenCode, Hermes, OpenClaw snippets), `public/llms.txt` regenerated by `scripts/generate-llms-txt.mjs`.

Acceptance

- [ ] `tests/mcp-server.test.ts` (superset): every tool in `ZAP_MCP_TOOLS` is registered, has annotations (`readOnlyHint` for plan/quote/list, `destructiveHint` for `live:true`), and `zap_keys_list` still masks; a `zap_runtime_exec` with `live:true` and the CLI's payer in `missing` mode (A's `testing.ts` fake via `ZAP_TEST_PAYER=missing`) returns `isError:true` with `PAYER_MISSING`.
- [ ] `packages/mcp/tests/http.test.ts`: HTTP transport refuses non-loopback binds without `ZAP_MCP_TOKEN`; stdio unchanged.
- [ ] `tests/zap-skills.test.ts` + `skills check`: manifest hashes match; every harness template's `skills/*/SKILL.md` validates against the contract.
- [ ] The API-store plugins produce correct MCP config fragments for every harness `mcpConfig` format (unit fixtures) and `apistore.open-connector`'s unit binds loopback only (config test); the in-runtime `doctor.sh` checks (`mcp-openviking`, `mcp-context7`, `mcp-open-connector`) are ticked in Z10; the catalog page lists every brief API with its `via`.
- [ ] `docs/agent-plugin.md` snippets are executed by `tests/agent-plugin-snippets.test.ts` (JSON validity + `npx @wzrdtech/zap mcp` resolvable).

### Z9 — Auth, pay, meter, cloud control API

Tasks

- `packages/runtime/src/auth/`: `byok.ts` (resolution order §5.7; `status()=byok` whenever `ZAP_PAYER_MODE=byok`; redaction), `device-auth.ts` (`zap login --provider claude-code` runs `claude setup-token` and stores `CLAUDE_CODE_OAUTH_TOKEN`; `--provider codex` runs `codex login --device-auth` or `--with-api-key` from stdin; `openai|anthropic|openrouter` = key from stdin/env), `managed.ts` (`zap pay login --managed`: thirdweb in-app/ecosystem wallet auth → SIWE-backed session via existing `lib/thirdweb-auth.ts`/`wallet-siwe.ts` → **scoped session key** {`maxValue` default `$5`, target = control API origin, expiry 24 h} stored 0600 in `.zap/auth.json`; principal `wallet:0x…`; verify item 16).
- `packages/runtime/src/meter/{index,pricing.json,units.ts,ledger.ts,balances.ts}`: units §5.7; Box skus `box.small|default|large` from `$0.018|0.036|0.072 /h`; Namespace unit-minutes; provider token prices pass-through from `modelRates` + `ZAP_MARGIN_BPS`; Upstash reserve/settle (port `lib/wzrd-cloud-meter.ts`, generalize key prefix `zap:meter:<day>:<principal>`; `ZAP_DAILY_CAP_USD` takes precedence, `WZRD_CLOUD_DAILY_CAP_USD` remains a read-only alias); idle sandbox-seconds billed to the runtime with `runId: null`; `balances` (§8) records the settle-vs-reserve difference per principal and the next `quote()` applies it; local JSONL ledger for BYOK (`.zap/ledger.jsonl`).
- `packages/runtime/src/pay/{byok,x402,client}.ts` + `packages/cloud/src/gate.ts` per §5.7: the `mppx` gate as Hono **middleware** on every live endpoint (no `/v1/pay/gate/*` prefix); `thirdweb/x402` facilitator default, `@coinbase/x402` alternate; x402 v2 + MPP; optional v1 shim behind `ZAP_X402_V1_SHIM=1` routing `X-PAYMENT` to `settlePayment`; receipts (§8); replay = Upstash `SET NX zap:gate:nonce:<id>`; human `Accept: text/html` gets a pay page (airv2 `payPage` pattern) that never embeds a token.
- **Managed gateway proxy** (the reason managed runtimes need no keys): `POST /v1/runtimes/{id}/gateway/llm/v1/chat/completions`, `/v1/responses`, `/v1/messages` (Anthropic-compatible), `POST /v1/runtimes/{id}/gateway/media/{provider}/submit|poll` — authenticated by the runtime's `RUNTIME_TOKEN`, routed through `gateway.core` with the tenant's managed keys held only in the control plane, metered per token/request against the current run's reservation, streaming SSE passthrough, C24 redaction. Each harness manifest's `managedGateway` entry points the harness at it at bake (Z10).
- `packages/cloud` (Hono): `GET /v1/health`, `POST /v1/runtimes` (compose → row), `POST /v1/runtimes/{id}/{up,down,exec,snapshot,fork}` (proxies the sandbox/harness contracts server-side; `exec --prompt` passes the gate in both modes and `exec` with a `command` does not, §5.7; C24 redaction), `GET /v1/runtimes/{id}/events` (SSE), the gateway proxy above, `POST /v1/pay/quote`, `GET /v1/meter/ledger`, `GET /v1/meter/balance`, `GET /v1/memory/{id}/status` + `POST …/forget` + `POST …/export` (consent-gated; no content routes), `GET /v1/templates` + `POST /v1/templates/{name}/publish` (registry rows, Blob/R2 tarball + sha256 — airv2 `release.sh` pattern), `GET /v1/sweep` (cron; `stop_after` sweeper; `Authorization: Bearer $CRON_SECRET`), `GET /v1/admin/ops` (protected counters: starts/hour, runtimes by state, settles/day + USD, `start_limit_reached` count, sweeper stops, gate rejections), and — only after verify item 13 — `POST /v1/sandbox/box/webhook`. Rate limits (Upstash sliding window): `POST /v1/runtimes` per principal, `/exec` per runtime, the gate per IP + principal. Adapters: `src/adapters/vercel.ts` (**default for v5**; mounted at `app/api/cloud/[...path]/route.ts`, Convex + Upstash + Blob, `vercel.json` cron) and `src/adapters/cloudflare.ts` (`wrangler.toml`, D1 for receipts/meter mirror, R2 for templates, cron trigger `*/2 * * * *`; built and tested, promoted only by the §11 rule).
- Studio runtime panel `app/studio/runtime/**`: compose from `Runtime.md`, `ps`, `exec --prompt` stream, `pay status`, receipts — thin client over the control API, wallet-gated like the rest of Studio; pays with the connected browser wallet.
- `zap pay *`, `zap login`, `zap runtime` wired to the cloud API when `ZAP_API_URL` is set (managed) or to local providers (self-host).
- Docs: `docs/pay.md` (both protocols, both facilitators, the signer model, no-custody statement), `docs/auth.md`, `docs/providers/{thirdweb,cdp,mpp}.md`, verify items 4, 12 and 16.

Acceptance

- [ ] `packages/runtime/tests/pay-fail-closed.test.ts` (caller-side gate; the harness driver is a stub that records whether it was called): `--live` with `status:"missing"` → `PAYER_MISSING`; a prompt with `status:"missing"` → `PAYER_MISSING` **before the driver is called**; a prompt with a payer and no `--live` reaches the driver with `live:false` and, on the stub's `run.completed { usage }`, `meter.settle` records the token lines (the in-VM half — zero side-effecting tools executed — is E's `harness-zap.test.ts` (1) and K's `plan-only.test.ts`); BYOK keys never appear in logs (canary scan of every log line); device-auth and session keys are stored mode 0600 and never printed; the client wrapper refuses a payment above `maxValue`.
- [ ] `packages/cloud/tests/gate.test.ts` (fake facilitator injected, mppx local secret): (a) no credential → 402 with **both** `PAYMENT-REQUIRED` (x402 v2) and `WWW-Authenticate: Payment` (MPP); (b) valid x402 v2 `PAYMENT-SIGNATURE` → verify → settle → receipt → 200 with `PAYMENT-RESPONSE`; (c) x402 v1 `X-PAYMENT` → 402 with an upgrade hint by default, and → settle via the shim when `ZAP_X402_V1_SHIM=1`; (d) valid MPP `Authorization: Payment` → `Payment-Receipt`; (e) replayed nonce/challenge → 402 `already redeemed`, one receipt row (Upstash `SET NX`); (f) underpayment → 402; (g) facilitator error → 402, **no** meter row (C25); (h) `payTo` always equals `ZAP_TREASURY` or the tenant's verified wallet — never derived from request data (C8); (i) gate scope: `POST /v1/runtimes/{id}/exec` with `prompt` → 402 in both modes, with `command` → no 402; `POST /v1/sessions/{id}/turns` (a stub route mounted behind the same middleware) → 402; the reservation row is created only after the receipt (§4.10 order).
- [ ] `packages/cloud/tests/gateway-proxy.test.ts`: the LLM/media proxy rejects a missing/foreign `RUNTIME_TOKEN`, streams SSE, meters tokens against the run reservation, never returns a provider key header, and a managed runtime's env (recorded fork body) contains no provider key.
- [ ] `packages/runtime/tests/meter.test.ts`: reserve/settle atomicity (Upstash memory mode), daily cap, `PRICE_UNKNOWN` fatal in live, sandbox-seconds computed from `ExecResult.usage`/sandbox uptime × size multiplier, idle seconds billed with `runId: null`, ledger lines carry `payer` and `receiptId`, `balances` adjust the next quote.
- [ ] `packages/cloud/tests/sweep.test.ts`: `stop_after` sweeper stops only `ready|idle` runtimes past deadline, never `running`, never with `force`, and backs off on `SandboxStartLimit`.
- [ ] `packages/cloud/tests/stranger.test.ts` (§12.7): a second principal cannot list, exec, snapshot, pay for, or read memory status of another tenant's runtime; `packages/cloud/tests/ratelimit.test.ts` and `packages/cloud/tests/ops.test.ts` (counters reconcile with the ledger tables) green; `packages/cloud/tests/webhook.test.ts` added only when verify item 13 confirms the contract.
- [ ] Live acceptance (manual, Base Sepolia `eip155:84532` + `https://x402.org/facilitator`, then Base mainnet with Thirdweb): a scripted client using a CLI session key pays a `$0.01` gated `POST /v1/runtimes/{id}/exec`, the receipt row has the on-chain tx, and the treasury address receives it; `doctor --json` reports `payer: byok | managed | missing`; managed path meters sandbox + gateway + gpu + api + browser units in one ledger; Studio panel pays with the browser wallet.
- [ ] `packages/cloud` passes the same adapter-parametrized `packages/cloud/tests/*` on the Vercel adapter (deployed to a preview) and the Cloudflare adapter (`wrangler dev`); `ZAP_CLOUD_ADAPTER=vercel` is the shipped default.

### Z10 — Harness templates (`zap-heavy-*`)

Tasks

- `packages/templates/zap-heavy/` base (bake: med + memory (D's `bake.d/40-openviking.sh`) + API store (G's `bake.d/50-apistore.sh`) + skills store; units `zap-openviking`, `zap-open-connector`, `zap-agentd`, `zap-host`; `verify-box.sh`-style `doctor.sh` including `mcp-openviking`, `mcp-context7`, `mcp-open-connector`, `open-connector-loopback`).
- Harness manifests + bakes (`packages/runtime/src/harness/<id>.ts` + `packages/templates/zap-heavy-<id>/`), each recording pins in `~/.zap/template.json` (C30), disabling every inbound adapter except its API (C23), binding its API server to `0.0.0.0` behind its own per-box key and a `--private` hosted route, and carrying a `managedGateway` entry that points the harness at `ZAP_API_URL/v1/runtimes/{id}/gateway` when `ZAP_PAYER_MODE=managed` (Z9):
  - **hermes** — port airv2 `infra/template/{setup.sh §1–3e, hermes-gateway.service, hermes-host.service, hermes-dashboard.service, generate_platforms.py}`: `HERMES_REF` pinned (verify item 10 re-confirms the `/v1/runs` + SSE contract at the pinned ref); `~/.hermes/config.yaml` (only `api_server` enabled, `API_SERVER_HOST=0.0.0.0`, per-box `API_SERVER_KEY`), `hermes-host.service` re-hosts 8642/9119 `--private`, memory block on, OpenViking as `mcp_servers.openviking`; managed mode sets `OPENAI_BASE_URL` in `~/.hermes/.env` to the gateway proxy; `hermes skills install` base set; identity via `SOUL.md`. Run adapter `http-runs`.
  - **openclaw** — `npm install -g openclaw@<pin>` (plain npm; run its post-install per the pinned docs), `openclaw onboard --non-interactive` equivalent, `~/.openclaw/openclaw.json` (`gateway.port 18789`, `bind: lan` behind the per-box `auth.token`, `http.endpoints.chatCompletions.enabled: true`, channels all disabled, `mcp.servers.openviking`, managed mode: `models.providers.zap.baseUrl` = gateway proxy), unit `openclaw-gateway.service`, host `18789 --private`. Run adapter `openai-compat`.
  - **opencode** — `npm i -g opencode-ai@<pin>`; `~/.config/opencode/opencode.json` (`server{port:4096,hostname:"0.0.0.0"}` behind `OPENCODE_SERVER_PASSWORD` per-box, `mcp.openviking`, `permission`, managed mode: `provider.zap.options.baseURL` = gateway proxy), `AGENTS.md` (Zap default), unit `opencode-serve.service`, host `4096 --private`. Run adapter `http-runs` (`POST /session`, `/session/:id/message`, SSE `/event`).
  - **deepseek** — `npm i -g @deepseek-ai/dsh@<pinned RC>`; ships as an **overlay** while dsh is an RC; presets `standard|code|minimal` only (the fourth dsh preset is unsupported and its name never appears in the manifest, `template.json`, docs or `--json` output — C3) per verify item 8; run adapter `cli-exec` using dsh's headless entry recorded in the manifest at bake (the web UI on `3080` is not started in the template); Zap-kernel-as-host for dsh plugins is a later spec.
  - **grok** — overlay on `zap-heavy-opencode`: `gateway.llm("xai")` default route, `XAI_API_KEY` in the BYOK allowlist, Grok-compatible skills/AGENTS layout, doctor note "xAI-routed; Grok Bot product has no runtime surface (verify item 11)".
  - **omg** — `bun install --global @omg-dev/cli@<pin>`, `omg computer setup`, `.env` (`OMG_HOST=127.0.0.1`, `OMG_PORT=8766`, `OMG_REPOS_ROOT=/zap/fs/repos`), unit `omg.service`; `omg mcp` registered into the tmux'd CLIs. Run adapter `ws-jsonrpc`.
  - opt-in: **pi** (`npm i -g @earendil-works/pi-coding-agent@<pin>`, `~/.pi/agent/settings.json`, `rpc-jsonl`), **cursor** (`curl https://cursor.com/install -fsS | bash`, `.cursor/rules/*.mdc`, `.cursor/mcp.json`, `agent -p --output-format json`, OpenCode fallback), **devin** (`curl -fsSL https://cli.devin.ai/install.sh | bash`; `devin worker start --outpost=$DEVIN_OUTPOST_ID --token=$DEVIN_OUTPOSTS_TOKEN` as `devin-worker.service`; outbound-only — no hosted port), **kimi** (`npm i -g @moonshot-ai/kimi-code@<pin>`, `kimi web --no-open --port 58627`, `KIMI_CODE_HOME`), **agno** (`uv venv`, `pip install 'agno[os]'`, `AgentOS` app on 7777 with `OS_SECURITY_KEY`), **prime** (`prime-agent` install script, `~/.prime/agent/settings.json`, `rpc-jsonl`), **headlong** (Docker-in-VM required; `~/.headlong/.env`), **frontier** (`uv sync --python 3.12`, `frontier-agent -p --no-tui`).
- `zap harness bake <template>` = `infra/box/build-template.sh` + verify; named snapshots only for `zap-heavy`, `zap-heavy-hermes`, `zap-heavy-openclaw`, `zap-heavy-opencode` (C22; deepseek joins once non-RC); the rest as overlays via `POST /boxes {from, setupScript}` or post-`ready` `/commands`.
- `infra/box/secret-sweep.sh` (port airv2 `scripts/c18-box-sweep.sh`, extended with Box/Thirdweb/CDP/MPP/`RUNTIME_TOKEN` patterns) — scoped to **template directories and named snapshots**, where no key may ever exist; tenant runtime boxes in BYOK `keysInRuntime: true` mode legitimately hold the tenant's own keys and are excluded from the sweep but included in the redaction canary tests.
- `docs/harnesses/<id>.md` (install, ports, state dirs, skills/MCP mechanism, LLM auth env, run adapter, verify status) and `docs/templates/zap-heavy-<id>.md` with the compose snippet.

Acceptance

- [ ] Every default-on harness has `bake.sh`, `doctor.sh`, a manifest with pins, and passes `zap harness doctor` on a fresh `noEnv` box created `from` the snapshot (manual workflow, one job per template); `doctor.sh` includes the Z5/Z8 in-runtime checks (`mcp-openviking`, `mcp-context7`, `mcp-open-connector`, `open-connector-loopback`) and they PASS.
- [ ] `packages/runtime/tests/harness-manifests.test.ts`: every manifest's `run` matches the §5.6 table; `http-runs | openai-compat | ws-jsonrpc` harnesses declare exactly one `api` port (`zap` declares zap-agentd's 8722), `cli-exec | rpc-jsonl` harnesses declare none; `hostPrivate:true` for every hosted port; `disabledInbound` non-empty except single-inbound-by-construction harnesses; `managedGateway` present unless `inProcess` or `pullOnly`; `pins` non-empty after bake.
- [ ] `zap-heavy-hermes` obeys airv2 invariants: one box, `noEnv`, filesystem memory, only `api_server` enabled (`GET /api/messaging/platforms` shows every other channel disabled), `hermes-host.service` re-registers routes after `stop → resume` and the adapter learns the rotated token (checked by `doctor.sh` + `box.test.ts`), and the named snapshot contains no provider key (`secret-sweep.sh` zero hits).
- [ ] `packages/runtime/tests/harness-events.test.ts`: `zap runtime exec --prompt "list /zap/fs"` produces the same `RunEvent` sequence shape on hermes, openclaw, opencode, deepseek, omg (golden JSONL fixtures per adapter, redacted); in managed mode the recorded fork body has no provider key and the harness's base URL points at the gateway proxy.
- [ ] `env-omarchy` over `zap-heavy-opencode` and `env-macos` (Namespace) pass their harness `doctor.sh` (manual).
- [ ] `zap-heavy-grok` doctor output states the xAI-routed status; `zap-heavy-devin` connects as an Outpost worker and serves one test session (manual, `DEVIN_OUTPOSTS_TOKEN`).
- [ ] Named snapshot count on the Box account ≤ 6 after Z10 (`box snapshots --json`), leaving 4 free (C22).
- [ ] Side by side (manual, after K merges): on a `zap-heavy-hermes` box, `zap session --agent transcode --json "plan a transcode"` (agent-code via `zap-agentd serve --serve-agents`, inherited from `zap-med`) and `zap runtime exec <id> --prompt "list /zap/fs"` (Hermes) both succeed in plan-only mode with `starts == 0` during the check; `doctor.sh` reports `zap-agentd --serve-agents` active.

### Z11 — Docs, evals, hardening, publish

Tasks

- Docs: `docs/{runtime,compose,pay,auth,memory,isolation,mediafs,catalog,agent-plugin,kernel,sandbox-contract,verify-log}.md` (`kernel.md` and `sandbox-contract.md` are rendered from `packages/kernel/README.md` and `packages/sandbox/src/contract.ts` JSDoc), `docs/providers/*.md` (one per provider, with snippet + capability row), `docs/templates/*.md`, `docs/harnesses/*.md`; K's `docs/agents.md`, `docs/agents/quickstart.md`, `docs/reference/agent-api.md` linked from the navigation and the README "Write an agent" section; Mintlify `docs/docs.json` navigation; `public/llms.txt` regenerated from the Appendix C template (naming no other platform); `README.md` "What ships" rewritten for v5 with the §4.12 canonical agent as the first code block; `CHANGELOG.md` `5.0.0`.
- Evals for agents as code: K's `evals/agents-transcode.eval.ts` (dry-run: `zap agent render` fixture match, then one plan-only turn against a recorded LLM fixture asserting `tool.planned` for `ffmpeg_transcode`, zero `sandbox.exec`, zero provider fetches, zero secret canaries in any produced artifact) is wired into `npm run evals` here.
- Evals: `evals/runtime-{light,med,heavy}.eval.ts` (dry-run under `ZAP_ALLOW_FAKE_SANDBOX=1`: compose → up(fake) → `exec --plan <ffmpeg preset>` and, with a recorded BYOK LLM fixture, `exec --prompt` in plan-only mode → down; asserts zero provider fetches, zero side-effecting tool executions, zero starts; the med prompt fixture comes from E's `packages/runtime/tests/fixtures/med-plan.jsonl`); `evals/live/runtime-box.eval.ts` (opt-in `EVALS_LIVE=1`, real Box, one fork, one lane, stop; asserts starts == 1 and stop without force); keep 0.3.1 recipe evals green.
- Hardening (extend `lib/security/*` patterns from airv2 into `packages/runtime/tests/security/`): `infra/box/secret-sweep.sh` in the build pipeline over every `packages/templates/**` and every named snapshot (zero hits for `box_`, `sk-`, `THIRDWEB`, `CDP_`, `MPP_SECRET`, `NAMESPACE_TOKEN`, `RUNTIME_TOKEN`, `ZAP_SELFHOST_TOKEN`, `ZAP_WALLET_PRIVATE_KEY` values); red-team: prompt-injected agent attempting `--live` without payer, side-effecting tools in plan-only mode, payTo override, session-key cap bypass, hosted-token exfiltration via logs, `force` stop, `noEnv:false`, catalog stub acquire, memory content through the control API; the redaction canary suite from Z2 re-run over every package's log output.
- Ops: alert thresholds for the Z9 `GET /v1/admin/ops` counters documented in `docs/runtime.md` (starts/hour > 80 % of plan, `start_limit_reached` > 0, settle mismatch > 0, gate rejections spiking).
- Release: `release.yml` extended to publish `@wzrdtech/{core,zap-kernel,zap-sandbox,zap-memory,providers,zap-agent,zap-runtime,zap-templates,zap-cloud,zap-mcp,agent,zap}` in dependency order (agent-code before runtime, §5.12), skipping versions already on npm; `npm pack` smoke of `@wzrdtech/zap@5.0.0` in a clean Node 24 container running `init → compose --dry-run → doctor --json`.

Acceptance

- [ ] `npm run evals` is CI-safe: every runtime eval passes with zero network; `EVALS_LIVE=1 npm run evals:live` passes on Box (manual) with `starts == 1`.
- [ ] `public/llms.txt` follows the Appendix C template and lists CLI, agents as code, kernel, sandbox contract, templates, providers, pay; `tests/llms-txt.test.ts` asserts every template, provider and agent page is linked; `tests/no-platform-names.test.ts` green over the finished `docs/**`, `public/llms.txt`, `README.md`, `CHANGELOG.md`, package descriptions and `--json` fixtures.
- [ ] Secret sweep zero hits on every template dir and every published snapshot (evidence in `docs/verify-log.md`).
- [ ] Red-team suite green; Z9 rate-limit and stranger tests still green; log scrubber canaries never leak in any package.
- [ ] `npm run typecheck && npm test && npm run cli -- doctor --json && npm run evals` green in CI; `docs:validate` green.
- [ ] `goal.md` checkboxes for Z0–Z12 all ticked with evidence links; `@wzrdtech/zap@5.0.0` published; `npx @wzrdtech/zap@5.0.0 compose --weight heavy --sandbox box --dry-run --json` and `npx @wzrdtech/zap@5.0.0 agent render --agent transcode --input "transcode a.mp4" --json` work in a clean `zap init` directory.

### Z12 — Agents as code (`@wzrdtech/zap-agent`, sessions, deploys) — session K

Tasks

- `packages/agent-code/src/{index,define,hooks,render/{frame,guard},connections,secrets,build/{bundle,lint,manifest},testing}.ts` per §5.12, plus `packages/agent/src/zap-bridge.ts` (the Studio bridge; one additive export line in `packages/agent/src/index.ts` via the integration-file rule). Replace A's stubs; keep the export names exact. `render/guard.ts` is the C13/C14 enforcement point; `build/lint.ts` is the C15/C16 enforcement point (secret literals, HTTPS origins, `process.env`, async agents, undeclared subagents/MCP servers).
- In-VM agent host `packages/runtime/src/agentd/agents/{host,deployments,aliases,sessions,turns,subagents}.ts` (`zap-agentd serve --serve-agents`): deployment registry under `/zap/deployments`, alias pointers + history, session store (`/zap/sessions`), the turn loop (§4.12) composed from K's render step and E's `harness.zap` `executeStep` (§5.6) — K builds `StepCapabilities` from each render and `ExecuteStepOptions` from the session (history from `messages.jsonl`, windowed; `mcp` clients with headers resolved through `secrets`; `toolContext` incl. `live`; `delegate`), pins `{ live, payer }` per turn into `pay.delegated`, and implements `delegate` as a kernel fork (`ctx.fork({ purpose: "subagent" })`) running the child's own turn loop with `maxTurns`; SSE streaming of the §5.12 event union. Add the `--serve-agents` flag to `units/zap-agentd.service` in `zap-med` (E's template; one-line integration PR) so heavy inherits it.
- `packages/runtime/src/secrets/{resolver,env,control-plane}.ts` + `packages/runtime/src/connections/{fetch,allowlist}.ts` per §5.12 (scope check → then resolve → attach → discard; redaction set update). Managed route `POST /v1/runtimes/{id}/secrets/resolve` and the sessions proxy `packages/cloud/src/sessions/**` (`/v1/sessions`, `/v1/sessions/{id}`, `/v1/sessions/{id}/turns` SSE; metadata mirror to §8 `agentSessions`) — K owns these two cloud paths; H's `packages/cloud/**` ownership excludes them.
- CLI (K's command dirs against C's registration API): `commands/agent/{new,ls,render,lint}.js`, `commands/session/{index,ls}.js` (this is the brief's `packages/cli/src/session.ts`, placed where the Z0 command-registration convention puts it; the CLI package is `// @ts-check` JS, C27), `commands/deploy/agent.js` (`--watch`, `--alias`, `--agent`, `--all`), `commands/secret/{set,list,remove,sync}.js` (`sync` re-pushes the store to a runtime's `zap-agentd`; it is also what `zap deploy`/`zap session` call before their first request). `zap agent new` scaffolds from `packages/agent-code/templates/agent/` (the scaffold ships no `.env`; its README says "declare a connection, then `zap secret set`"). `--json` fixtures for each in `packages/cli/tests/fixtures/`.
- MCP `packages/mcp/src/tools/agents.js`: `zap_agent_ls`, `zap_agent_render`, `zap_deploy_agent`, `zap_session`, `zap_sessions_ls`, `zap_secret_list` (§5.10 annotations; no secret-writing tool).
- Skills: `skills/zap-agents/SKILL.md` (≤ 2 KB: the split, the layout, the hook table, the three commands an agent needs — `zap agent render`, `zap deploy --watch`, `zap session --json`) added to the manifest; per-agent `agents/<id>/skills/**` auto-packed into deployments and exposed under `/zap/skills/<agent>/` for the skills store.
- Canonical agents: `agents/transcode/agent.ts` stays **byte-identical** to §4.12 (the inline `ffmpeg_transcode` tool stays where the brief puts it); the §4.12 companion files (`agents/transcode/connections.ts`, `agents/researcher/{agent.ts,tools/probe.ts,tools/notify.ts,connections.ts,skills/summarize/SKILL.md}`, `project.ts`) are taken over from A's Z0 commit and kept compiling and deploying. Test-only agents (I/O in render, hard-coded headers, `http://` origins) live under `packages/agent-code/tests/fixtures/agents/` and are never packed.
- Docs: `docs/agents.md` (the §4.12 model in user terms, the hook table, layout, addressing, sessions/deploys, secrets/egress, plan-only, the two-command quickstart — written as Zap, naming no other platform), `docs/reference/agent-api.md` (generated from `packages/agent-code/src/index.ts` JSDoc), `docs/agents/quickstart.md`.

Acceptance

- [x] `packages/agent-code/tests/render-sync.test.ts`: an agent function that calls `fetch`, `sandbox.exec`, `setTimeout`, or reads `process.env` fails with `AGENT_RENDER_IO`; an `async` agent fails with `AGENT_RENDER_ASYNC`; the canonical agent renders deterministically and `zap agent render --json` output is a committed fixture.
- [x] `packages/agent-code/tests/conditional-hooks.test.ts`: `useTool(transcode)` is attached only when the input matches `/transcode|ffmpeg/i`; `useSubagent("researcher")` only on `/research/i`; the capability set is rebuilt from empty on every render (no hook-order state).
- [x] `packages/agent-code/tests/secret-leak.test.ts`: a canary secret bound with `bearer(useSecret("WEBHOOK_TOKEN"))` never appears in rendered instructions, the deployment manifest, the bundle, `/zap/**` after deploy (grep of a fake sandbox fs), any emitted event, `zap session --json` output, or any log line; the connection layer attaches it to the outbound request and discards it.
- [x] `packages/agent-code/tests/connection-fetch.test.ts`: `connections.webhook.fetch("https://evil.example/x")` → `CONNECTION_ABSOLUTE_URL`; `fetch("/zap/ok", { method: "DELETE" })` → `CONNECTION_METHOD_DENIED`; `fetch("/other/path")` → `CONNECTION_PATH_DENIED`; a resolver call with a mismatched `(agentId, alias)` scope → `SECRET_SCOPE_DENIED` before any lookup; a declared `POST /zap/ping` succeeds with the header attached (mock server asserts it).
- [x] `packages/agent-code/tests/build-lint.test.ts`: a hard-coded `Authorization` value → `ZAP_BUILD_SECRET_LITERAL`; `http://` origin → `ZAP_BUILD_ORIGIN_NOT_HTTPS`; `process.env.X` in a tool → `ZAP_BUILD_PROCESS_ENV`; an `async` agent → `ZAP_BUILD_ASYNC_AGENT`; the manifest contains header *names* only.
- [x] `packages/agent-code/tests/session-alias.test.ts`: a session created on `transcode@production` keeps its `deploymentId` after `zap deploy --alias production` moves the pointer; a new session gets the new one; `--watch` moves only `development`; an alias move never creates a deployment; `/zap/aliases/history.jsonl` records both moves.
- [x] `packages/agent-code/tests/plan-only.test.ts`: `zap session` without `--live` on the canonical agent (fake payer `byok`) emits `tool.planned` for `ffmpeg_transcode` and never calls `sandbox.exec`, while the read-only `ffprobe` tool of the researcher subagent executes; with `--live` and the fake payer in `byok` mode `ffmpeg_transcode` executes; with the fake payer in `missing` mode the turn fails with `PAYER_MISSING` before any model call **in both modes** (thinking is spend, C5/C25); `turn.started` carries `{ live, payer }`.
- [x] `packages/cli/tests/session.test.ts` + `deploy-agent.test.ts` + `secret.test.ts` (fake sandbox, recorded LLM fixture): `zap deploy` (no positional) → build → lint → upload → `development` alias; `zap deploy <Zap.md>` still performs the 0.3.1 upload (fixture unchanged); `zap session --agent transcode --json "transcode a.mp4"` streams the event union as JSONL; resume with `--session` sends only the new input; `zap secret set` never prints the value and `zap secret list` shows last4 only.
- [x] `packages/runtime/tests/agent-host.test.ts`: `zap-agentd serve --serve-agents` registers a deployment, resolves `agent@alias` once per session, serializes turns per session (`SESSION_BUSY`), runs a subagent through a kernel fork whose disposal leaves no effects behind (leak test), and mirrors only metadata to the control-plane hook.
- [x] `packages/mcp/tests/agents.test.ts` (K-owned; G's `tests/mcp-server.test.ts` stays G's): the six agent tools are registered with the §5.10 annotations; `zap_session` with `live:true` and the fake payer `missing` returns `isError:true` `PAYER_MISSING`; `zap_secret_list` never returns a value.
- [ ] Live acceptance (manual, real `zap-med` box, BYOK key): `zap deploy --watch` → edit `agents/transcode/agent.ts` → the next `zap session` turn reflects the change without a machine start (`starts == 0` during the loop); `zap deploy --alias production` → `zap session --agent transcode@production --live "transcode /zap/fs/in.mp4"` executes the lane and writes `/zap/fs/out.mp4`. (Running `zap session` and a named harness side by side on a heavy box is a Z10 acceptance box, owned by I.)
- [x] `docs/agents.md` and `docs/reference/agent-api.md` pass `tests/docs-snippets.test.ts` and `tests/no-platform-names.test.ts`; `skills/zap-agents/SKILL.md` is in the manifest.

## 7. Environment variables (additions — all server-side; none `NEXT_PUBLIC_` unless marked)

Extend `.env.example` and `lib/env.ts`-style accessors (`packages/runtime/src/env.ts`); never read `process.env` at call sites outside that module. Existing 0.3.1 variables stay as documented in `.env.example`.

```
# Runtime / control
ZAP_API_URL=https://zap.wzrd.tech/api/cloud    # managed control API (packages/cloud on the Vercel adapter; api.zap.wzrd.tech if promoted to Workers); unset = local providers
ZAP_PAYER_MODE=byok                            # byok | managed  (doctor reports the effective mode)
ZAP_IDLE_STOP_MINUTES=20                       # never < 15 in production (C21)
ZAP_BOX_TTL_SECONDS=86400                      # provider backstop, not the idle mechanism
ZAP_DAILY_CAP_USD=5                            # takes precedence over the read-only alias WZRD_CLOUD_DAILY_CAP_USD (0.3.1 default 5)
ZAP_MARGIN_BPS=0                               # managed margin on pass-through prices
ZAP_MCP_TOKEN=                                 # required for non-loopback `zap mcp --http`
ZAP_ALLOW_FAKE_SANDBOX=0                       # 1 only in tests/evals
ZAP_ALLOW_LOCAL_SANDBOX=0                      # 1 only in tests: lets sandbox.local mount outside zap-agentd serve
ZAP_X402_V1_SHIM=0                             # 1 enables the X-PAYMENT → settlePayment shim

# Sandboxes
BOX_API_KEY=                                   # ascii.dev Box (or Supabase managed bridge)
BOX_API_BASE=https://ascii.dev/api/box/v1
BOX_WEBHOOK_SECRET=                            # only once verify item 13 confirms webhooks
BOX_TEMPLATE_ZAP_LIGHT=  BOX_TEMPLATE_ZAP_MED=  BOX_TEMPLATE_ZAP_HEAVY=       # named snapshot names (default = template name)
NAMESPACE_TOKEN=   NAMESPACE_REGION=us   NAMESPACE_COMPUTE_API=   NAMESPACE_IAM_API=   NAMESPACE_MAC_BOOTSTRAP_IMAGE=   # NSC_TOKEN is read as a fallback for the nsc CLI only
ZAP_SELFHOST_URL=  ZAP_SELFHOST_TOKEN=          # zap-agentd on a KVM VPS (the VPS-level bearer)
MSB_URL=  MSB_API_KEY=                          # microsandbox (local or cloud backend)
E2B_API_KEY=  DAYTONA_API_KEY=  CLOUDFLARE_ACCOUNT_ID=  CLOUDFLARE_API_TOKEN=
MODAL_TOKEN_ID=  MODAL_TOKEN_SECRET=            # GPU lane plugin, opt-in (Runpod is a catalog stub; no key in v5)

# Memory (control-plane side holds only SaaS keys; OpenViking paths live in-VM, see per-runtime list)
MEM0_API_KEY=  ZEP_API_KEY=                     # SaaS plugins; require consent: true

# Gateway (existing ZAP_LLM_ROUTE/… stay) + additions
XAI_API_KEY=  REPLICATE_API_TOKEN=
CLAUDE_CODE_OAUTH_TOKEN=                       # from `claude setup-token` (self-host BYOK)
CODEX_API_KEY=  OPENAI_API_KEY=                 # Codex device-auth writes ~/.codex/auth.json on the host, never in templates

# API store
CONTEXT7_API_KEY=  COMPOSIO_API_KEY=
OOMOL_CONNECT_ENCRYPTION_KEY=  OOMOL_CONNECT_RUNTIME_TOKEN=  OOMOL_CONNECT_ADMIN_TOKEN=   # per-runtime, injected via per-box env

# Pay (managed)
THIRDWEB_SECRET_KEY=  NEXT_PUBLIC_THIRDWEB_CLIENT_ID=        # exist
THIRDWEB_SERVER_WALLET_ADDRESS=  THIRDWEB_VAULT_ACCESS_TOKEN=  # facilitator gas payer
X402_FACILITATOR=thirdweb                                   # thirdweb | cdp | <url>
X402_NETWORK=eip155:8453                                    # Base mainnet USDC; CI uses eip155:84532
ZAP_TREASURY=0x…                                            # payTo (C8)
CDP_API_KEY_ID=  CDP_API_KEY_SECRET=                        # alternate facilitator
MPP_SECRET_KEY=  TEMPO_DEPOSIT_ADDRESS=  STRIPE_SECRET_KEY=  STRIPE_PROFILE_ID=   # MPP rails (optional beyond EVM)

# Cloud control API
CRON_SECRET=                                   # sweeper (exists for Vercel cron)
ZAP_CLOUD_ADAPTER=vercel                       # vercel (default) | cloudflare (promoted only by the §11 rule)
D1_DATABASE_ID=  R2_BUCKET=zap-templates       # Cloudflare adapter only
```

Client-side (CLI/agent host, never the control plane): `ZAP_WALLET_PRIVATE_KEY` (BYO managed signer fallback, §5.7), `CLAUDE_CODE_OAUTH_TOKEN`, `CODEX_API_KEY`, and `.zap/{credentials,auth}.json`.

**Per-runtime env** — the single, exhaustive list of variables a runtime VM receives (per-box `env` with `noEnv: true`; `box.test.ts` asserts every fork body against it): `TENANT_ID`, `RUNTIME_ID`, `RUNTIME_TOKEN` (per-box random; gates `zap-agentd`), `ZAP_WEIGHT`, `ZAP_TEMPLATE`, `ZAP_PAYER_MODE`, `ZAP_API_URL` (managed only), `OPENVIKING_PATH=/home/user/.zap/memory/openviking`, `OPENVIKING_CONFIG_FILE=/home/user/.zap/memory/openviking/ov.conf`, `OOMOL_CONNECT_{ENCRYPTION_KEY,RUNTIME_TOKEN,ADMIN_TOKEN}` (heavy; per-runtime values), the harness's own per-box key (`API_SERVER_KEY` / `OPENCLAW_GATEWAY_TOKEN` / `OPENCODE_SERVER_PASSWORD` / `OS_SECURITY_KEY` / `KIMI_CODE_PASSWORD` / `INTERPRETER_REMOTE_TOKEN`), `ZAP_SECRET_<NAME>` entries **only** when the self-host operator opts in with `zap secret set --persist-env` (per-box `env`, provider-side, never snapshotted; read solely by the `secrets.env` resolver, §5.12 — agent and tool code that touches `process.env` is the `ZAP_BUILD_PROCESS_ENV` build error, §5.12), and — **only** when `ZAP_PAYER_MODE=byok` and `Runtime.md pay.keysInRuntime: true` (default: `true` when `harness.id` names a third-party harness, because those processes read `llmAuth[].env` and config files, not the `secrets` service; `false` for med and for heavy without a named harness) — the tenant's own provider keys from the §0 `.env.example` set. **BYOK keys for the in-VM gateway do not normally travel as env at all:** the CLI syncs them into `zap-agentd` memory over the token-gated `POST /v1/secrets/sync` (§5.9 `zap secret`), the in-VM `gateway.core` reads them from the `secrets` service, and a restart simply waits for the next CLI contact (`KEY_UNAVAILABLE` until then, remediation printed by `doctor`). Managed mode never places a provider key or a `ZAP_SECRET_*` value in the VM: gateway calls go through the control plane's per-runtime proxy with `RUNTIME_TOKEN` (airv2 C2) and connection secrets are resolved per request through `POST /v1/runtimes/{id}/secrets/resolve`. Extending this list is a §14 escalation.

---

## 8. Schema (Convex + Upstash + optional D1; forward-only; RLS default-deny where Supabase is touched)

Convex remains the system of record (`convex/schema.ts`, additive tables — C1). Sketches; keep names, refine types in review.

```ts
// convex/schema.ts — additions
runtimes: defineTable({
  slug: v.string(), tenantId: v.string(), principalId: v.string(),          // wallet:0x… or byok:<hash>
  weight: v.union(v.literal("light"), v.literal("med"), v.literal("heavy")),
  spec: v.any(),                                                             // parsed Runtime.md (no secrets)
  lock: v.any(),                                                             // .zap/runtime.lock.json
  sandboxProvider: v.string(), sandboxId: v.optional(v.string()), environment: v.string(),
  template: v.string(), templateVersion: v.string(),
  state: v.string(),                                                         // provisioning|ready|running|idle|stopped|error|queued
  stopAfter: v.optional(v.number()), lastActiveAt: v.optional(v.number()),
  createdAt: v.number(), updatedAt: v.number(),
}).index("by_tenant", ["tenantId"]).index("by_stop_after", ["state", "stopAfter"]).index("by_slug", ["tenantId", "slug"]),
runtimeRuns: defineTable({ runtimeId: v.id("runtimes"), runId: v.string(), harness: v.string(), status: v.string(), live: v.boolean(), payer: v.string(), quoteUsd: v.number(), actualUsd: v.optional(v.number()), startedAt: v.number(), finishedAt: v.optional(v.number()) }).index("by_runtime", ["runtimeId"]).index("by_run_id", ["runId"]),
templates: defineTable({ name: v.string(), weight: v.string(), harness: v.optional(v.string()), provider: v.string(), snapshotRef: v.any(), version: v.string(), sha256: v.string(), pins: v.any(), verifiedAt: v.optional(v.number()), publishedAt: v.number() }).index("by_name", ["name"]),
meterEvents: defineTable({ principalId: v.string(), runId: v.union(v.string(), v.null()) /* null = idle sandbox time */, runtimeId: v.optional(v.id("runtimes")), unit: v.string(), sku: v.string(), qty: v.number(), usd: v.number(), payer: v.string(), receiptId: v.optional(v.string()), at: v.number() }).index("by_principal_day", ["principalId", "at"]).index("by_run", ["runId"]),
balances: defineTable({ principalId: v.string(), creditUsd: v.number() /* settle-vs-reserve differences; applied to the next quote */, updatedAt: v.number() }).index("by_principal", ["principalId"]),
receipts: defineTable({ receiptId: v.string() /* nonce | challenge id — unique */, protocol: v.string(), network: v.optional(v.string()), payer: v.optional(v.string()), amount: v.string(), asset: v.optional(v.string()), payTo: v.optional(v.string()), tx: v.optional(v.string()), runId: v.string(), settledAt: v.number() }).index("by_receipt", ["receiptId"]).index("by_run", ["runId"]),
sandboxEvents: defineTable({ runtimeId: v.id("runtimes"), kind: v.string() /* start|stop|resume|fork|start_limit|error */, provider: v.string(), deliveryId: v.optional(v.string()), at: v.number() }).index("by_runtime", ["runtimeId"]).index("by_delivery", ["deliveryId"]),
// Agents as code (Z12) — metadata mirrors only; bundles, transcripts and session data stay in the VM (§5.12)
deployments: defineTable({ runtimeId: v.id("runtimes"), project: v.string(), bundleSha: v.string(), agentIds: v.array(v.string()), manifest: v.any() /* header NAMES only, never values */, builtAt: v.number(), registeredAt: v.number() }).index("by_runtime", ["runtimeId"]).index("by_sha", ["runtimeId", "bundleSha"]),
agentAliases: defineTable({ runtimeId: v.id("runtimes"), alias: v.string() /* development|production|… */, deploymentId: v.id("deployments"), movedAt: v.number(), by: v.string() /* principalId */ }).index("by_runtime_alias", ["runtimeId", "alias"]),
agentSessions: defineTable({ runtimeId: v.id("runtimes"), sessionId: v.string(), agentId: v.string(), alias: v.string(), deploymentId: v.id("deployments") /* pinned at creation; never updated by an alias move (C17) */, principalId: v.string(), lastLive: v.boolean() /* live is per turn */, payer: v.string(), turns: v.number(), lastEvent: v.optional(v.string()) /* event type only */, createdAt: v.number(), updatedAt: v.number() }).index("by_runtime", ["runtimeId"]).index("by_session", ["sessionId"]).index("by_principal", ["principalId"]),
```

Upstash keys: `zap:meter:<YYYY-MM-DD>:<principal>:total`, `zap:meter:<day>:<principal>:run:<runId>` (Lua reserve/settle, TTL to day+2 — existing pattern), `zap:idem:box:<idempotencyKey>` (`SET NX`, 24 h — authoritative create/fork dedup), `zap:gate:nonce:<receiptId>` (`SET NX` — the **single** atomic replay check for both cloud adapters), `zap:ratelimit:<scope>:<key>` (sliding windows), `zap:starts:<hour>` (counter for C21).

Cloudflare D1 (only when `ZAP_CLOUD_ADAPTER=cloudflare`): `receipts` and `meter_events` mirrors with the same columns (`receipt_id text primary key`), written at the edge after the Upstash replay check and reconciled into Convex by the sweeper (ledger only; metadata only — never content). Supabase: no new tables; existing `user_secrets` vault and `wallet_auth_*` reused. Agent connection secrets (managed mode) live in `user_secrets` under the key namespace `agent:<project>:<agentId>:<alias>:<NAME>` (one row per environment, so `development` and `production` never share a value); the control plane reads them only inside `POST /v1/runtimes/{id}/secrets/resolve` after the §5.12 scope check, never lists values, and `zap secret list` returns name + last4 + updatedAt only. Upstash adds `zap:session:<sessionId>:lock` (`SET NX PX 120000`, refreshed per turn — the managed-side `SESSION_BUSY` guard mirroring the in-VM one).

---

## 9. Conventions (carried from 0.3.1 and airv2, plus)

- TS strict, no `any` in every TypeScript package; `// @ts-check` + JSDoc in `cli`/`mcp` (C27); `tsgo --noEmit` in CI. Public types exported from each package `index.ts`; JSDoc on every exported symbol.
- All provider calls go through the adapter packages (`packages/sandbox/src/adapters/*`, `packages/memory/src/*`, `packages/runtime/src/gateway/*`, `packages/runtime/src/pay/*`); no `fetch` to Box/Namespace/Thirdweb/CDP/facilitator/OpenViking from route handlers or CLI commands.
- Every registration is reversible: `ctx.effect` / `ctx.provide` / `ctx.on` return disposers; a PR adding a timer, socket, watcher, or process without an inverse is rejected (C20).
- Every webhook, settle, and provider charge ships its idempotency/replay test in the same PR (C26).
- Structured logs (`{ msg, tenantId, runtimeId, runId, … }`), redacted by `packages/runtime/src/redact.ts` before emission; log lines are tested with canaries for every secret class (C24).
- Migrations forward-only; Convex tables additive; Supabase RLS default-deny.
- Templates: `bake.sh` idempotent and pinned (C30); `doctor.sh` prints `PASS|FAIL <check>`; `template.json` = manifest; `.boxignore` for caches; no secret literal anywhere under `packages/templates/**` (sweep in CI).
- CLI: text for humans, `--json` for agents; `--dry-run` where a command could spend; exit 0 ok, 1 error, 2 usage; errors are `ZapRunError` JSON (C28).
- Docs page per provider/template/harness with a compose snippet that is type-checked by `tests/docs-snippets.test.ts` (snippets extracted from fenced ```ts blocks tagged `zap-snippet`).
- One session owns `packages/kernel`; one owns `packages/sandbox/src/contract.ts`; `packages/cli` is owned by C; adapters may be parallel after the contract lands (§13).

---

## 10. TDD and testing policy

**Laws** (locked):

1. Write the failing contract test before the adapter.
2. Sandbox conformance is one suite; adapters implement it. No per-adapter snowflake tests for the contract itself.
3. Every plugin registers `ctx.effect` cleanup; leak tests fail the build.
4. CLI commands have `--json` fixtures. Humans get text, agents get JSON.
5. Plan-only is the default. Live tests are opt-in (`EVALS_LIVE=1`, `RUN_HOSTED_SANDBOX_TESTS=1`) and never run in CI.
6. No `any` in any TypeScript package (`// @ts-check` in the two JS packages). Strict TS. Public types are the product.
7. Idempotent webhooks and payer settlements. Replay tests required.
8. Dry-run recipes from 0.3.1 remain green — the regression set is sacred.
9. The agent function is a render. Tests fail if it performs I/O, awaits, or reads `process.env` (C13/C14).
10. Secrets never appear in rendered instructions, manifests, bundles, snapshots, events, logs, or CLI `--json`. Every agent-code suite runs with a canary secret bound through `bearer(useSecret(…))` and greps every artifact it produces (C15).
11. Public surfaces name no other agent platform; `tests/no-platform-names.test.ts` runs in `npm test` and on every merge (C3).

**Suites (write first; "red before" = the milestone that turns them green):**

| Suite | Path | Red before |
|---|---|---|
| Regression (0.3.1) = `npm run test:regression` | `npm run test:cli`, `tests/{zap-recipes-golden,sandbox-selector,sandbox-contract,regression-fixtures}.test.ts` (`mcp-server` and `cli-acceptance` are extend-only and run in `npm test`, not here) | always green |
| Docs snippets harness | `tests/docs-snippets.test.ts` | Z0 |
| Kernel: effect / fork / dispose / inject / reconcile / leak / events | `packages/kernel/tests/*.test.ts` | Z1 |
| Sandbox conformance (fake, docker; hosted opt-in) | `packages/sandbox/tests/contract.test.ts` | Z2 |
| Box adapter (recorded HTTP, secrets stripped; create/fork replay; post-resume token re-read) | `packages/sandbox/tests/box.test.ts` | Z2 |
| Lane executor (allowlist, isolation record, dry-run) | `packages/runtime/tests/lanes.test.ts` | Z2 |
| Redaction canaries | `packages/runtime/tests/redact.test.ts` | Z2 |
| Eve bridge parity | `tests/sandbox-contract.test.ts` (superset) + `packages/sandbox/tests/eve-bridge.test.ts` | Z2 |
| CLI JSON fixtures / compose / live-refused / disposal / docs-sync | `packages/cli/tests/{compose,live-refused,fixtures,disposal}.test.ts`, `tests/docs-sync.test.ts` | Z3 |
| Namespace adapter (recorded) / self-host / microsandbox | `packages/sandbox/tests/{namespace,selfhost,microsandbox}.test.ts` | Z4 |
| Memory contract + dispose semantics + off-VM guard | `packages/memory/tests/{contract,dispose}.test.ts` | Z5 |
| Gateway plan-only / router determinism / media FS / ffmpeg presets / `harness.zap` executor plan-only | `packages/runtime/tests/{gateway-dry-run,router,mediafs,ffmpeg-presets,harness-zap}.test.ts` | Z6 |
| Adapter matrix + capability drift + GPU lane routing | `packages/sandbox/tests/adapters/*.test.ts`, `packages/runtime/tests/lanes-gpu.test.ts`, `scripts/generate-capability-matrix.mjs --check` | Z7 |
| MCP tools / HTTP transport / skills manifest / agent-plugin snippets | `tests/mcp-server.test.ts` (superset), `packages/mcp/tests/http.test.ts`, `tests/zap-skills.test.ts`, `tests/agent-plugin-snippets.test.ts` | Z8 |
| Pay fail-closed / gate (x402 v2, MPP, replay, optional v1 shim) / gateway proxy / meter+balances / sweeper / stranger / rate limits / ops | `packages/runtime/tests/{pay-fail-closed,meter}.test.ts`, `packages/cloud/tests/{gate,gateway-proxy,sweep,stranger,ratelimit,ops}.test.ts` (+ `webhook.test.ts` after verify item 13) | Z9 |
| Harness manifests / run-adapter golden events | `packages/runtime/tests/{harness-manifests,harness-events}.test.ts` | Z10 |
| Security: secret sweep, red-team | `packages/runtime/tests/security/*.test.ts`, `infra/box/secret-sweep.sh` | Z11 |
| Docs: llms.txt links / no platform names on public surfaces | `tests/{llms-txt,no-platform-names}.test.ts` | Z11 (`no-platform-names` is added by A at Z0 as an empty-passing grep over the public surfaces and stays in `npm test` from then on) |
| Evals (dry-run CI; live opt-in) | `evals/runtime-{light,med,heavy}.eval.ts`, `evals/live/runtime-box.eval.ts`, `evals/agents-transcode.eval.ts` (plan-only render + turn against the recorded fixture) | Z11 |
| Agents as code: render guard / conditional hooks / secret leak / connection fetch / build lint / session-alias pinning / plan-only default (the seven tests from the brief, written first) | `packages/agent-code/tests/{render-sync,conditional-hooks,secret-leak,connection-fetch,build-lint,session-alias,plan-only}.test.ts` | Z12 |
| Agent host / sessions / secrets resolve / CLI `session`, `deploy`, `secret` / MCP agent tools | `packages/runtime/tests/agent-host.test.ts`, `packages/cloud/tests/{sessions,secrets-resolve}.test.ts`, `packages/cli/tests/{session,deploy-agent,secret}.test.ts`, `packages/mcp/tests/agents.test.ts` | Z12 |

**Fixtures:** in-process fake sandbox (in-memory fs + exec stub honoring cwd/env/timeout); recorded Box/Namespace/facilitator HTTP with secrets stripped (`packages/*/tests/fixtures/http/*.json`, replayed by an `undici` mock agent); golden `Zap.md` dry-runs from 0.3.1; golden `RunEvent` JSONL per harness (redacted); canary secrets (`ZAP_CANARY_<CLASS>`) injected into every log-producing test.

**Commands:**

```
npm run test:regression                 # first, always
npm test                                # everything CI-safe
npm run test:kernel | test:sandbox | test:memory | test:runtime | test:cloud
npm run cli -- doctor --json
npm run cli -- compose --weight heavy --dry-run --json
npm run evals                           # CI-safe, skips live
RUN_HOSTED_SANDBOX_TESTS=1 BOX_API_KEY=… npm run test:sandbox     # manual
EVALS_LIVE=1 npm run evals:live                                    # never in CI
```

**Definition of done for a plugin:** (1) contract test red → (2) adapter green → (3) `ctx.effect` cleanup proven by the leak test → (4) `doctor --json` lists it with capabilities and `verified` → (5) `docs/providers/<id>.md` with a snippet type-checked by the Z0 `tests/docs-snippets.test.ts` harness → (6) verify-log entry if a provider fact was assumed.

---

## 11. Deployment

| Layer | Where | Notes |
|---|---|---|
| **Frontend + Studio + existing API** | Vercel project `zap` (`zap.wzrd.tech`), Node 24 [LOCKED] | Unchanged. Gains `/studio/runtime` panel (compose, ps, exec, pay status) calling the control API. |
| **Agent plane** | ascii.dev Box (default), Namespace (Linux KVM + macOS), self-host KVM VPS (`infra/self-host`), E2B/Daytona/Cloudflare/Microsandbox-cloud behind the contract | Templates built by `infra/box/build-template.sh` in a manual GitHub workflow (`template-build.yml`, input: template name; prod named snapshots are rebuilt in place, the dev lane forks the stopped build box), published as named snapshots + registry rows; fleet baseline changes roll with the airv2 release-channel pattern (`packages/cloud` `/v1/templates/{name}/publish`, canary → waves, `doctor.sh` gate) applied to **running runtimes**, not to snapshot names. |
| **Agent deployments (agents as code)** | Inside the tenant's runtime VM: `zap-agentd serve --serve-agents` on med+ hosts the render loop and the sessions; bundles under `/zap/deployments/<sha>`, aliases under `/zap/aliases`, transcripts under `/zap/sessions` — all inside the box snapshot (never secret values) | No separate deploy target and no hosted-only path (C18): `zap deploy` uploads a bundle into the runtime the CLI is pointed at; managed mode proxies `/v1/sessions/*` and resolves connection secrets per request through the control plane (§5.12). The Studio agent reaches deployed agents through `packages/agent/src/zap-bridge.ts`. |
| **Control API (`packages/cloud`)** | **Vercel routes (`/api/cloud/*`) — the v5 default** (`ZAP_CLOUD_ADAPTER=vercel`; same project, Convex + Upstash + Blob, `vercel.json` cron) with the **Cloudflare Workers adapter built and tested but not promoted** (`api.zap.wzrd.tech`, `wrangler.toml`, D1 + R2 + cron) — same Hono app, two adapters | **Decided:** v5 ships on the Vercel adapter so H can start without a Cloudflare account. **Promotion rule (a later change, recorded in `docs/verify-log.md`):** move to Workers when measured 402 round trips for agent clients exceed 300 ms p95 on Vercel, when template tarballs must live in R2, or when the Cloudflare Sandbox provider becomes a default. Both adapters must always pass the same adapter-parametrized tests. |
| **System of record** | Convex (runs, runtimes, templates, meter, receipts), Upstash (idempotency, meter Lua, queues), Supabase (secrets vault, wallet proof, managed provider secrets), Vercel Blob or R2 (template tarballs, media exports) | Unchanged roles; additive tables (§8). |
| **Payments** | Thirdweb (wallet identity via SIWE; x402 facilitator + server wallet), CDP (alternate facilitator), `mppx` gate in `packages/cloud`; Base mainnet USDC; Base Sepolia in CI/staging | No custody (C8). |
| **Sweeper / cron** | Vercel cron (`vercel.json`, every 2 min) → `GET /api/cloud/v1/sweep` with `CRON_SECRET`; Cloudflare cron `*/2 * * * *` on the Workers adapter | One sweeper; `stop_after` rule (§4.5). |
| **Secrets** | Vercel/Cloudflare env + Supabase edge-function secrets; `BOX_API_KEY` may stay in the Supabase managed bridge (existing); per-runtime tokens generated at fork | Never in templates, snapshots, browsers, or logs (C6, C24). |
| **Release** | `release.yml` publishes the package graph in dependency order; `template-build.yml` (inputs: template name; prod snapshots rebuilt in place, dev forks from the stopped build box) builds/verifies snapshots; `vercel deploy --prod` for the app; `wrangler deploy` only if the Workers adapter is promoted | Deploy sequence: `npm test` → `npm run typecheck` → `npm run test:channels` → `npm run build` → `gh workflow run Release -f publish=true` → `vercel deploy --prod --yes` → `gh workflow run template-build -f template=zap-light` … |

Self-host quickstart (documented in `docs/runtime.md`): `npx @wzrdtech/zap@5.0.0 init my-runtime && cd my-runtime && zap login --provider claude-code && zap compose --weight med --sandbox box --dry-run --json && zap runtime up --wait && zap runtime exec <id> --prompt "ffprobe the file I upload"` (med is the lightest weight with a harness; plan: `harness.zap` answers, the ffprobe lane is quoted; add `--live` to execute). Agent-code quickstart on the same runtime: `zap agent new transcode && zap deploy --watch` in one terminal, `zap session --agent transcode --json "transcode /zap/fs/in.mp4"` in another (plan-only; add `--live`), then `zap deploy --alias production` when it behaves. A `light` runtime is driven with `zap runtime exec <id> -- <cmd>` and `zap ffmpeg <preset>`, no prompt. Managed quickstart: same with `zap pay login --managed` and `ZAP_API_URL` set; `--live` runs pay per request through the gate with the session key.

---

## 12. Verification before calling a milestone done

1. `npm run typecheck && npm run test:regression && npm test && npm run cli -- doctor --json && npm run evals` — all of it, not the changed slice.
2. The milestone's acceptance boxes executed against a **real** forked box (or real Namespace/VPS for Z4) — not mocks, not localhost-only — with evidence links in the PR.
3. **The no-env test:** every runtime created during the milestone was created with `noEnv:true` (grep the recorded requests); a `box list --json` of the account shows only tagged runtimes and template boxes.
4. **The starts test:** starts consumed by the milestone's live runs are counted and stated in the PR (`zap_starts_per_hour` from ops); a milestone that needed more than 20 starts to verify explains why.
5. **The secret test:** `infra/box/secret-sweep.sh` on every template dir and every snapshot built; the log canary suite; zero tokens in any URL after load; zero `desktopUrl`/`_token` in any JSON returned to a client.
6. **The replay test:** every new webhook, settle, create/fork path — three replays, one effect.
7. **The stranger test** (managed mode; automated in `packages/cloud/tests/stranger.test.ts`, re-run live): a second principal cannot list, exec, snapshot, read memory status of, or pay for another tenant's runtime; a runtime cannot reach another runtime (curl from inside fails).
8. **The disposal test** (automated in `packages/cli/tests/disposal.test.ts`, re-run live): after `zap runtime down`, `process.getActiveResourcesInfo()` in the CLI process equals the baseline and the provider shows the box `stopped` (never deleted unless asked).
9. **The render test** (Z12 and any later change under `agents/**` or `packages/agent-code/**`): `zap agent render --agent transcode --input "transcode a.mp4" --json` matches its committed fixture byte-for-byte; the render guard suite is green; no agent or tool file references `process.env` (`zap agent lint --json` reports zero findings).
10. **The agent-secret test** (Z12, re-run live on a real `zap-med` box): a canary bound with `bearer(useSecret("ZAP_CANARY_AGENT"))` is set with `zap secret set`, one live turn calls the connection against a mock endpoint that asserts the header, then `grep -r` of `/zap/**`, the box snapshot listing, the deployment manifest, `turns.jsonl`, the `zap session --json` transcript, and the agentd log finds zero occurrences; `zap secret list --json` shows last4 only.
11. **The alias test** (Z12): with a session open on `transcode@production`, `zap deploy --alias production` advances the pointer and the open session's next turn still reports the original `deploymentId`; `/zap/aliases/history.jsonl` has the move.
12. **The naming test:** `tests/no-platform-names.test.ts` green over the milestone's docs, fixtures and package metadata (C3).
13. `docs/verify-log.md` updated for any provider fact the milestone relied on.

---

## 13. Order of operations + Devin child-session plan

Dependency spine (the table is authoritative; this sentence restates it): **A (kernel, Z0+Z1) unblocks B, C, D, E, H. B unblocks F. C unblocks G. K (agents as code, Z12) waits for A, B, C, E (and for H only on its `packages/cloud` files, for G only on its MCP/skills files). I waits for B, D, E, G, H. J waits for everyone, K included.** Child sessions are cheap; merge conflicts are not — each owns disjoint paths. One session owns `packages/kernel`; one owns `packages/sandbox/src/contract.ts`; C owns the CLI dispatcher and registration API while domain sessions own their own command files under `packages/cli/src/commands/<domain>/`; K owns `packages/agent-code` and the in-VM agent host while E owns the executor loop it composes; nobody crosses those files. Adapters may run in parallel after the contract lands.

| Session | Name | Milestone | Blocked by | Owns (exclusive) | Tests it must turn green | Done when |
|---|---|---|---|---|---|---|
| **A** | Kernel + spine | Z0 + Z1 | — | `packages/kernel/**`, `vitest.config.ts`, `.github/workflows/ci.yml`, `tests/regression-fixtures.test.ts`, `tests/fixtures/regression/**`, `tests/docs-snippets.test.ts`, `tests/no-platform-names.test.ts` + `tests/fixtures/platform-names.txt`, the `packages/{sandbox,memory,runtime,agent-code,templates,cloud}/package.json` + `tsconfig.build.json` scaffolds, `packages/core/src/meter.ts`, and — until K starts — `packages/agent-code/src/index.ts` (stub), `agents/**`, `project.ts`, the typed stubs `packages/runtime/src/{sandbox/box,memory/openviking,harness/hermes,pay/x402}.ts` (handed to B/D/I/H at their start), `packages/runtime/src/testing.ts`, `packages/runtime/tests/fixtures/north-star.ts` | `packages/kernel/tests/{effect,fork,dispose,inject,reconcile,leak,events}.test.ts`; `npm run test:regression`; `tests/docs-snippets.test.ts` (empty-passing); `tests/no-platform-names.test.ts` | `createRuntime` + `definePlugin` (factory form) exported and the north-star compiles against the stubs; typecheck + vitest green with zero network; `packages/kernel/README.md` documents the Context API; every workspace at `5.0.0-alpha.0` and `npm pack` smoke passes |
| **B** | Sandbox + Box + environments | Z2 + Z4 | A | `packages/sandbox/**` (incl. `src/contract.ts`, `src/core.ts`, adapters `fake, local, docker, box, namespace, selfhost, microsandbox`), `packages/templates/zap-light*/**`, `packages/templates/env-{omarchy,macos}/**`, `packages/runtime/src/agentd/**` except `packages/runtime/src/agentd/runs.ts` (E's `/v1/runs` route module) and `packages/runtime/src/agentd/agents/**` (K's in-VM agent host) — B's `agentd/serve.ts` exposes a route-module convention plus the `--serve-agents` flag hook that E and K fill, `packages/runtime/src/lanes/**` (except `gpu.ts`), `packages/runtime/src/environments.ts`, `packages/runtime/src/redact.ts`, `infra/{box,namespace,self-host}/**` except `infra/box/secret-sweep.sh` (I's), `packages/sandbox-adapters/src/index.ts`, `docs/providers/{box,namespace,selfhost,microsandbox,hyperlight}.md`, `docs/templates/{zap-light*,env-*}.md` | `packages/sandbox/tests/{contract,box,namespace,selfhost,microsandbox,eve-bridge}.test.ts`, `packages/runtime/tests/{lanes,redact}.test.ts`, 0.3.1 sandbox tests (superset) | Box is the default provider; `zap-light` snapshot built and verified; airv2 `lib/box` methods mapped 1:1 incl. post-resume token re-read; conformance suite provider-agnostic (fake included); verify items 1–3, 5–7, 9, 13–15 answered |
| **C** | CLI dispatcher + core commands | Z3 | A | `packages/cli/**` except `packages/cli/src/commands/{memory,pay,harness,agent,session,secret}/**`, `packages/cli/src/commands/deploy/agent.js`, `packages/cli/tests/{session,deploy-agent,secret}.test.ts` and the domain `--json` fixtures `packages/cli/tests/fixtures/{memory,pay,harness,agent,session,secret,deploy-agent}*.json` (owned by D/H/I/K respectively) (i.e. `cli.js`, every legacy command file, `commands/{compose,runtime,doctor,fs,media,ffmpeg,template,mcp,login}/**`, `commands/deploy/index.js` (positional 0.3.1 upload + dispatch to K's `agent.js`), `src/lib/**` registration API + `--json`/errors/exit codes, `packages/cli/tests/{compose,live-refused,fixtures,disposal}.test.ts`), `tests/cli-acceptance.test.ts`, `docs/reference/cli.md`, `skills/zap-cli/**`, `scripts/sync-cli-docs.mjs` | the tests it owns, `tests/docs-sync.test.ts` | 0.3.1 commands unchanged; compose/runtime/fs/media/ffmpeg/template/doctor `--json`; registration API documented so D/H/I/K add `memory`/`pay`/`harness`/`agent`/`session`/`secret` command directories without touching C's files; `zap deploy` with no positional prints `AGENTS_NOT_AVAILABLE` until K lands; `.zap/auth.json` namespaced; plan-only default; `npx @wzrdtech/zap compose --help` stable |
| **D** | Memory | Z5 | A | `packages/memory/**`, `packages/templates/zap-heavy/bake.d/40-openviking.sh`, `packages/templates/zap-heavy/units/zap-openviking.service`, `packages/cli/src/commands/memory/**` + `packages/cli/tests/fixtures/memory*.json`, `docs/memory.md`, `docs/providers/{openviking,mem0,zep}.md` | `packages/memory/tests/{contract,dispose}.test.ts` | OpenViking default on heavy at `~/.zap/memory`; Mem0/Zep pass the contract; `wipeSession` semantics proven; loopback-only and off-VM guard asserted; MCP-registration fragments correct for every harness format |
| **E** | Gateway + media FS + `harness.zap` executor + med template | Z6 | A | `packages/runtime/src/{gateway,mediafs,ffmpeg}/**`, `packages/runtime/src/harness/{zap,interpreter,fx}.ts` (`zap.ts` = the §5.6 executor + the caller-side `http-runs` driver — steps 3–5 of the §4.12 turn loop — not the render step or the agent host), `packages/runtime/src/agentd/runs.ts` (`POST /v1/runs` + SSE on the in-VM executor), `packages/providers/src/replicate.ts` (+ one additive line in `registry.ts`/`index.ts` via the integration-file rule), `packages/templates/zap-med*/**` (K adds `--serve-agents` to `units/zap-agentd.service` by a one-line integration PR), `packages/runtime/tests/fixtures/med-plan.jsonl`, `docs/providers/{openrouter,ai-gateway,openai,anthropic,xai,gmi,fal,prodia,runware,replicate,vertex,aws}.md`, `docs/templates/zap-med*.md`, `docs/mediafs.md` | `packages/runtime/tests/{gateway-dry-run,router,mediafs,ffmpeg-presets,harness-zap}.test.ts` | plan-only never calls a provider; router determinism preserved bit-for-bit; media FS content-addressed with sidecar snapshot; `zap-med` boots with gateway + `/zap/media`; `harness.zap` honors C25 plan-only (`tool.planned` for side-effecting tools, `readOnly` tools execute) and exposes the executor interface K composes without modification |
| **F** | Other sandboxes + GPU | Z7 | B | `packages/sandbox/src/adapters/{e2b,daytona,cloudflare,modal,catalog}/**`, `packages/runtime/src/lanes/gpu.ts`, `packages/runtime/tests/lanes-gpu.test.ts`, `scripts/generate-capability-matrix.mjs`, `docs/isolation.md`, `docs/providers/{e2b,daytona,cloudflare,modal,runpod,blaxel,freestyle,orgo,tensorlake,baseten}.md` | `packages/sandbox/tests/adapters/*.test.ts`, `lanes-gpu.test.ts`, capability drift check | every adapter passes conformance or is a labelled catalog stub; `doctor --json` lists them; GPU mounts only when a lane asks |
| **G** | MCP + skills + API store | Z8 | C | `packages/mcp/**` except `packages/mcp/src/tools/agents.js`, `skills/**` except `skills/zap-cli` and `skills/zap-agents`, `packages/core/src/skill-manifest.ts`, `packages/runtime/src/apistore/**`, `packages/templates/zap-heavy/bake.d/50-apistore.sh`, `.claude-plugin/**`, `docs/agent-plugin.md`, `docs/catalog.md`, `scripts/generate-llms-txt.mjs`, `tests/{mcp-server,zap-skills,agent-plugin-snippets}.test.ts`, `packages/mcp/tests/http.test.ts` | the tests it owns | `zap mcp` stdio + `--http` work; tools for compose/runtime/fs/exec/pay/memory/doctor; the tool-module convention (`packages/mcp/src/tools/<domain>.js`, auto-registered) documented so K adds `agents.js` without touching G's files; skills store path documented; Context7 + open-connector + Composio fragments correct for every harness format |
| **H** | Auth + pay + cloud | Z9 | A | `packages/runtime/src/{pay,auth,meter}/**` (replacing A's `pay/x402.ts` stub body), `packages/cloud/**` except K's `packages/cloud/src/sessions/**`, `packages/cloud/src/secrets/resolve.ts` (the `POST /v1/runtimes/{id}/secrets/resolve` route module) and `packages/cloud/tests/{sessions,secrets-resolve}.test.ts`, `app/api/cloud/**`, `app/studio/runtime/**`, `packages/cli/src/commands/pay/**` (incl. `zap pay login --managed` / `zap pay logout`) + `packages/cli/tests/fixtures/pay*.json`, `docs/{pay,auth}.md`, `docs/providers/{thirdweb,cdp,mpp}.md` | `packages/runtime/tests/{pay-fail-closed,meter}.test.ts`, `packages/cloud/tests/{gate,gateway-proxy,sweep,stranger,ratelimit,ops}.test.ts` | `doctor` reports payer `byok \| managed \| missing`; BYOK keys never logged; x402 v2 and MPP settle through the gate with replay protection; managed gateway proxy meters tokens; session-key signer with cap; no custody; both cloud adapters pass the same tests with Vercel as default; the Hono app exposes a route-mounting convention so K mounts `/v1/sessions/*` and the secrets-resolve route without editing H's files |
| **I** | Harness templates | Z10 | B, D, E, G, H | `packages/templates/zap-heavy/**` except D's/G's `bake.d` fragments and D's unit, `packages/templates/zap-heavy-{hermes,openclaw,opencode,deepseek,grok,omg,pi,cursor,devin,kimi,agno,prime,headlong,frontier}/**`, `packages/runtime/src/harness/**` except E's three files, `packages/runtime/tests/{harness-manifests,harness-events}.test.ts`, `packages/cli/src/commands/harness/**` + `packages/cli/tests/fixtures/harness*.json`, `docs/harnesses/**`, `docs/templates/zap-heavy*.md`, `infra/box/secret-sweep.sh` | its two suites; per-template `doctor.sh` (manual workflow) | `zap-heavy-{hermes,openclaw,opencode}` snapshots + `{deepseek,grok,omg}` overlays publish and pass doctor; Hermes obeys airv2 invariants; managed mode wired through the gateway proxy; ≤ 6 named snapshots used |
| **K** | Agents as code | Z12 | A, B (Z2 PR), C, E — merged before K starts (Day 3); H gates only K's `packages/cloud/**` commits (the sessions proxy and secrets-resolve route mount on H's Hono app), G gates only K's `packages/mcp/src/tools/agents.js` + `skills/zap-agents/**` commits | `packages/agent-code/**` (replacing A's stubs), `packages/agent/src/zap-bridge.ts`, `packages/runtime/src/agentd/agents/**`, `packages/runtime/src/{secrets,connections}/**`, `packages/cloud/src/sessions/**`, `packages/cloud/src/secrets/resolve.ts`, `packages/cloud/tests/{sessions,secrets-resolve}.test.ts`, `packages/cli/src/commands/{agent,session,secret}/**` (the brief's `packages/cli/src/session.ts`, placed per the Z0 registration convention — an approved deviation recorded here), `packages/cli/src/commands/deploy/agent.js`, `packages/cli/tests/{session,deploy-agent,secret}.test.ts`, `packages/cli/tests/fixtures/{agent,session,secret,deploy-agent}*.json` (incl. `agent-render.transcode.json`, the §12.9 fixture), `packages/mcp/src/tools/agents.js`, `packages/mcp/tests/agents.test.ts`, `skills/zap-agents/**`, `agents/**`, `project.ts`, `docs/agents.md`, `docs/agents/**`, `docs/reference/agent-api.md`, `packages/runtime/tests/agent-host.test.ts`, `evals/agents-transcode.eval.ts` | `packages/agent-code/tests/{render-sync,conditional-hooks,secret-leak,connection-fetch,build-lint,session-alias,plan-only}.test.ts` (the seven tests, written first), `packages/cli/tests/{session,deploy-agent,secret}.test.ts`, `packages/runtime/tests/agent-host.test.ts`, `packages/cloud/tests/{sessions,secrets-resolve}.test.ts`, `packages/mcp/tests/agents.test.ts` | the canonical `agents/transcode` renders deterministically and runs plan-only by default on a real `zap-med` box; `zap deploy --watch` / `--alias production` / `zap session --json` / `zap secret set` behave per §5.12; a canary secret never appears anywhere a test can grep (instructions, manifest, bundle, `/zap/**`, events, `--json`, logs); sessions stay pinned to their `deploymentId` across alias moves; `docs/agents.md` passes `tests/no-platform-names.test.ts` |
| **J** | Docs, evals, harden, publish | Z11 | A–I, K | `docs/**` except pages owned above, `evals/**` except K's `evals/agents-transcode.eval.ts`, `public/llms.txt`, `README.md`, `packages/runtime/tests/security/**`, `tests/llms-txt.test.ts`, `release.yml`, `template-build.yml` | `evals/*`, `tests/llms-txt.test.ts`, `tests/no-platform-names.test.ts` (A's test; J is the last session to run it over the finished surfaces), security suite | goal.md checkboxes Z0–Z12 all green with evidence; `tests/no-platform-names.test.ts` green over `docs/**`, `public/llms.txt`, `README.md`, `CHANGELOG.md`, every `package.json` description and every `--json` fixture; `npm pack` smoke of `@wzrdtech/zap@5.0.0` passes; published |

**Integration files (coordinator-owned; any session changes them by a one-line PR that the coordinator merges within the day, never in a feature PR):** `package.json` (root scripts/workspaces), every workspace `package.json` version field, `packages/core/src/{index,schema,runtime-spec,template-manifest}.ts` (A writes `runtime-spec.ts`/`template-manifest.ts` skeletons; additive edits only), `packages/providers/src/{index,registry}.ts`, `packages/runtime/src/{index,env,doctor,compose,profiles}.ts`, `packages/runtime/package.json` `exports`, `packages/cli/package.json` `exports`, root `tsconfig.json` (`include` additions), `packages/runtime/src/agentd/routes.ts` (A writes the route-module type at Z0; additive), `skills/skills-manifest.json` (regenerated by G's script; K adds `zap-agents`), `packages/agent/src/index.ts` (K's one-line bridge export), `packages/templates/registry.json`, `packages/templates/zap-med/units/zap-agentd.service` (K's `--serve-agents` one-liner), `packages/runtime/src/agentd/serve.ts` flag hook (B leaves it; K's one-line wiring), `packages/mcp/src/tools/index.js` (if G's auto-registration needs an import line for `agents.js`), `packages/cloud/src/app.ts` route mounts (two lines for K's `/v1/sessions/*` and secrets-resolve), `convex/schema.ts`, `lib/providers/router.ts` shim, `.env.example`, `CHANGELOG.md`, `docs/verify-log.md`, `docs/runtime.md` (J finalizes), `goal.md` checkboxes. A's typed stubs in `packages/runtime/src/{sandbox,memory,harness,pay}/` transfer to B/D/I/H the moment those sessions start; A's `packages/agent-code/src/index.ts` stub, `agents/**` and `project.ts` transfer to K the moment K starts (K keeps `agents/transcode/agent.ts` byte-identical to §4.12; the companion files are already there from Z0).

**CLI-driven acceptance boxes:** any acceptance box that invokes the `zap` CLI is ticked after C merges; until then D, E, G and H prove the same behaviour through the programmatic API (`createRuntime` + `RunSession.run`) with A's `testing.ts` fakes, and G's MCP tests use `ZAP_TEST_PAYER` to select the fake payer mode.

Suggested schedule: Day 1 A · Day 2 B ∥ C ∥ D ∥ E ∥ H (after A merges) · Day 3 F (after B) ∥ G (after C) ∥ K (after A, B, C, E — starts on the package, host, secrets and CLI; picks up `packages/cloud` once H merges and `tools/agents.js` + `skills/zap-agents` once G merges) · Day 4 I (after B, D, E, G, H) ∥ K continues · Day 5 J (after everyone, K included). Merge rule: a session may read another session's files but never edit them; if it needs a change there, it opens a small PR against that session's branch and blocks on it.

**Spawning a child session** (coordinator Devin or a human; `POST https://api.devin.ai/v1/sessions`, `Authorization: Bearer $DEVIN_API_KEY`, `idempotent: true`, `tags: ["zap-v5", "session-<X>"]`, `title: "Zap v5 — Session <X> <Name>"`, optional `max_acu_limit`). Prompt template — fill `<X>`, `<Name>`, `<Milestone>`, the Owns/Tests/Done-when rows from the table, and pin the commit:

```
You are Devin child session <X> ("<Name>") for Zap v5. Repo: https://github.com/gratitude5dee/Zap, branch zap-v5, base commit <sha>.
Read goal.md in full first (§0, §1, §4, §5, then §6 <Milestone>, §10, §13). Where goal.md and code disagree, goal.md wins on what/when and §4–§5 win on how; if you think goal.md is wrong, stop and escalate per §14 — do not "just ship".
You own exactly these paths: <Owns>. Do not edit any other path; if you must, open a separate PR and block on it.
Blocked by: <sessions>. If they have not merged, work only on tests and interfaces that compile against packages/kernel's published types.
TDD: write these failing tests first: <Tests>. Turn them green. Keep `npm run test:regression` green at every commit.
Constraints C1–C30 in §1 are absolute. Plan-only is the default; never make live spend the default; never put a secret in a template, snapshot, log, PR, rendered instruction, manifest, or --json payload; never read process.env from an agent or tool — outbound auth goes through connections; never call Box stop with force; never create a box without noEnv:true; never custody funds. Public surfaces (docs/**, public/llms.txt, README, CHANGELOG, package descriptions, JSDoc, error messages, --json) describe the kernel and the agent programming model as Zap and name no other agent platform (C3).
Done when: <Done when>. Tick the acceptance boxes in goal.md §6 <Milestone> with evidence links (test output, verify-log entry, screenshot of doctor --json) in your PR description.
Record any provider fact you had to assume in docs/verify-log.md with date and evidence.
Deliver: one PR per milestone, conventional commits, CHANGELOG entry under 5.0.0-alpha, and a final report listing starts consumed, credentials used, and open questions.
```

Merge discipline for the coordinator: merge A first; re-base B–H on A; re-base K on A + B + C + E (on H before K's `packages/cloud` commits, on G before K's MCP/skills commits); run `npm run test:regression` and `tests/no-platform-names.test.ts` on every merge; a red regression suite blocks all merges until fixed by the session that broke it; a `no-platform-names` hit is fixed by the session that introduced it before anything else merges.

---

## 14. Escalate to a human, do not decide

- Any C-constraint appears to block a task. The constraint is right.
- Any request to custody funds "temporarily", to route `payTo` through a Zap-held wallet, to add a fee split, or to make live spend the default anywhere (including tests, evals, or CI).
- Any pressure to log, print, bake, snapshot, or return to a browser a secret or secret-bearing URL (`_token`, `desktopUrl`, `API_SERVER_KEY`, provider keys, bridge tokens).
- Replacing Box as the default sandbox, forking Cordis instead of shaping the Zap kernel, or rewriting Studio / Eve / Convex / Upstash as part of v5.
- Anything that would make an agent function do work: `await`, `fetch`, `sandbox.exec`, or `process.env` inside `defineAgent`; a proposal to let hooks run asynchronously; or a "convenience" that returns a secret value from `useSecret` (C13–C15).
- A second agent runtime, a hosted-only agent cloud (agent code executing on the shared control plane), a fork of an external agent SDK, or a request to `npm install` another agent framework into `packages/agent-code` (C18).
- Any request to name, cite, or analogize to another agent platform in `docs/**`, `public/llms.txt`, `README.md`, `CHANGELOG.md`, package descriptions, JSDoc, error messages, or `--json` output (C3) — including "just a comparison table". The deny-list in `tests/fixtures/platform-names.txt` only grows.
- Secrets in a template `.env`, a `.env` dump, a deployment manifest, a rendered instruction, or an outbound request that bypasses `defineConnection` (C15/C16); a request to widen a connection to a non-HTTPS origin or an absolute-URL `fetch`.
- A proposal to rebuild session history on the client, to let an alias move rewrite in-flight sessions, or to make `production` advance implicitly on `zap deploy` (C17).
- A verify-first item (§3) coming back materially different from the assumed shape: named snapshots + `noEnv` not combinable, Thirdweb facilitator unable to take per-request `payTo` or x402 v2, thirdweb session keys unavailable for the managed signer (do not fall back to a Zap-held key), Namespace lacking suspend/wake, Hyperlight unable to host the WASM lane, dsh presets renamed or its headless entry absent, Grok gaining a real API, Codex device-auth unavailable for the org, Box deletion or webhooks confirmed absent in a way that blocks I6.
- Any need to extend the per-runtime env allowlist (§7) or to place a provider key inside a managed runtime.
- Any template that would need more than the 10 named-snapshot budget, or any plan that would exceed the machine-start ceilings (C21/C22).
- Creating a box without `noEnv: true`, stopping with `force: true`, or per-sandbox timers instead of the `stop_after` sweeper.
- Weakening a gate: "plan-only is probably fine to skip here", "the agent can approve its own live run", "catalog stubs can acquire for now".
- Any request to ship publisher-supplied templates, a template marketplace, custom chains/tokens, or a multi-tenant harness process.

---

## Appendix A — Provider facts this spec relies on (verified 2026-08-25; re-verify at bake, C30)

- **ascii.dev Box:** API `https://ascii.dev/api/box/v1`; `POST /boxes` (`type small|default|large`, `ttlSeconds` 1–2 592 000 or `null`, `env` ≤ 100 vars / 64 KB with reserved names `ASCII_TOKEN, ASCII_API_URL, AGENT_ID, PRODUCT_MODE, ENVIRONMENT_ID, BOX_ID`, `noEnv`, `environment`, `setupScript` ≤ 65 536 chars on create only, `from` = named snapshot), `POST /boxes/{id}/{fork,resume,stop,commands,desktop,prompt,interrupt,sshkey}`, `GET|PUT /boxes/{id}/files`, `GET /boxes/{id}/events`, `GET /boxes/{id}/snapshots`, `GET /limits` (`startLimits{perMinute,perHour,perDay}`, `starts`, `canStart`) — all present in `@asciidev/box-sdk@0.0.28`; documented but **absent from the SDK** (verify items 13–15): `POST /boxes/{id}/host`, box deletion, webhooks `box.ready|box.error|box.archived` with `X-Ascii-Signature`, `Idempotency-Key`. Snapshots every minute + on stop (filesystem incl. `/etc`, Docker named volumes; not processes/memory/ports/hosted URLs), named snapshots max 10, hosted URLs `https://<sub>-<port>.on.ascii.dev?_token=…` ≤ 50/box with the token rotating on stop/resume. Sizes 2 vCPU/4 GB $0.018/h, 4/8 $0.036/h, 8/16 $0.072/h; stopped boxes free. Plans: $20 (100 concurrent; 10/50/150 starts per min/h/day) … $2 000 (1 200; 60/300/900); platform ceilings 600/h, 1 500/day; trial 2 concurrent, 5/25/75, 25 h total. SDKs `@asciidev/box-sdk` (0.0.28), PyPI `ascii-box-sdk`, `@asciidev/eve-box` (0.1.6: create/get/update/stop/resume/command/files only; peers `eve ^0.11.2`). CLI `box new|fork|stop|resume|delete|ssh|exec|scp|host|desktop|prompt|snapshot|snapshots|list --json|limits`. Preinstalled: Docker, Chrome, FFmpeg, Node/Bun/Deno, Python, Go, Rust, Java, .NET, Claude CLI, Codex CLI. Undocumented (treat as absent): nested KVM, GPU.
- **Namespace:** `ComputeService/{CreateInstance, DescribeInstance, WaitInstanceSync, ListInstances, DestroyInstance, CreateIngress, GetSSHConfig}`, `CommandService/RunCommandSync`; shapes `2x4 … 32x64`; Linux amd64 `/dev/kvm`; macOS Apple-silicon (M4 Pro/M5 Max, ≤ 12 vCPU/56 GB); ingress `x-nsc-ingress-auth`; `nsc` CLI; `@namespacelabs/sdk`; pricing per unit-minute (Linux 1×, macOS 10×).
- **Hyperlight:** Rust VMM for typed guest functions (KVM/MSHV/WHP); `hyperlight-wasm` (Wasmtime, Component Model) ~1–2 ms; `hyperlight-nanvix` POSIX subset (static binaries; ffmpeg unverified). **Microsandbox:** `msb`, npm `microsandbox@0.6.15`, libkrun microVMs, snapshots, cloud backend `MSB_API_KEY`. **DeepSeek Harness:** `@deepseek-ai/dsh@0.1.1-rc.2` (presets `code, cordis, minimal, standard`; release candidate). **Namespace SDK:** `@namespacelabs/sdk@1.0.0` (ships `SuspendInstance`/`WakeInstance`).
- **x402:** spec v2 (`x402Version: 2`; headers `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`; v1 `X-PAYMENT` still accepted by facilitators); `exact` scheme (EIP-3009 default); packages `@x402/{core,evm,svm,fetch,axios,express,hono,fastify,next,paywall}`, `@coinbase/x402` (`createFacilitatorConfig`); facilitators CDP `https://api.cdp.coinbase.com/platform/v2/x402`, Thirdweb `https://api.thirdweb.com/v1/payments/x402` (`thirdweb/x402` `facilitator()`, `settlePayment()`, `wrapFetchWithPayment()`, 0.3 % fee, EIP-7702 gasless via server wallet), testnet `https://x402.org/facilitator`; Base mainnet USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (`eip155:8453`), Base Sepolia `eip155:84532`.
- **MPP:** Machine Payments Protocol (Tempo + Stripe, 2026-03-18; IETF `draft-httpauth-payment-00`); `WWW-Authenticate: Payment …` / `Authorization: Payment <base64url>` / `Payment-Receipt`; intents `charge | session | subscription`; SDK `mppx` (`mppx/hono|express|next`, methods `evm.charge({ x402: { facilitator } })`, `tempo`, `stripe`, `solana`) serves x402 and MPP on one endpoint; rails Tempo (4217), EVM incl. Base, Solana, Stripe SPT. Thirdweb has no MPP support (negative, unverified).
- **Auth:** Claude Code — `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`; precedence `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → OAuth; creds `~/.claude/.credentials.json` (0600). Codex — `codex login --device-auth` / `--with-api-key` (stdin); `~/.codex/auth.json`; `OPENAI_API_KEY`, `CODEX_API_KEY`, `CODEX_HOME`.
- **Harness ports / state:** Hermes `8642` (+ dashboard `9119`, `~/.hermes`, `config.yaml`/`.env`/`skills/`/`memories/`, `hermes skills install`, `mcp_servers`), OpenClaw `18789` (`~/.openclaw/openclaw.json`, `/v1/chat/completions`, `openclaw skills install`, `mcp.servers`), OpenCode `4096` (`opencode serve`, `opencode.json`, AGENTS.md, `mcp{}`), dsh `3080` (`npx @deepseek-ai/dsh web`), omg `8766` (`~/omg`, `.env`), Pi (`--mode rpc`, `~/.pi/agent`), Cursor (`agent -p`, `.cursor/rules`, `.cursor/mcp.json`), Devin Outposts (`devin worker start --outpost`, outbound HTTPS only), Kimi Code `58627` (`kimi web`, `~/.kimi-code`), Open Interpreter (`interpreter app-server --listen ws://127.0.0.1:9000`, `~/.openinterpreter/config.toml`, AGENTS.md), Agno `7777` (`AgentOS`, `OS_SECURITY_KEY`), prime-agent (`--mode rpc`, `~/.prime/agent`), headlong (Docker; `~/.headlong`; dashboard `8080`), FrontierAgent (`frontier-agent -p --no-tui`, `.apodex/runs`), fx (`fx ask --json`, `~/.fx`, `/mcp add --transport http`). Grok Bot: consumer product, no runtime surface. **Eve** is Vercel's framework (`eve.dev`, latest 0.44.3); Zap pins 0.22.4.
- **Memory / API store:** OpenViking PyPI `openviking` 0.4.16 (`openviking-server --config <path>` — the unit passes `~/.zap/memory/openviking/ov.conf` explicitly and the per-runtime env also sets `OPENVIKING_CONFIG_FILE` for CLI tools; port 1933, `/mcp`, `viking://` URIs, `openviking-sdk`); Mem0 `mem0ai` + `MEM0_API_KEY`; Zep `@getzep/zep-cloud` + `ZEP_API_KEY`; Context7 `https://mcp.context7.com/mcp` + `CONTEXT7_API_KEY`; open-connector (Node ≥ 22, `:3000`, `/mcp`, `OOMOL_CONNECT_*`); Composio `@composio/core`.
- **Devin:** `POST https://api.devin.ai/v1/sessions` (`prompt`, `playbook_id`, `idempotent`, `max_acu_limit`, `tags`, `title`); coordinator sessions delegate to parallel managed Devins; Outposts run sessions on your machines.

## Appendix B — Regenerating this spec

The locked configuration lives in `zap-upgrade-main/src/lib/zap/*.ts` and the composer at `/brief` renders `FABLE_PROMPT.md`. This `goal.md` supersedes the console's generated `goal.md`, `ARCHITECTURE.md`, `SESSIONS.md`, and `TDD.md` by folding them into one file and grounding every provider claim in the primary docs listed in Appendix A. To regenerate after a configuration change: re-run the composer, diff its `goal.md` against §0–§6 here, and carry forward only the locked-configuration deltas; never regress a verified fact in Appendix A or `docs/verify-log.md`.

## Appendix C — `public/llms.txt` template (public surface; C3 applies)

`scripts/generate-llms-txt.mjs` (G) renders this shape from the docs tree; J commits the output. It names Zap only. The same rule applies to the briefing console's own `llms.txt`: its current copy links two external agent platforms in the description and the link list — remove those lines before it is served (the scrubbed version is delivered beside this file as `llms.txt`).

```
# Zap — composable CPU agent runtime

> @wzrdtech/zap v5: compose a runtime (light | med | heavy) on a Box VM, write agents as code, run them plan-only by default, pay with your own keys or per request.

npm: https://www.npmjs.com/package/@wzrdtech/zap
repo: https://github.com/gratitude5dee/Zap
docs: https://zap.wzrd.tech/docs

## For agents
- Read this file first. Every CLI command has --json; humans get text, agents get JSON.
- Start: npx @wzrdtech/zap doctor --json, then npx @wzrdtech/zap compose --weight med --sandbox box --dry-run --json.
- Plan-only is the default. --live requires a payer (BYOK key or managed wallet). Nothing spends without it.
- MCP: npx @wzrdtech/zap mcp (stdio) or --http; skills at /api/skills/<skill>.

## Programming model
- An agent is a function that renders the next step's instructions. Hooks attach a model, tools, MCP servers, subagents; hooks are synchronous and may be conditional; the runtime executes.
- Layout: agents/<id>/agent.ts, tools/*.ts, connections.ts, skills/<skill>/SKILL.md, project.ts. Address an agent as <id>@<alias>.
- CPU work runs on the sandbox (sandbox.exec). Outbound HTTP goes through declared HTTPS connections; secrets are write-only and never appear in bundles, instructions, logs or --json.
- Sessions are durable and bound to the deployment they started on. zap deploy --watch syncs development; zap deploy --alias production advances production.

## CLI
- /docs/reference/cli — every command, flags, exit codes, --json shapes
- zap compose · zap runtime up|ps|exec|down · zap agent new|ls|render|lint · zap deploy [--watch|--alias <alias>] · zap session --agent <id>[@alias] [--live] --json "…" · zap secret set|list|remove · zap fs · zap media · zap ffmpeg <preset> · zap memory · zap pay · zap mcp · zap doctor --json

## Agents as code
- /docs/agents — the model, hook table, capabilities, secrets and egress, sessions and deploys
- /docs/agents/quickstart — zap agent new → zap deploy --watch → zap session
- /docs/reference/agent-api — @wzrdtech/zap-agent exports

## Runtime
- /docs/runtime — what a runtime is, weights, lifecycle, self-host and managed modes
- /docs/compose — Runtime.md, profiles, plugin graph
- /docs/isolation — VM, process sandbox, microVM, WASM lanes, GPU lanes
- /docs/mediafs — media file system and ffmpeg presets

## Templates
- /docs/templates/zap-light · zap-light-ffmpeg · zap-light-code · zap-light-browser · zap-med · zap-med-genmedia · zap-med-interpreter · zap-med-fx · zap-heavy · zap-heavy-<harness> · env-omarchy · env-macos (one page per template)

## Providers
- /docs/providers/box · namespace · selfhost · microsandbox · hyperlight · e2b · daytona · cloudflare · modal · docker (sandboxes)
- /docs/providers/openviking · mem0 · zep (memory)
- /docs/providers/openrouter · ai-gateway · openai · anthropic · xai · gmi · fal · prodia · runware · replicate · vertex · aws (gateway)
- /docs/providers/thirdweb · cdp · mpp (pay)
- /docs/providers/context7 · open-connector · composio (API store)

## Harnesses
- /docs/harnesses — the catalog of third-party harness templates a heavy runtime can host, with ports, auth and run adapters

## Pay
- /docs/pay — BYOK, managed x402 / MPP, quotes, meter, caps · /docs/auth — wallet, Claude Code, Codex login

## Kernel and contracts
- /docs/kernel — Context, effects, services, forks, events
- /docs/sandbox-contract — SandboxProvider / SandboxHandle / SandboxSpec / ExecResult
- /docs/agent-plugin — install Zap as a plugin in your coding agent
```
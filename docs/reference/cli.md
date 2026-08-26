# CLI Reference

The publishable package is `@wzrdtech/zap`; it exposes the `zap` binary.

## Install and invoke

Use Node 24.x. For one-off commands:

```bash
npx --yes @wzrdtech/zap@0.3.1 --version
```

After a project-local install, invoke the binary with `npm exec` (or from an npm
script). npm does not add `node_modules/.bin` to zsh's global `PATH`:

```bash
npm install --save-dev @wzrdtech/zap@0.3.1
npm exec -- zap --version
```

If you want to type `zap` directly in any directory, install globally:

```bash
npm install --global @wzrdtech/zap@0.3.1
zap --version
```

## Commands

The list below is generated from the discovered command set by
`node scripts/sync-cli-docs.mjs`; run it after adding or changing commands.

{/* zap-commands:start */}
- `zap add <registry-name> [--force] [--json]` — Add a registry Zap.
- `zap compose [Runtime.md|zap.config.ts] [--dry-run] [--json]` — Resolve Runtime.md or zap.config.ts into the runtime plugin tree.
- `zap deploy <slug|Zap.md> [--finalize] [--json]` — Upload a draft Zap to the hosted API.
- `zap dev` — Start the web app dev server.
- `zap docs [topic] [--json]` — Print bundled docs.
- `zap doctor [--json]` — Check local setup.
- `zap embed <slug> [--base-url https://zap.wzrd.tech] [--json]` — Print iframe/oEmbed embed snippets.
- `zap feedback <message> [--json]` — Store local feedback.
- `zap ffmpeg <preset> <input> <output> [--live] [--json]` — Plan (default) or run ffmpeg presets against local media.
- `zap finalize <slug> [--token ...] [--api-url ...] [--json]` — Finalize a deployed draft into the gallery.
- `zap fs <ls|read|write|rm> <runtime-id> <path> [content] [--json]` — Runtime filesystem operations (ls, read, write, rm).
- `zap gallery [--remote] [--json]` — List local recipes; add --remote for hosted gallery.
- `zap harness <ls|bake <template>|doctor <id|template>|run <template> --prompt <p>> [--live] [--json]` — List, bake, doctor, and run zap-heavy harness templates.
- `zap import <hyperframes|openmontage> [--source path] [--limit n] [--force] [--json]` — Import hyperframes or openmontage templates.
- `zap improve <slug|Zap.md> [--json] [--write]` — Propose a version bump from run and feedback evidence.
- `zap info [--json]` — Print environment info.
- `zap init <directory> [--non-interactive] [--empty] [--example <slug>] [--json]` — Create a lightweight Zap project.
- `zap inspect <slug|Zap.md> [--json]` — Show provider/model plan details.
- `zap keys [add|list|test|remove|sync] [--json]` — Manage encrypted BYOK provider keys.
- `zap lint [Zap.md ...] [--json]` — Run recipe policy checks.
- `zap login --token <token> [--api-url ...] | zap login --provider <id> [--json]` — Store a Zap API token, or device-auth via --provider.
- `zap logout [--json]` — Remove the stored Zap API token.
- `zap mcp [--http [--host 127.0.0.1] [--port 3910]] [--json]` — Start the Zap MCP server (stdio by default, --http for HTTP).
- `zap media <ls|info> [path] [--json]` — Inspect local media outputs under .zap/runs.
- `zap memory <subcommand>` — Run `zap memory \<subcommand>`.
- `zap new <slug> [--force] [--json]` — Scaffold agent/skills/zap-\<slug>.
- `zap pay <subcommand> [--json]` — Payer status, managed wallet login/logout, and payment quotes.
- `zap run <slug|Zap.md> [--input KEY=VALUE] [--budget-cap-usd N] [--live] [--json]` — Plan a Zap by default; use --live to submit providers.
- `zap runtime <up|down|ps|logs|exec|snapshot|fork|stop|resume|desktop|import-sprite> [...] [--json]` — Manage Zap runtimes (up, down, ps, logs, exec, snapshot, fork, stop, resume, desktop, import-sprite).
- `zap search <query> [--remote] [--json]` — Search registry templates; add --remote for hosted search.
- `zap skills [generate|update|check] [--json]` — Generate or check skills/skills-manifest.json.
- `zap status [runId] [--json]` — Show local run status.
- `zap studio` — Start the web studio.
- `zap telemetry [on|off|status] [--json]` — Manage local telemetry preference.
- `zap template <ls|show> [name] [--json]` — List or show runtime templates under .zap/templates.
- `zap upgrade [--json]` — Print upgrade guidance.
- `zap validate [Zap.md ...] [--json]` — Validate one or more recipes.
{/* zap-commands:end */}

### Recipe workflow

- `zap run <Zap.md>` performs a zero-spend plan by default.
- `zap run <Zap.md> --live` submits live provider work with locally stored BYOK keys. Live runs require a payer; without one they fail with `PAYER_MISSING`.
- `zap run <Zap.md> --budget-cap-usd <n>` overrides the recipe spend cap for that run.
- `zap improve <slug|Zap.md>` proposes a version bump from Convex run/feedback evidence when `CONVEX_URL` is configured, plus local `.zap` traces as offline evidence.

### Runtime workflow

- `zap compose [Runtime.md|zap.config.ts] --dry-run --json` resolves a runtime definition into its deterministic plugin tree without acquiring anything. Equivalent `Runtime.md` and `zap.config.ts` definitions produce identical trees and lock hashes.
- `zap runtime up|down|ps|logs|exec|snapshot|fork|stop|resume|desktop|import-sprite` manages runtime lifecycles. `zap runtime exec <id> --prompt ...` counts as spend and requires a payer.
- `zap fs <ls|read|write|rm> <runtime-id> <path>` operates on a runtime's filesystem.
- `zap media <ls|info>` inspects local media outputs and `zap template <ls|show>` lists runtime templates.
- `zap ffmpeg <preset> <input> <output>` prints the ffmpeg plan by default; `--live` executes it and requires a payer.

### Auth

- `zap login --token <token>` stores the Zap API token under the `apiToken` key of `.zap/auth.json`.
- `zap login --provider <id>` runs provider device auth (ships with the runtime device-auth module; until then it reports `PROVIDER_LOGIN_UNAVAILABLE`).
- `zap logout` clears only the API token; managed-payer credentials under the `managed` namespace are preserved for `zap pay logout`.

## Machine-readable output and errors

Every command supports `--json`. Failures with `--json` print a structured
error object and exit non-zero:

```json
{
  "error": {
    "code": "PAYER_MISSING",
    "message": "zap run --live requires a payer, and none is configured.",
    "retryable": false,
    "remediation": [
      "zap keys add <provider> …",
      "zap login --provider claude-code",
      "zap pay login --managed"
    ]
  }
}
```

Exit codes: `0` success, `1` failure, `2` usage error.

## Adding a command domain

Commands are auto-discovered from `packages/cli/src/commands/<domain>/index.js`.
A domain module exports a `command` object (or a `commands` array):

```js
// @ts-check
/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "pay",
  summary: "Payer status and managed-payer login",
  usage: "zap pay <status|login|logout> [--json]",
  run: async ({ args, flags, cwd }) => {
    // ...
  },
};
```

No dispatcher edits are needed: `zap help`, `zap <name> --help`, and
`node scripts/sync-cli-docs.mjs` pick the command up automatically. Commands
must support `--json` and throw `ZapCliError` (see
`packages/cli/src/lib/errors.js`) for structured failures.

## Safety Defaults

CLI runs are plan-only unless `--live` is provided, and every live/spending
path requires a configured payer. Telemetry is off unless the user explicitly
runs `zap telemetry on`.

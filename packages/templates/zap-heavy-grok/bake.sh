#!/usr/bin/env bash
# zap-heavy-grok overlay: applied over zap-heavy-opencode via POST /boxes
# {from, setupScript} or /commands after ready. Sets the xAI route as the
# default LLM. No secrets baked: XAI_API_KEY arrives at runtime via the BYOK
# allowlist only; it never exists in this overlay or its parent snapshot.
set -euo pipefail

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".config", "opencode", "opencode.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.model = "xai/grok-code-fast-1";
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
'

# ZAP_LLM_ROUTE=xai is the gateway default for this overlay; recorded here as
# non-secret metadata so doctor can report the xAI-routed status.
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-grok";
  prev.llmRoute = "xai";
  prev.pins = { ...(prev.pins ?? {}), "opencode-ai": "0.6.4" };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-grok complete"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

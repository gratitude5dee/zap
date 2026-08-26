#!/usr/bin/env bash
# Render per-box values into ~/.openclaw/openclaw.json at boot: generate the
# auth token on first boot; in managed mode point models.providers.zap.baseUrl
# at the runtime's gateway proxy. Never writes a provider key.
set -euo pipefail

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const file = path.join(process.env.HOME, ".openclaw", "openclaw.json");
  // Zap renders the file as strict JSON (a JSON5 subset).
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!config.gateway.auth.token) {
    config.gateway.auth.token = crypto.randomBytes(32).toString("base64url");
  }
  if (process.env.ZAP_PAYER_MODE === "managed" && process.env.ZAP_MANAGED_GATEWAY_URL) {
    config.models.providers.zap = {
      baseUrl: `${process.env.ZAP_MANAGED_GATEWAY_URL}/llm/v1`,
    };
  }
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
'

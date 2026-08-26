#!/usr/bin/env bash
# Render ~/.config/opencode/.env at boot: per-box OPENCODE_SERVER_PASSWORD on
# first boot; in managed mode set provider.zap.options.baseURL to the gateway
# proxy in opencode.json. Never writes a provider key.
set -euo pipefail

ENV_FILE="${HOME}/.config/opencode/.env"

if [ ! -f "${ENV_FILE}" ]; then
  umask 077
  echo "OPENCODE_SERVER_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 43)" > "${ENV_FILE}"
fi

if [ "${ZAP_PAYER_MODE:-}" = "managed" ] && [ -n "${ZAP_MANAGED_GATEWAY_URL:-}" ]; then
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const file = path.join(process.env.HOME, ".config", "opencode", "opencode.json");
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    config.provider.zap = {
      options: { baseURL: `${process.env.ZAP_MANAGED_GATEWAY_URL}/llm/v1` },
    };
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  '
fi

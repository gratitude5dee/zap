#!/usr/bin/env bash
# Render ~/.hermes/.env at boot. Generates the per-box API_SERVER_KEY on first
# boot only (sticky across resumes); in managed mode points OPENAI_BASE_URL at
# the runtime's gateway proxy. Never writes a provider key.
set -euo pipefail

ENV_FILE="${HOME}/.hermes/.env"

if [ ! -f "${ENV_FILE}" ]; then
  umask 077
  {
    echo "API_SERVER_HOST=0.0.0.0"
    echo "API_SERVER_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 43)"
  } > "${ENV_FILE}"
fi

if [ "${ZAP_PAYER_MODE:-}" = "managed" ] && [ -n "${ZAP_MANAGED_GATEWAY_URL:-}" ]; then
  grep -v '^OPENAI_BASE_URL=' "${ENV_FILE}" > "${ENV_FILE}.tmp" || true
  echo "OPENAI_BASE_URL=${ZAP_MANAGED_GATEWAY_URL}/llm/v1" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "${ENV_FILE}"
fi

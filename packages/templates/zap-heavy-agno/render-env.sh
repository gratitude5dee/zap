#!/usr/bin/env bash
# Render /opt/zap/agno/.env at boot: per-box OS_SECURITY_KEY on first boot;
# managed mode points OPENAI_BASE_URL at the gateway proxy. Never a provider key.
set -euo pipefail

ENV_FILE="/opt/zap/agno/.env"
if [ ! -f "${ENV_FILE}" ]; then
  umask 077
  echo "OS_SECURITY_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 43)" > "${ENV_FILE}"
fi
if [ "${ZAP_PAYER_MODE:-}" = "managed" ] && [ -n "${ZAP_MANAGED_GATEWAY_URL:-}" ]; then
  grep -v '^OPENAI_BASE_URL=' "${ENV_FILE}" > "${ENV_FILE}.tmp" || true
  echo "OPENAI_BASE_URL=${ZAP_MANAGED_GATEWAY_URL}/llm/v1" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "${ENV_FILE}"
fi

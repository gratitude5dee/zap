#!/usr/bin/env bash
# Render ~/.exo/.env and the exo model binding at boot. Generates the per-box
# API_SERVER_KEY on first boot only (sticky across resumes); in managed mode
# points the exo `gateway` model at the runtime's gateway proxy. Never writes
# a provider key to disk: BYOK keys stay in the exoharness secret store, which
# is populated from the runtime env allowlist.
set -euo pipefail

EXO_ROOT="${HOME}/.exo"
ENV_FILE="${EXO_ROOT}/.env"
AGENT_SLUG="${EXO_AGENT:-zap}"
MODEL_NAME="gateway"

if [ ! -f "${ENV_FILE}" ]; then
  umask 077
  {
    echo "API_SERVER_HOST_PORT=0.0.0.0:8642"
    echo "API_SERVER_KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 43)"
    echo "EXO_AGENT=${AGENT_SLUG}"
  } > "${ENV_FILE}"
fi

exo_cli() {
  exo --root "${EXO_ROOT}" --harness exo "$@"
}

register_model() {
  # $1 secret name, $2 upstream model, $3 base url (may be empty for BYOK)
  local secret="$1" model="$2" base_url="$3"
  local args=(model register "${MODEL_NAME}" --model "${model}" --secret "${secret}")
  if [ -n "${base_url}" ]; then
    args+=(--base-url "${base_url}")
  fi
  exo_cli "${args[@]}"
}

if [ "${ZAP_PAYER_MODE:-}" = "managed" ] && [ -n "${ZAP_MANAGED_GATEWAY_URL:-}" ]; then
  base_url="${ZAP_MANAGED_GATEWAY_URL}/llm/v1"
  grep -v '^EXO_MODEL_BASE_URL=' "${ENV_FILE}" > "${ENV_FILE}.tmp" || true
  echo "EXO_MODEL_BASE_URL=${base_url}" >> "${ENV_FILE}.tmp"
  mv "${ENV_FILE}.tmp" "${ENV_FILE}"
  # The proxy authenticates the runtime, not a provider key; exo still needs a
  # named secret for the binding, so store the (non-provider) gateway token.
  ZAP_MANAGED_GATEWAY_TOKEN="${ZAP_MANAGED_GATEWAY_TOKEN:-managed}" \
    exo_cli secret set ZAP_GATEWAY_TOKEN --env ZAP_MANAGED_GATEWAY_TOKEN
  register_model ZAP_GATEWAY_TOKEN "${ZAP_LLM_GATEWAY_MODEL:-openai/gpt-5}" "${base_url}"
elif [ -n "${OPENAI_API_KEY:-}" ]; then
  exo_cli secret set OPENAI_API_KEY --env OPENAI_API_KEY
  register_model OPENAI_API_KEY "${ZAP_LLM_OPENAI_MODEL:-gpt-5}" ""
elif [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  exo_cli secret set ANTHROPIC_API_KEY --env ANTHROPIC_API_KEY
  register_model ANTHROPIC_API_KEY "${ZAP_LLM_ANTHROPIC_MODEL:-claude-sonnet-4-5}" ""
fi

# The Zap agent: exo harness module + the Zap recipe tool module, one agent
# per box; `exo agentd --agent` turns every Air session into a conversation.
if ! exo_cli agent show "${AGENT_SLUG}" >/dev/null 2>&1; then
  exo_cli agent create "Zap" \
    --slug "${AGENT_SLUG}" \
    --module /opt/exo/exo/harness.ts \
    --model "${MODEL_NAME}" \
    --tool-module /zap/exo/zap-tools.mjs
fi

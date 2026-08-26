#!/usr/bin/env bash
# Gateway: install the media provider adapters the in-VM CLI uses for quoting
# and pin the env allowlist. No key material is ever written into the snapshot.
set -euo pipefail

npm install -g @wzrdtech/providers >/dev/null

install -d -m 0755 /zap
cat > /zap/gateway-env-allowlist <<'EOF'
OPENROUTER_API_KEY
AI_GATEWAY_API_KEY
OPENAI_API_KEY
ANTHROPIC_API_KEY
XAI_API_KEY
GMI_API_KEY
FAL_KEY
PRODIA_API_KEY
RUNWARE_API_KEY
REPLICATE_API_TOKEN
ZAP_LLM_ROUTE
ZAP_LLM_OPENROUTER_MODEL
ZAP_LLM_GATEWAY_MODEL
ZAP_LLM_OPENAI_MODEL
ZAP_LLM_ANTHROPIC_MODEL
ZAP_LLM_XAI_MODEL
ZAP_LLM_GMI_MODEL
EOF

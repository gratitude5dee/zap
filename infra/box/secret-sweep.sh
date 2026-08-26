#!/usr/bin/env bash
# Secret sweep for template directories and named snapshots — surfaces where
# no key may ever exist (C6/C18). Ported from airv2's box sweep, extended with
# Box/Thirdweb/CDP/MPP/RUNTIME_TOKEN patterns.
#
#   infra/box/secret-sweep.sh [path ...]        # default: packages/templates
#   infra/box/secret-sweep.sh --box <box-id>    # sweep a live named-snapshot box
#
# Exit 0 = zero hits; exit 1 = at least one hit (printed with file:line, the
# matched value itself is never echoed). Tenant runtime boxes in BYOK
# keysInRuntime:true mode legitimately hold the tenant's own keys and are
# excluded from this sweep (they are covered by the redaction canary tests).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Pattern set: provider keys, Box, Thirdweb, CDP, MPP, runtime tokens.
PATTERNS=(
  'sk-[A-Za-z0-9_-]{16,}'                       # OpenAI / generic sk-
  'sk-ant-[A-Za-z0-9_-]{16,}'                   # Anthropic
  'xai-[A-Za-z0-9_-]{16,}'                      # xAI
  'AKIA[0-9A-Z]{16}'                            # AWS access key
  'ghp_[A-Za-z0-9]{36}'                         # GitHub PAT
  'box_[A-Za-z0-9]{20,}'                        # ascii.dev Box API key
  'tw_secret_[A-Za-z0-9_-]{16,}'                # Thirdweb secret key
  'cdp_[A-Za-z0-9_-]{16,}'                      # Coinbase CDP
  'mpp_[A-Za-z0-9_-]{16,}'                      # MPP
  'rt_(live|secret)_[A-Za-z0-9_-]{16,}'         # runtime tokens
  'RUNTIME_TOKEN=[^[:space:]"'"'"']{8,}'
  '(OPENAI|ANTHROPIC|DEEPSEEK|XAI|MOONSHOT)_API_KEY=[^[:space:]"'"'"']{8,}'
  '-----BEGIN( [A-Z]+)? PRIVATE KEY-----'
)

GREP_ARGS=()
for pattern in "${PATTERNS[@]}"; do
  GREP_ARGS+=(-e "${pattern}")
done

sweep_paths() {
  local hits=0 file lines line
  for target in "$@"; do
    # Print file:line only — never the matched secret value.
    while IFS= read -r file; do
      lines="$(grep -nIE "${GREP_ARGS[@]}" "${file}" | cut -d: -f1)"
      while IFS= read -r line; do
        echo "HIT ${file}:${line}"
      done <<< "${lines}"
      hits=1
    done < <(grep -rIlE --exclude-dir node_modules --exclude-dir dist \
      "${GREP_ARGS[@]}" "${target}" 2>/dev/null)
  done
  return "${hits}"
}

if [ "${1:-}" = "--box" ]; then
  BOX_ID="${2:?usage: secret-sweep.sh --box <box-id>}"
  API="${BOX_API_URL:-https://ascii.dev/api/box/v1}"
  KEY="${BOX_API_KEY:?BOX_API_KEY required}"
  # Sweep the snapshot filesystem surfaces where a key could have been baked.
  CMD='grep -rIlE '"'"'sk-[A-Za-z0-9_-]{16,}|xai-[A-Za-z0-9_-]{16,}|box_[A-Za-z0-9]{20,}|tw_secret_|cdp_[A-Za-z0-9_-]{16,}|mpp_[A-Za-z0-9_-]{16,}|RUNTIME_TOKEN=|API_KEY=[^ ]{8,}|BEGIN [A-Z]* ?PRIVATE KEY'"'"' /home /root /etc/systemd /zap 2>/dev/null | head -50; true'
  RESULT=$(curl -fsS -X POST -H "Authorization: Bearer ${KEY}" -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "${CMD}" '{command:$c, timeoutSeconds:300}')" \
    "${API}/boxes/${BOX_ID}/commands" | jq -r '.stdout // ""')
  # Per-box generated credentials (API_SERVER_KEY etc.) are expected on live
  # boxes but must NOT be in a snapshot build box before first boot; the
  # builder runs this sweep pre-boot. Report file paths only.
  if [ -n "${RESULT}" ]; then
    echo "${RESULT}" | sed 's/^/HIT /'
    echo "secret-sweep: FAIL (${BOX_ID})" >&2
    exit 1
  fi
  echo "secret-sweep: clean (${BOX_ID})"
  exit 0
fi

TARGETS=("$@")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=("${REPO_ROOT}/packages/templates")
fi

if sweep_paths "${TARGETS[@]}"; then
  echo "secret-sweep: clean"
  exit 0
fi
echo "secret-sweep: FAIL" >&2
exit 1

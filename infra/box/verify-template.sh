#!/usr/bin/env bash
# Verify a Box template snapshot: create a box FROM the snapshot (noEnv:true),
# run doctor.sh, stop it. Removal (verify item 13, verified live 2026-08-26)
# requires X-Ascii-Confirm-Delete: <box id>; opt in with ZAP_BOX_DELETE_VERIFIED=1.
#
#   BOX_API_KEY=… infra/box/verify-template.sh zap-light
set -euo pipefail

TEMPLATE="${1:?usage: verify-template.sh <template-name>}"
API="${BOX_API_URL:-https://ascii.dev/api/box/v1}"
KEY="${BOX_API_KEY:?BOX_API_KEY required}"
AUTH=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "${AUTH[@]}" -d "$body" "$API$path"
  else
    curl -fsS -X "$method" "${AUTH[@]}" "$API$path"
  fi
}

BOX_ID=$(api POST /boxes "$(jq -n --arg t "$TEMPLATE" \
  '{name:("zap-verify-" + $t), from:$t, ttlSeconds:3600, noEnv:true, tags:{purpose:"zap-verify"}}')" | jq -r .id)
echo "verify box: $BOX_ID"

api POST "/boxes/$BOX_ID/commands" \
  "$(jq -n '{command:"bash /home/user/template/doctor.sh", timeoutSeconds:600}')"

# Never force — C-series rule; stop and leave the disk.
api POST "/boxes/$BOX_ID/stop"

if [ "${ZAP_BOX_DELETE_VERIFIED:-0}" = "1" ]; then
  curl -fsS -X DELETE "${AUTH[@]}" -H "X-Ascii-Confirm-Delete: $BOX_ID" "$API/boxes/$BOX_ID"
  echo "removed $BOX_ID"
else
  echo "$BOX_ID stopped and tagged zap-verify (manual sweep removes it)"
fi
echo "verify-template: OK"

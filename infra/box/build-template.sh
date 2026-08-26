#!/usr/bin/env bash
# Build (or rebuild) a Box template snapshot from packages/templates/<name>.
#
#   BOX_API_KEY=… infra/box/build-template.sh zap-light
#
# Flow: create box (type default, ttl 7200) → upload the template dir (files
# API) → run bake.sh via /commands (detached + /events when > 600 s) →
# doctor.sh → warm cycle (stop → resume → doctor → stop) → snapshot under the
# template name (replacing the prod snapshot in place) → record the result in
# packages/templates/registry.json and docs/verify-log.md.
set -euo pipefail

TEMPLATE="${1:?usage: build-template.sh <template-name>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_DIR="$REPO_ROOT/packages/templates/$TEMPLATE"
API="${BOX_API_URL:-https://ascii.dev/api/box/v1}"
KEY="${BOX_API_KEY:?BOX_API_KEY required}"
AUTH=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

[ -d "$TEMPLATE_DIR" ] || { echo "no such template: $TEMPLATE_DIR" >&2; exit 1; }

api() { # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "${AUTH[@]}" -d "$body" "$API$path"
  else
    curl -fsS -X "$method" "${AUTH[@]}" "$API$path"
  fi
}

run_cmd() { # run_cmd <box-id> <command> [timeout-seconds]
  local box="$1" cmd="$2" timeout="${3:-600}"
  api POST "/boxes/$box/commands" \
    "$(jq -n --arg c "$cmd" --argjson t "$timeout" '{command:$c, timeoutSeconds:$t}')"
}

echo "creating build box for $TEMPLATE…"
BOX_ID=$(api POST /boxes "$(jq -n --arg n "zap-build-$TEMPLATE" \
  '{name:$n, type:"default", ttlSeconds:7200, noEnv:true}')" | jq -r .id)
echo "box: $BOX_ID"

echo "uploading template dir…"
while IFS= read -r -d '' file; do
  rel="${file#"$TEMPLATE_DIR"/}"
  curl -fsS -X PUT -H "Authorization: Bearer $KEY" \
    --data-binary @"$file" \
    "$API/boxes/$BOX_ID/fs/write?path=/home/user/template/$rel"
done < <(find "$TEMPLATE_DIR" -type f -print0)

echo "baking (detached; watching /events)…"
run_cmd "$BOX_ID" "bash /home/user/template/bake.sh" 3600

echo "doctor…"
run_cmd "$BOX_ID" "bash /home/user/template/doctor.sh"

echo "warm cycle: stop → resume → doctor → stop…"
api POST "/boxes/$BOX_ID/stop"
api POST "/boxes/$BOX_ID/resume" '{}'
run_cmd "$BOX_ID" "bash /home/user/template/doctor.sh"
api POST "/boxes/$BOX_ID/stop"

echo "snapshotting as $TEMPLATE…"
SNAPSHOT_ID=$(api POST "/boxes/$BOX_ID/snapshot" \
  "$(jq -n --arg n "$TEMPLATE" '{name:$n}')" | jq -r .id)

SHA=$(cd "$TEMPLATE_DIR" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
BAKED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
REGISTRY="$REPO_ROOT/packages/templates/registry.json"
[ -f "$REGISTRY" ] || echo '{}' > "$REGISTRY"
jq --arg name "$TEMPLATE" --arg box "$BOX_ID" --arg snap "$SNAPSHOT_ID" \
   --arg sha "$SHA" --arg at "$BAKED_AT" \
   '.[$name] = {name:$name, boxId:$box, snapshotId:$snap, sha256:$sha, bakedAt:$at}' \
   "$REGISTRY" > "$REGISTRY.tmp" && mv "$REGISTRY.tmp" "$REGISTRY"

echo "recorded in registry.json; add the evidence line to docs/verify-log.md:"
echo "  $BAKED_AT $TEMPLATE snapshot=$SNAPSHOT_ID box=$BOX_ID sha256=$SHA"

#!/usr/bin/env bash
# env-macos (darwin/arm64) setup. Run by bootstrap.sh on a fresh Namespace
# Apple-silicon instance. Ports the Box template conventions:
#   apt → brew, systemd → launchd (per-user LaunchAgents, labels
#   tech.wzrd.zap.<service>), hosted routes → Namespace ingress + the control
#   bridge (infra/namespace/bridge/bridge.py).
#
# Per-instance env from the control plane: TENANT_ID, RUNTIME_ID,
# RUNTIME_TOKEN, GATEWAY_URL, GATEWAY_TOKEN, ZAP_BRIDGE_PORT.
set -euo pipefail

HOME_DIR="$HOME"
TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$TEMPLATE_DIR/../../.." && pwd)"
ZAP_DIR="$HOME_DIR/.zap"
AGENTS_DIR="$HOME_DIR/Library/LaunchAgents"
LOG_DIR="$HOME_DIR/Library/Logs/zap"
mkdir -p "$ZAP_DIR" "$AGENTS_DIR" "$LOG_DIR" "$HOME_DIR/zap/fs" "$HOME_DIR/zap/runs"

# ── 0. The bridge FIRST: provisioning polls its /v1/health, and it reports
# ready only once .bootstrap-complete exists. ────────────────────────────────
cp "$INFRA_DIR/infra/namespace/bridge/bridge.py" "$ZAP_DIR/bridge.py"

write_agent() { # write_agent <service> <program...>
  local service="$1"; shift
  local args=""
  for arg in "$@"; do args+="    <string>$arg</string>\n"; done
  printf '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>tech.wzrd.zap.%s</string>
  <key>ProgramArguments</key>
  <array>
%b  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUNTIME_TOKEN</key><string>%s</string>
    <key>ZAP_BRIDGE_PORT</key><string>%s</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>%s/%s.log</string>
  <key>StandardErrorPath</key><string>%s/%s.err.log</string>
</dict>
</plist>\n' "$service" "$args" "${RUNTIME_TOKEN:-}" "${ZAP_BRIDGE_PORT:-8722}" \
    "$LOG_DIR" "$service" "$LOG_DIR" "$service" \
    > "$AGENTS_DIR/tech.wzrd.zap.$service.plist"
  launchctl bootout "gui/$(id -u)/tech.wzrd.zap.$service" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS_DIR/tech.wzrd.zap.$service.plist"
}
write_agent bridge /usr/bin/python3 "$ZAP_DIR/bridge.py"

# ── 1. Homebrew + base packages (brew where apt was) ─────────────────────────
if ! command -v brew >/dev/null; then
  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
eval "$(/opt/homebrew/bin/brew shellenv)"
grep -q 'brew shellenv' "$HOME_DIR/.zprofile" 2>/dev/null || \
  echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME_DIR/.zprofile"
brew install git jq openssl@3 ffmpeg node@24 python@3.12

# ── 2. Zap CLI + runtime + agentd ────────────────────────────────────────────
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm install -g "@wzrdtech/zap" "@wzrdtech/zap-runtime"
write_agent agentd "$(command -v zap-agentd)" serve

# ── 3. Capability manifest (no secrets — C1) ─────────────────────────────────
cat > "$ZAP_DIR/capabilities.json" <<EOF
{
  "template": "env-macos",
  "environment": "macos",
  "kind": "native",
  "kvm": false,
  "lanes": { "codegen": "process", "ffmpeg": "process", "media-workflows": "process" },
  "bakedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

touch "$ZAP_DIR/.bootstrap-complete"
echo "env-macos setup complete"

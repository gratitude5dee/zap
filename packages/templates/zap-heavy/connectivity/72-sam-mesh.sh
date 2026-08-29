#!/usr/bin/env bash
# Connectivity bake fragment 72: the SAM mesh node (opt-in, user-owned mesh).
#
# INSTALLED and DISABLED. Nothing here joins anything: enrollment needs an
# owner-supplied control-plane URL plus an owner-supplied bootstrap token, and
# neither exists at bake time. The mesh a box joins is the USER'S own mesh
# (their own control plane, their own nodes) — the tailnet pattern, never a
# platform-wide or cross-tenant mesh (I1). There is deliberately no default
# control-plane URL: no URL, no join.
#
# Two pieces, mirroring upstream's split:
#   sam-node  (github.com/google/sam)      — the agent/node that enrolls
#   mesh-llm  (github.com/Mesh-LLM/mesh-llm) — the mesh transport, joined by
#                                              private invite token only
# `mesh-llm --auto`/`--discover` (public/community mesh discovery) is never
# used: the unit joins by explicit invite token or does not run.
set -euo pipefail

SAM_MESH_HOME="${HOME:-/home/user}"
SAM_MESH_DIR="${SAM_MESH_HOME}/.zap/sam-mesh"
SAM_VERSION="${SAM_VERSION:-v0.1.0-alpha.7}"
MESH_LLM_VERSION="${MESH_LLM_VERSION:-v0.75.1}"

install -d -m 0700 "${SAM_MESH_DIR}"

sam_arch="$(uname -m)"
case "${sam_arch}" in
  x86_64) sam_asset_arch=x86_64; mesh_asset_arch=x86_64 ;;
  aarch64) sam_asset_arch=arm64; mesh_asset_arch=aarch64 ;;
  *) sam_asset_arch=""; mesh_asset_arch="" ;;
esac

if [ -z "${sam_asset_arch}" ]; then
  echo "WARN: unsupported arch ${sam_arch} — sam mesh unavailable" >&2
elif command -v sam-node >/dev/null 2>&1; then
  echo "sam-mesh: sam-node already installed"
else
  sam_tgz="/tmp/sam_${SAM_VERSION}.tar.gz"
  if curl -fsSL -o "${sam_tgz}" "https://github.com/google/sam/releases/download/${SAM_VERSION}/sam_Linux_${sam_asset_arch}.tar.gz" \
    && mkdir -p /tmp/sam-extract \
    && tar -xzf "${sam_tgz}" -C /tmp/sam-extract \
    && sudo install -m 755 /tmp/sam-extract/sam-node /usr/local/bin/sam-node; then
    echo "sam-mesh: sam-node ${SAM_VERSION} installed (disabled)"
  else
    echo "WARN: sam-node install failed — opt-in mesh unavailable" >&2
  fi
  rm -rf "${sam_tgz}" /tmp/sam-extract
fi

if command -v mesh-llm >/dev/null 2>&1; then
  echo "sam-mesh: mesh-llm already installed"
elif [ -n "${mesh_asset_arch}" ]; then
  mesh_tgz="/tmp/mesh-llm_${MESH_LLM_VERSION}.tar.gz"
  if curl -fsSL -o "${mesh_tgz}" "https://github.com/Mesh-LLM/mesh-llm/releases/download/${MESH_LLM_VERSION}/mesh-llm-${mesh_asset_arch}-unknown-linux-gnu.tar.gz" \
    && mkdir -p /tmp/mesh-llm-extract \
    && tar -xzf "${mesh_tgz}" -C /tmp/mesh-llm-extract \
    && sudo install -m 755 "$(find /tmp/mesh-llm-extract -name mesh-llm -type f | head -1)" /usr/local/bin/mesh-llm; then
    echo "sam-mesh: mesh-llm ${MESH_LLM_VERSION} installed (disabled)"
  else
    echo "WARN: mesh-llm install failed — opt-in mesh transport unavailable" >&2
  fi
  rm -rf "${mesh_tgz}" /tmp/mesh-llm-extract
fi

# The launcher reads owner-supplied config/credentials from 0600 files written
# by the enable path. Tokens never reach argv here either: sam-node takes
# --bootstrap-token-path / SAM_API_TOKEN, both file-backed.
cat > "${SAM_MESH_DIR}/run.sh" <<'RUN'
#!/usr/bin/env bash
# Refuses to run without owner-supplied enrollment material. There is no
# default control plane: an unconfigured box joins nothing.
set -euo pipefail
SAM_MESH_DIR="$HOME/.zap/sam-mesh"
CONFIG="$SAM_MESH_DIR/mesh.json"
BOOTSTRAP="$SAM_MESH_DIR/bootstrap-token"
[ -s "$CONFIG" ] || { echo "sam-mesh: no owner mesh config; refusing to start" >&2; exit 78; }

CONTROL_PLANE="$(node -e 'const c=require(process.argv[1]);process.stdout.write(String(c.controlPlaneUrl??""))' "$CONFIG")"
[ -n "$CONTROL_PLANE" ] || { echo "sam-mesh: no controlPlaneUrl; refusing to start" >&2; exit 78; }

if [ ! -f "$SAM_MESH_DIR/data/identity.json" ] && [ -s "$BOOTSTRAP" ]; then
  sam-node join --headless --data-dir "$SAM_MESH_DIR/data" --bootstrap-token-path "$BOOTSTRAP" "$CONTROL_PLANE"
fi

# Optional mesh-llm transport, joined by the owner's PRIVATE invite token.
# Never --auto/--discover: those join public community meshes. Upstream takes
# the token as an argument, so it is read here, on the box, from the 0600 file
# the owner's opt-in wrote — it never travels through the control plane's argv.
if [ -s "$SAM_MESH_DIR/mesh-invite-token" ] && command -v mesh-llm >/dev/null 2>&1; then
  mesh-llm serve --join "$(cat "$SAM_MESH_DIR/mesh-invite-token")" >>"$SAM_MESH_DIR/mesh-llm.log" 2>&1 &
fi

exec sam-node run --data-dir "$SAM_MESH_DIR/data" --api-token-path "$SAM_MESH_DIR/api-token" --bind-addr 127.0.0.1:8080
RUN
chmod 0755 "${SAM_MESH_DIR}/run.sh"

# Status probe for the control plane. Prints non-secret metadata only.
cat > "${SAM_MESH_DIR}/mesh-status.sh" <<'STATUS'
#!/usr/bin/env bash
set -uo pipefail
SAM_MESH_DIR="$HOME/.zap/sam-mesh"
installed=false; running=false; enrolled=false; control_plane=""
command -v sam-node >/dev/null 2>&1 && installed=true
systemctl is-active --quiet zap-sam-mesh.service && running=true
[ -f "$SAM_MESH_DIR/data/identity.json" ] && enrolled=true
if [ -s "$SAM_MESH_DIR/mesh.json" ]; then
  control_plane="$(node -e 'const c=require(process.argv[1]);process.stdout.write(String(c.controlPlaneUrl??""))' "$SAM_MESH_DIR/mesh.json" 2>/dev/null || echo "")"
fi
printf '{"installed":%s,"running":%s,"enrolled":%s,"controlPlaneUrl":"%s"}\n' \
  "$installed" "$running" "$enrolled" "$control_plane"
STATUS
chmod 0755 "${SAM_MESH_DIR}/mesh-status.sh"

sudo tee /etc/systemd/system/zap-sam-mesh.service >/dev/null <<'UNIT'
# Installed DISABLED. Starts only on an explicit owner opt-in that supplies the
# owner's own control-plane URL and bootstrap token; joins the owner's mesh only.
[Unit]
Description=Zap opt-in SAM mesh node (user-owned mesh)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/.zap/sam-mesh
ExecStart=/home/user/.zap/sam-mesh/run.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl disable zap-sam-mesh.service >/dev/null 2>&1 || true

SAM_PIN="${SAM_VERSION}" MESH_LLM_PIN="${MESH_LLM_VERSION}" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.pins = { ...(prev.pins ?? {}), sam: process.env.SAM_PIN, "mesh-llm": process.env.MESH_LLM_PIN };
  prev.connectivity = { ...(prev.connectivity ?? {}), samMesh: { installed: true, enabled: false } };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "connectivity: sam mesh installed, disabled (no mesh configured, no join)"

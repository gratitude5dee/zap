#!/usr/bin/env bash
# zap-heavy-exo bake: build exo at the pinned ref, install the `exo` CLI, and
# stage the Zap-flavoured exo agent (skills store + recipe tooling mounted).
# airv2 invariants: one user/one box, noEnv, per-box API_SERVER_KEY, only
# `exo agentd` inbound, hosted route re-registered by exo-host.service after
# every boot/resume.
# No secrets are baked: API_SERVER_KEY is generated per box at first boot and
# the model binding (BYOK key or managed gateway URL) is registered at boot by
# exo-render-env from the runtime env allowlist.
set -euo pipefail

TEMPLATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

EXO_REPO="https://github.com/gratitude5dee/exo"
EXO_REF="${EXO_REF:-main}"
EXO_SRC="/opt/exo"
EXO_ROOT="${HOME}/.exo"

# ── 1. Toolchain: exo is a Rust workspace + a TypeScript harness (pnpm). ────
if ! command -v cargo >/dev/null 2>&1; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck source=/dev/null
source "${HOME}/.cargo/env"
command -v pnpm >/dev/null 2>&1 || npm install -g pnpm

# ── 2. Source at the pinned ref; record the resolved sha as the C30 pin. ───
if [ ! -d "${EXO_SRC}/.git" ]; then
  git clone --depth 1 --branch "${EXO_REF}" "${EXO_REPO}" "${EXO_SRC}"
fi
EXO_SHA="$(git -C "${EXO_SRC}" rev-parse HEAD)"

# ── 3. Build the CLI (release) and the TypeScript harness deps. ──────────────
(cd "${EXO_SRC}" && cargo build --release -p exo)
install -m 0755 "${EXO_SRC}/target/release/exo" /usr/local/bin/exo
(cd "${EXO_SRC}" && pnpm install --frozen-lockfile)

# ── 4. exo state root (agent store, artifacts, skills catalog). ─────────────
install -d -m 0700 "${EXO_ROOT}"

# MCP config consumed by the Zap registration helper (OpenViking is on-VM).
cat > "${EXO_ROOT}/mcp.json" <<'EOF'
{
  "servers": {
    "openviking": { "url": "http://127.0.0.1:1933" }
  }
}
EOF

# ── 5. zap-heavy character: skills store + recipe/media tooling for exo. ────
# /zap/skills is the shared store seeded by zap-heavy; exo's own SKILL.md
# catalog lives in its artifact store, so seed it from the Zap recipes and
# expose the recipe/media tool modules the exo harness loads at agent create.
install -d -m 0755 "${EXO_ROOT}/skills" /zap/exo
for skill in /zap/skills/zap-*/; do
  [ -d "${skill}" ] || continue
  ln -sfn "${skill%/}" "${EXO_ROOT}/skills/$(basename "${skill}")"
done
install -m 0644 "${TEMPLATE_DIR}/zap-tools.mjs" /zap/exo/zap-tools.mjs
install -m 0644 "${TEMPLATE_DIR}/SOUL.md" "${EXO_ROOT}/SOUL.md"

# ── 6. Boot-time env render + units. ───────────────────────────────────────
# ~/.exo/.env is rendered at first boot by exo-agentd.service ExecStartPre:
# API_SERVER_HOST_PORT=0.0.0.0:8642, per-box random API_SERVER_KEY, and in
# managed mode EXO_MODEL_BASE_URL=${ZAP_MANAGED_GATEWAY_URL}/llm/v1 — never a
# provider key.
install -m 0755 "${TEMPLATE_DIR}/render-env.sh" /usr/local/bin/exo-render-env

for unit in exo-agentd exo-host; do
  install -m 0644 "${TEMPLATE_DIR}/units/${unit}.service" \
    "/etc/systemd/system/${unit}.service"
  systemctl enable "${unit}.service"
done

# Air reads the baked exo ref from the state dir (mirrors ~/.hermes/.template-hermes-ref).
printf '%s\n' "${EXO_SHA}" > "${EXO_ROOT}/.template-exo-ref"

EXO_REF="${EXO_REF}" EXO_SHA="${EXO_SHA}" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.template = "zap-heavy-exo";
  prev.pins = { ...(prev.pins ?? {}), EXO_REF: process.env.EXO_REF, EXO_SHA: process.env.EXO_SHA };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "bake: zap-heavy-exo complete (exo@${EXO_SHA})"

# ── Optional connectivity (installed, DISABLED, opt-in per runtime) ───────
# Fragments are synced from infra/connectivity by scripts/sync-connectivity.mjs.
# Each runs in its own shell so a best-effort download can never fail the bake,
# and none of them enables, starts, or joins anything.
CONNECTIVITY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/connectivity"
for connectivity_fragment in "${CONNECTIVITY_DIR}"/[0-9]*.sh; do
  echo "bake: connectivity/${connectivity_fragment##*/}"
  bash "${connectivity_fragment}" || echo "WARN: ${connectivity_fragment##*/} failed; feature stays uninstalled" >&2
done

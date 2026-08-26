#!/usr/bin/env bash
# zap-heavy bake fragment 40: OpenViking on-VM memory (loopback :1933).
# Sourced by bake.sh. Memory is content; it lives on the VM under
# ~/.zap/memory/openviking and the server binds 127.0.0.1 only.
set -euo pipefail

OV_ROOT="${HOME}/.zap/memory/openviking"
FRAGMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(dirname "${FRAGMENT_DIR}")"

mkdir -p "${OV_ROOT}/data"
chmod 700 "${HOME}/.zap/memory" "${OV_ROOT}"

# [local-embed] pulls llama-cpp-python (built from source), so the toolchain.
sudo apt-get install -y --no-install-recommends cmake build-essential

uv venv "${OV_ROOT}/venv" --python 3.12
uv pip install --python "${OV_ROOT}/venv/bin/python" \
  'openviking[local-embed]==0.4.13' \
  'openviking-sdk==0.1.7'

# Render the loopback-only config when absent; `ovctl ensure` re-renders and
# keeps it in sync after provisioning.
if [ ! -f "${OV_ROOT}/ov.conf" ]; then
  cat > "${OV_ROOT}/ov.conf" <<CONF
{
  "storage": {
    "workspace": "${OV_ROOT}/data",
    "agfs": { "backend": "local" },
    "vectordb": { "backend": "local" }
  },
  "server": { "host": "127.0.0.1", "port": 1933, "auth_mode": "dev" },
  "log": { "level": "warning" }
}
CONF
  chmod 600 "${OV_ROOT}/ov.conf"
fi

# Keep venv/build caches out of the box snapshot.
touch "${HOME}/.boxignore"
for pattern in \
  ".zap/memory/openviking/venv/" \
  ".zap/memory/openviking/data/tmp/" \
  ".cache/uv/"; do
  grep -qxF "${pattern}" "${HOME}/.boxignore" || echo "${pattern}" >> "${HOME}/.boxignore"
done

sudo cp "${TEMPLATE_DIR}/units/zap-openviking.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable zap-openviking.service
sudo systemctl start zap-openviking.service || echo "WARN: zap-openviking failed to start — memory degraded" >&2

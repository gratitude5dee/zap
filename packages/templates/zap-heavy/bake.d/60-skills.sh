#!/usr/bin/env bash
# zap-heavy bake fragment 60: skills store + heavy units. Sourced by bake.sh.
# Skills are content: they live on the VM under /zap/skills and are synced by
# the runtime filesystem tools, never baked with secrets.
set -euo pipefail

FRAGMENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$(dirname "${FRAGMENT_DIR}")"

install -d -m 0755 /zap/skills /zap/fs/repos

# Seed the skills store index; harness overlays append their own entries.
if [ ! -f /zap/skills/index.json ]; then
  printf '{\n  "skills": []\n}\n' > /zap/skills/index.json
fi

install -m 0644 "${TEMPLATE_DIR}/units/zap-open-connector.service" \
  /etc/systemd/system/zap-open-connector.service
install -m 0644 "${TEMPLATE_DIR}/units/zap-host.service" \
  /etc/systemd/system/zap-host.service
systemctl enable zap-open-connector.service zap-host.service

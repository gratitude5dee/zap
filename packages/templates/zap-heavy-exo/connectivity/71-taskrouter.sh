#!/usr/bin/env bash
# Connectivity bake fragment 71: the local task router (advisory, loopback :1917).
#
# INSTALLED and DISABLED. The router is box-local: it binds 127.0.0.1 only, has
# no provider key, no egress, and logs enums/lengths — never message text — to
# ~/.zap/taskrouter/decisions.jsonl. Its output is a PROPOSAL; the control
# plane stays the sole authorizer.
#
# Model: a pinned GGUF, downloaded best-effort. Without it (or without a
# llama-cpp-python build) the router serves deterministic heuristics from the
# same closed enums, so a missing model is a quality change, not an outage.
set -euo pipefail

TASKROUTER_HOME="${HOME:-/home/user}"
TASKROUTER_DIR="${TASKROUTER_HOME}/.zap/taskrouter"
TASKROUTER_MODEL_URL="${TASKROUTER_MODEL_URL:-https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
TASKROUTER_MODEL_PIN="${TASKROUTER_MODEL_PIN:-qwen2.5-1.5b-instruct-q4_k_m}"
CONNECTIVITY_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0700 "${TASKROUTER_DIR}"
install -m 0755 "${CONNECTIVITY_SRC}/taskrouter.py" "${TASKROUTER_DIR}/taskrouter.py"

# Interpreter: reuse the portable llama-cpp-python build that zap-heavy's
# OpenViking venv already carries; fall back to the system interpreter (which
# has no llama_cpp, so the router runs heuristics only).
cat > "${TASKROUTER_DIR}/run.sh" <<'RUN'
#!/usr/bin/env bash
# Picks the richest interpreter available: the OpenViking venv carries the
# portable llama-cpp-python build; the system interpreter runs heuristics only.
set -euo pipefail
for candidate in "$HOME/.zap/memory/openviking/venv/bin/python" /usr/bin/python3.12 /usr/bin/python3; do
  if [ -x "$candidate" ]; then exec "$candidate" "$HOME/.zap/taskrouter/taskrouter.py"; fi
done
echo "taskrouter: no python interpreter found" >&2
exit 1
RUN
chmod 0755 "${TASKROUTER_DIR}/run.sh"

if [ -s "${TASKROUTER_DIR}/model.gguf" ]; then
  echo "taskrouter: model already present"
else
  curl -fsSL -o "${TASKROUTER_DIR}/model.gguf" "${TASKROUTER_MODEL_URL}" \
    || { echo "WARN: task-router model download failed — router runs heuristics only" >&2; rm -f "${TASKROUTER_DIR}/model.gguf"; }
fi

# Keep the model out of the snapshot diff churn.
touch "${TASKROUTER_HOME}/.boxignore"
grep -qxF ".zap/taskrouter/model.gguf" "${TASKROUTER_HOME}/.boxignore" \
  || echo ".zap/taskrouter/model.gguf" >> "${TASKROUTER_HOME}/.boxignore"

sudo tee /etc/systemd/system/zap-taskrouter.service >/dev/null <<'UNIT'
# Installed DISABLED. Advisory shadow classifier; loopback :1917 only.
[Unit]
Description=Zap local task router (advisory, loopback :1917)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/.zap/taskrouter
ExecStart=/home/user/.zap/taskrouter/run.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl disable zap-taskrouter.service >/dev/null 2>&1 || true

TASKROUTER_PIN="${TASKROUTER_MODEL_PIN}" node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const file = path.join(process.env.HOME, ".zap", "template.json");
  const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  prev.pins = { ...(prev.pins ?? {}), "taskrouter-model": process.env.TASKROUTER_PIN };
  prev.connectivity = { ...(prev.connectivity ?? {}), taskrouter: { installed: true, enabled: false } };
  fs.writeFileSync(file, JSON.stringify(prev, null, 2) + "\n");
'

echo "connectivity: taskrouter installed, disabled (loopback 127.0.0.1:1917)"

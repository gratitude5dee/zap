#!/usr/bin/env bash
# Connectivity doctor rows: optional (required:false) checks.
#
# These NEVER fail the template build. Every connectivity feature is opt-in and
# default-off, so "installed but not running" is the healthy state; a missing
# optional binary (best-effort download) is a degraded feature, not a broken
# box. Rows are printed as `PASS`/`WARN` and the caller's exit code is
# untouched.
set -uo pipefail

connectivity_row() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "PASS ${name} (optional)"
  else
    echo "WARN ${name} (optional, not installed)"
  fi
}

connectivity_disabled_row() {
  local name="$1" unit="$2"
  if systemctl is-enabled "${unit}" >/dev/null 2>&1; then
    echo "FAIL ${name} must ship disabled: ${unit} is enabled"
  else
    echo "PASS ${name} disabled by default"
  fi
}

connectivity_row "tailscale installed" command -v tailscale
connectivity_disabled_row "tailscale" zap-tailscaled.service
connectivity_row "cotal installed" command -v cotal
connectivity_row "taskrouter installed" test -x "${HOME:-/home/user}/.zap/taskrouter/run.sh"
connectivity_disabled_row "taskrouter" zap-taskrouter.service
connectivity_row "sam-node installed" command -v sam-node
connectivity_row "mesh-llm installed" command -v mesh-llm
connectivity_disabled_row "sam-mesh" zap-sam-mesh.service
connectivity_row "sam-mesh unconfigured" bash -c '[ ! -s "${HOME:-/home/user}/.zap/sam-mesh/mesh.json" ]'

#!/usr/bin/env bash
# env-macos: first-boot bootstrap for a Namespace Apple-silicon instance.
#
# The macos "template pointer" is the URL of THIS file: Namespace has no
# snapshot fork for native instances, so a fresh Mac curls it on first boot
# (infra/namespace/create-instance.ts) and builds itself. It only pins where
# the real template lives, then hands over — keeping the curl-able part too
# small to drift.
#
# Per-instance env arrives on the process environment: TENANT_ID, RUNTIME_ID,
# RUNTIME_TOKEN, GATEWAY_URL, GATEWAY_TOKEN, ZAP_BRIDGE_PORT.
set -euo pipefail

ZAP_REPO="${ZAP_REPO:-https://github.com/gratitude5dee/zap.git}"
# Pinned: a floating branch would silently change what the macos env is.
ZAP_REF="${ZAP_REF:-main}"

INFRA_DIR="$HOME/.zap-infra"
if [ ! -d "$INFRA_DIR/.git" ]; then
  git init "$INFRA_DIR"
  git -C "$INFRA_DIR" remote add origin "$ZAP_REPO"
fi
git -C "$INFRA_DIR" fetch --depth 1 origin "$ZAP_REF"
git -C "$INFRA_DIR" checkout --force FETCH_HEAD

exec bash "$INFRA_DIR/packages/templates/env-macos/setup.sh"

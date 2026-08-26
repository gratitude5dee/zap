#!/usr/bin/env bash
# zap-med-fx doctor: base checks + fx doctor + MCP config.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-med/doctor.sh"

fail=0
if fx doctor >/dev/null 2>&1; then echo "ok   fx doctor"; else echo "FAIL fx doctor"; fail=1; fi
if test -s "${HOME}/.fx/mcp.json"; then echo "ok   mcp config"; else echo "FAIL mcp config"; fail=1; fi
if test -f /zap/memory-enabled 2>/dev/null; then
  if grep -q "openviking" "${HOME}/.fx/mcp.json"; then echo "ok   mcp-openviking"; else echo "FAIL mcp-openviking"; fail=1; fi
fi
exit "${fail}"

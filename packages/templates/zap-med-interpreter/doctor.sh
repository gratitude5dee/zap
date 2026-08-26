#!/usr/bin/env bash
# zap-med-interpreter doctor: base checks + interpreter binary + MCP config.
set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/../zap-med/doctor.sh"

fail=0
if interpreter --version >/dev/null 2>&1; then echo "ok   interpreter --version"; else echo "FAIL interpreter --version"; fail=1; fi
if test -s "${HOME}/.openinterpreter/config.toml"; then echo "ok   mcp config"; else echo "FAIL mcp config"; fail=1; fi
if test -f /zap/memory-enabled 2>/dev/null; then
  if grep -q "openviking" "${HOME}/.openinterpreter/config.toml"; then echo "ok   mcp-openviking"; else echo "FAIL mcp-openviking"; fail=1; fi
fi
exit "${fail}"

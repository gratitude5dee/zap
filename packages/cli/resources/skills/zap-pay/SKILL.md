---
name: zap-pay
description: Understand Zap payer resolution, quotes, and the plan-only default for metered live spend.
version: 5.0.0-alpha
metadata:
  zap:
    weight: light
---

# zap-pay

Use this skill for anything involving provider spend.

## Rules

- Plan-only is the default everywhere. Live spend requires explicit `--live` (CLI) or `live: true` (MCP) plus a resolved payer.
- `zap pay status --json` reports the payer: `byok`, `managed`, or `missing`.
- A live call with a missing payer must fail with structured `PAYER_MISSING` and remediation steps; never fall back silently.
- `zap pay quote --provider <p> --json` estimates cost without spending.
- Charged provider calls carry idempotency keys; retries must not double-charge.
- Zap never custodies funds and never prints payer secrets; `zap keys list` masks values.

# @wzrdtech/zap-runtime

The Zap runtime: compose profiles (`zap-light` | `zap-med` | `zap-heavy`), execution lanes, gateway, media FS, harness adapters, metering, pay, secrets/connections, and the `zap-agentd` in-VM daemon.

```bash
npm install @wzrdtech/zap-runtime
```

Highlights:

- **Runtime plugins:** `box`, `openviking` (memory), `hermes` (harness), `x402` (pay) — kernel plugins composed per profile
- **agentd:** `createAgentdServer` plus the agent host (`createAgentHost`, `runTurn`), deployment/alias/session stores — sessions bind to the deployment selected at creation; `deploy --watch` advances development, `--alias production` advances production
- **Secrets:** write-only resolvers (`createEnvSecretResolver`, `createControlPlaneSecretResolver`) and connection scope checks; `redact`/`redactDeep`/`createRedactingLog` keep secret values out of logs, events, and `--json`
- **Lanes:** CPU by default; GPU mounts only when a lane requests it
- **Harness adapters:** normalize named-harness transports into redacted `RunEvent`s

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

# @wzrdtech/zap-cloud

Zap cloud control-plane API: runtimes, sessions, the pay gate, metering, templates, secrets resolution, and the sweeper. This is the off-VM half of Zap — everything agent-facing (execution, filesystem, transcripts, memory) stays inside the tenant's runtime VM.

```bash
npm install @wzrdtech/zap-cloud
```

Responsibilities:

- **Runtimes:** create/fork/stop tenant runtime VMs (Box by default, `noEnv: true`, idempotent create, no forced stop)
- **Sessions:** a proxy to in-VM sessions; sessions bind to the deployment selected at creation
- **Pay gate:** live work requires a payer; missing payer fails closed with `PAYER_MISSING`
- **Meter:** usage metering for managed spend
- **Secrets resolve:** scope-checked, write-only secret resolution for connections — values never appear in responses, logs, or events

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

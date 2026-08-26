# @wzrdtech/providers

Provider adapters and queue helpers for Zap runtimes: per-backend wrappers (submit / poll / price / validateKey) for media and model providers, plus Upstash queue primitives for poll draining.

```bash
npm install @wzrdtech/providers
```

Adapters back the legacy 0.3.1 recipe steps (`image.gen`, `video.gen`, `video.extend`, `stitch`, `keyframes`) and v5 gateway lanes. Provider keys are validated and held server-side by the gateway — they are never copied into tenant sandboxes, logs, or `--json` output.

Read the repo's `skills/zap-providers/SKILL.md` before modifying adapters or polling behavior.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

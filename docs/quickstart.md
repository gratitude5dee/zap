# Quickstart

Create a lightweight Zap project, scaffold a recipe, validate it, and run a zero-spend plan.

```bash
npx @wzrdtech/zap@0.2.0 init demo --non-interactive
cd demo
npm install
npm run zap:validate
npm run zap:new -- my-test
npm run zap:run -- my-test --input PROMPT="A bright launch bumper" --json
npm run zap:status
```

Plan mode fills missing required inputs with deterministic placeholders. Live provider execution requires `--live` plus provider keys and budget approval.

For coding-agent setup, see:

```bash
npx @wzrdtech/zap@0.2.0 docs agents
```

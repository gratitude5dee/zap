# @wzrdtech/core

Core Zap schema, parsing, planning, and registry utilities: the `Zap.md` recipe schema (YAML frontmatter), runtime specs, skill manifests, metering types, and the template manifest skeletons shared by every other `@wzrdtech/zap-*` package.

```bash
npm install @wzrdtech/core
```

Used by the CLI (`@wzrdtech/zap`) for `validate`, `lint`, and planning, and by the runtime/cloud packages for runtime-spec and manifest handling. `Zap.md` frontmatter remains the source of truth for legacy 0.3.1 recipes (inputs, budgets, provider defaults, steps, repeats, output); v5 adds runtime specs and skill manifests on top.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

# @wzrdtech/zap-kernel

The Zap kernel: composable plugin contexts with reversible effects, services, events, fork/isolation, and loader reconciliation. Everything in a Zap runtime — sandboxes, memory, gateway, pay — is a kernel plugin.

```bash
npm install @wzrdtech/zap-kernel
```

```ts
import { createRuntime, definePlugin } from "@wzrdtech/zap-kernel";

const greeter = definePlugin({
  name: "greeter",
  apply(ctx) {
    ctx.provide("greet", (name: string) => `hello ${name}`);
  },
});

const runtime = await createRuntime({ weight: "light", plugins: [greeter()] });
```

Key exports:

- `createRuntime`, `createContext` — plugin graph lifecycle with fail-closed errors (`PLUGIN_FAILED`, `CYCLE_DETECTED`, `SERVICE_MISSING`)
- `definePlugin`, `planReconcile`, `configHash` — declarative plugin entries and reconciliation plans
- `Service` — typed service injection across contexts
- Effects/disposers, events, and fork/isolate semantics: disposing an isolated child rejects its pending waiters without touching the parent realm

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap

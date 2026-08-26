# Modal (GPU lane plugin)

Modal is **not** a general sandbox in Zap: it is the GPU lane target (C4).
Adapter: `packages/sandbox/src/adapters/modal/index.ts` (`sandbox.modal`
plugin); dispatcher: `packages/runtime/src/lanes/gpu.ts` (`lanes.gpu`).

- `acquire()` accepts `purpose:"lane"` only — anything else throws
  `MODAL_LANE_ONLY`, so a CPU runtime can never mount it by accident.
- Capabilities: `gpu:true`, `isolation:"container"`; sizes are the GPU
  classes priced in `pricing.json`.
- Mounting: the lane dispatcher routes to modal only when `Runtime.md.lanes`
  includes `gpu:<class>` or a media step declares `gpu`. Without a declared
  lane, modal never mounts (proven by `packages/runtime/tests/lanes-gpu.test.ts`).
- Pricing: `pricing.json` carries the `gpu_second` SKU per class (USD/s,
  from the vendor pricing page; `verified:false` until checked live —
  see `docs/verify-log.md`). `estimateGpuCost(class, seconds, pricing)` is the
  plan-only estimator (C5).

```ts
import { createGpuLaneExecutor } from "@wzrdtech/zap-runtime/lanes/gpu";

const lanes = createGpuLaneExecutor({
  cpu: cpuLaneExecutor,
  lanes: runtimeMd.lanes ?? [], // e.g. ["gpu:L40S"]
  mount: () => modalLaneTarget, // lazy: never called without a gpu lane
});
```

Doctor: `first-party (gpu lane only)`; also verifies `pricing.json` classes
match `MODAL_GPU_CLASSES` (drift fails).

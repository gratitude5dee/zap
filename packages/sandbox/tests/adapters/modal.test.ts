import { describe, expect, it } from "vitest";
import {
  createModalProvider,
  estimateGpuCost,
  loadModalPricing,
  MODAL_CAPABILITIES,
  MODAL_WORKDIR,
  type ModalSandboxLike,
} from "../../src/adapters/modal/index.ts";
import { createMemoryVm, runContractSteps } from "./support.ts";

function fakeModal() {
  const make = (): ModalSandboxLike => {
    const backing = createMemoryVm("modal");
    return {
      id: backing.id,
      exec: (command, opts) => backing.exec(command, opts),
      readFile: (p) => backing.read(p),
      writeFile: (p, bytes) => backing.write(p, bytes),
      removePath: (p, opts) => backing.remove(p, opts),
      terminate: () => backing.kill(),
    };
  };
  return { createSandbox: async () => make() };
}

describe("modal gpu adapter", () => {
  it("passes the contract steps fake-backed with purpose lane", async () => {
    const provider = createModalProvider({ createSandbox: fakeModal().createSandbox });
    await runContractSteps(provider, MODAL_WORKDIR, { purpose: "lane" });
  });

  it("refuses any purpose other than lane (C4)", async () => {
    const provider = createModalProvider({ createSandbox: fakeModal().createSandbox });
    for (const purpose of ["runtime", "run", "test", "template-build"] as const) {
      await expect(
        provider.acquire({ provider: "modal", purpose, idempotencyKey: `modal-${purpose}` }),
      ).rejects.toMatchObject({ code: "MODAL_LANE_ONLY" });
    }
  });

  it("reports gpu:true and container isolation", () => {
    expect(MODAL_CAPABILITIES.gpu).toBe(true);
    expect(MODAL_CAPABILITIES.isolation).toBe("container");
  });

  it("prices gpu_second per class from pricing.json", async () => {
    const pricing = await loadModalPricing();
    expect(pricing.sku).toBe("gpu_second");
    expect(Object.keys(pricing.classes)).toEqual([...MODAL_CAPABILITIES.sizes]);
    const l40s = pricing.classes["L40S"];
    expect(l40s).toBeGreaterThan(0);
    expect(estimateGpuCost("L40S", 10, pricing)).toBeCloseTo(l40s * 10, 10);
    expect(() => estimateGpuCost("NOT_A_GPU", 1, pricing)).toThrowError(/unknown gpu class/i);
  });
});

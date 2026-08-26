// §5.2 north-star compose usage. Compiles at Z0 against the typed stubs;
// runs at Z3 once sessions B/D/E/H land the plugin bodies.
import { createRuntime } from "@wzrdtech/zap-kernel";
import { box } from "../../src/sandbox/box.ts";
import { openviking } from "../../src/memory/openviking.ts";
import { hermes } from "../../src/harness/hermes.ts";
import { x402 } from "../../src/pay/x402.ts";

export async function northStar(): Promise<void> {
  const zap = await createRuntime({
    weight: "heavy",
    plugins: [
      box({ template: "zap-heavy-hermes", size: "default" }),
      openviking(),
      hermes({ profile: "standard" }),
      x402({ chain: "base" }),
    ],
  });

  const session = await zap.fork({ purpose: "run" });
  try {
    await session.run({ prompt: "transcode last night's takes" });
  } finally {
    await session.dispose(); // ctx.effect inverses run in reverse
  }
}

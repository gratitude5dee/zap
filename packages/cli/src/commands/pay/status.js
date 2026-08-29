import { loadSessionKey } from "@wzrdtech/zap-runtime/auth/managed";
import { byokStatus } from "@wzrdtech/zap-runtime/auth/byok";
import { linkAuthExists } from "../../lib/link-wallet.js";

/** `zap pay status [--json]` — reports byok | managed | missing, never keys. */
export async function payStatus(args, io) {
  const json = args.includes("--json");
  const session = await loadSessionKey().catch(() => null);
  let mode = "missing";
  let detail = {};
  if (session) {
    mode = "managed";
    detail = {
      wallet: session.address,
      maxValueUsd: session.maxValueUsd,
      expiresAt: session.expiresAt,
    };
  } else if (byokStatus(io.env ?? {}) === "byok") {
    mode = "byok";
  }
  const linkWallet = await linkAuthExists();
  if (json) {
    io.out(JSON.stringify({ payer: mode, linkWallet, ...detail }, null, 2));
  } else if (mode === "managed") {
    io.out(`payer: managed (wallet ${detail.wallet}, cap $${detail.maxValueUsd}, expires ${detail.expiresAt})`);
  } else if (mode === "byok") {
    io.out("payer: byok (provider keys are billed by your provider accounts)");
  } else {
    io.out("payer: missing — run `zap pay login --managed` or set ZAP_PAYER_MODE=byok with provider keys.");
  }
  if (!json && linkWallet) {
    io.out("link wallet: connected (owner-approved agentic payments via `zap pay link`)");
  }
  return 0;
}

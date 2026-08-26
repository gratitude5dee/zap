import { payLogout as clearSessionKey } from "@wzrdtech/zap-runtime/auth/managed";

/** `zap pay logout` — clears only the managed session key, not the API token. */
export async function payLogout(args, io) {
  await clearSessionKey();
  if (args.includes("--json")) io.out(JSON.stringify({ ok: true, payer: "missing" }, null, 2));
  else io.out("Managed payer cleared.");
  return 0;
}

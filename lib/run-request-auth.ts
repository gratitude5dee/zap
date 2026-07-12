import { getRequestAccessToken, resolveWalletPrincipal } from "./supabase/server";
import { getRunSnapshot } from "./run-ledger";

export async function assertRunOwner(request: Request, runId: string) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) throw new Error("Wallet sign-in required for run mutations.");
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) throw new Error("Run not found.");
  if (snapshot.run.principalId !== principal.principalId) {
    throw new Error("This wallet does not own the requested run.");
  }
  return { principal, snapshot };
}

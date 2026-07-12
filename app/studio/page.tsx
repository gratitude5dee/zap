import { AgentChat } from "@/app/_components/agent-chat";
import { cookies } from "next/headers";
import { resolveWalletPrincipal } from "@/lib/supabase/server";
import { canonicalZapRegistryIndex } from "@/lib/zap-registry";
import { RunRail } from "./run-rail";
import { StudioSignInGate } from "./studio-sign-in-gate";
import { StudioRail } from "./studio-rail";

export default async function StudioPage() {
  const token = (await cookies()).get("zap_supabase_token")?.value;
  const principal = await resolveWalletPrincipal(token);
  if (!principal) return <StudioSignInGate clientId={process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID} />;
  return (
    <main className="grid h-[calc(100dvh-4rem)] overflow-hidden bg-zap-ink xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <StudioRail templates={canonicalZapRegistryIndex.zaps} />
      <AgentChat />
      <RunRail />
    </main>
  );
}

import { cookies } from "next/headers";
import { resolveWalletPrincipal } from "@/lib/supabase/server";
import { StudioSignInGate } from "../studio-sign-in-gate";
import { RuntimePanel } from "./runtime-panel";

export default async function StudioRuntimePage() {
  const token = (await cookies()).get("zap_supabase_token")?.value;
  const principal = await resolveWalletPrincipal(token);
  if (!principal) return <StudioSignInGate clientId={process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID} />;
  return (
    <main className="zap-studio-height overflow-y-auto bg-zap-ink p-6">
      <RuntimePanel />
    </main>
  );
}

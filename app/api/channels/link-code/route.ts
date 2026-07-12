import { NextResponse } from "next/server";
import { getChannelLinkService } from "@/lib/channel-runtime";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) {
    return NextResponse.json({ error: "A verified wallet session is required." }, { status: 401 });
  }
  try {
    const result = await getChannelLinkService().issueLinkCode({
      principalId: principal.principalId,
      userId: principal.userId,
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not issue a channel link code." },
      { headers: { "cache-control": "no-store" }, status: 503 },
    );
  }
}

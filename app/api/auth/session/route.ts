import { NextResponse } from "next/server";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  return NextResponse.json(
    principal ? { authenticated: true, principal } : { authenticated: false },
    { headers: { "cache-control": "no-store" }, status: principal ? 200 : 401 },
  );
}

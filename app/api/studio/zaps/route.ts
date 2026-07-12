import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { convexServiceToken } from "@/lib/convex-service";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const listByAuthor = makeFunctionReference<"query">("zaps:listByAuthor");

export async function GET(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "Convex is not configured." }, { status: 503 });
  const client = new ConvexHttpClient(convexUrl);
  const rows = await client.query(listByAuthor, {
    authorId: principal.principalId,
    serviceToken: convexServiceToken(),
  }) as Array<Record<string, unknown>>;
  return NextResponse.json({ zaps: rows }, { headers: { "cache-control": "no-store" } });
}

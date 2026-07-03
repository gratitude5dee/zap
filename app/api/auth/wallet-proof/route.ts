import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { anonKey, url } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase public env is not configured." }, { status: 500 });
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/wallet-proof`, {
    body: JSON.stringify(await request.json()),
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const text = await response.text();
  return new NextResponse(text, {
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    status: response.status,
  });
}

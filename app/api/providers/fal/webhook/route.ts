import { NextResponse } from "next/server";
import { recordProviderWebhook } from "@/lib/provider-webhooks";

export async function POST(request: Request) {
  const payload = await request.json();
  await recordProviderWebhook("fal", payload);
  return NextResponse.json({ ok: true });
}

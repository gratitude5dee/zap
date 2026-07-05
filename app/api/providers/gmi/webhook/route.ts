import { NextResponse } from "next/server";
import { recordProviderWebhook } from "@/lib/provider-webhooks";

export async function POST(request: Request) {
  if (!isAllowedWebhookSource(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json();
  const result = await recordProviderWebhook("gmi", payload, { url: request.url });
  return NextResponse.json({ ok: true, result });
}

function isAllowedWebhookSource(request: Request) {
  const secret = process.env.ZAP_PROVIDER_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("x-zap-webhook-secret") === secret || new URL(request.url).searchParams.get("secret") === secret;
}

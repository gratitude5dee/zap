import { NextResponse } from "next/server";
import { loadZapFromSkill } from "@/lib/zap-files";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url") ?? "";
  const slug = extractSlug(target);
  if (!slug) return NextResponse.json({ error: "A Zap URL is required." }, { status: 400 });
  const zap = await loadZapFromSkill(slug);
  const origin = publicOrigin(request);
  const embedUrl = `${origin}/embed/${encodeURIComponent(slug)}`;
  return NextResponse.json({
    height: 720,
    html: `<iframe src="${embedUrl}" width="1280" height="720" loading="lazy" allow="clipboard-write; fullscreen"></iframe>`,
    provider_name: "Zap",
    provider_url: origin,
    title: zap?.title ?? slug,
    type: "rich",
    version: "1.0",
    width: 1280,
  });
}

function extractSlug(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "zap" || segments[0] === "embed") return segments[1];
    return segments[0];
  } catch {
    return rawUrl.replace(/^\/+/, "").split("/")[0];
  }
}

function publicOrigin(request: Request) {
  const configured = process.env.ZAP_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const url = new URL(request.url);
  return url.origin;
}

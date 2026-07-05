import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { parseZapMarkdown } from "@/lib/zap-schema";

const upsertZap = makeFunctionReference<"mutation">("zaps:upsert");

const publishSchema = z.object({
  authorId: z.string().optional(),
  compiledFromRunId: z.string().optional(),
  prompts: z.record(z.string(), z.string()).default({}),
  slug: z.string().optional(),
  source: z.unknown().optional(),
  status: z.enum(["draft", "published"]).default("published"),
  tags: z.array(z.string()).default([]),
  zapMd: z.string().optional(),
});

export async function POST(request: Request) {
  const configuredToken = process.env.ZAP_PUBLISH_TOKEN;
  const providedToken = bearerToken(request);
  if (!configuredToken && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "ZAP_PUBLISH_TOKEN is required before publishing zaps." }, { status: 503 });
  }
  if (configuredToken && providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = publishSchema.parse(await request.json());
  const zapMd = input.zapMd ?? sourceZapMd(input.source);
  if (!zapMd) return NextResponse.json({ error: "zapMd is required." }, { status: 400 });

  const spec = parseZapMarkdown(zapMd);
  const slug = input.slug ?? spec.publish?.slug ?? spec.zap;
  if (isReservedSlug(slug)) return NextResponse.json({ error: `${slug} is reserved.` }, { status: 400 });

  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required." }, { status: 503 });

  const client = new ConvexHttpClient(convexUrl);
  const source = JSON.stringify({ prompts: input.prompts, zapMd });
  const id = await client.mutation(upsertZap, {
    authorId: input.authorId,
    compiledFromRunId: input.compiledFromRunId,
    estimateUsd: spec.budget.estimate_usd,
    slug,
    source,
    status: input.status,
    tags: input.tags,
    version: spec.version,
  });

  return NextResponse.json({
    canonicalUrl: publicUrl(`/${slug}`),
    embedUrl: publicUrl(`/embed/${slug}`),
    id,
    slug,
    status: input.status,
    version: spec.version,
  });
}

function sourceZapMd(source: unknown) {
  if (typeof source === "string") return source;
  if (typeof source === "object" && source && "zapMd" in source) {
    const value = (source as { zapMd?: unknown }).zapMd;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

function publicUrl(pathname: string) {
  const base = process.env.ZAP_PUBLIC_BASE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL
    ?? "https://zap.wzrd.tech";
  const normalized = base.startsWith("http://") || base.startsWith("https://") ? base : `https://${base}`;
  return `${normalized.replace(/\/$/, "")}${pathname}`;
}

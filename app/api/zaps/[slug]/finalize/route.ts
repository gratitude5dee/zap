import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { convexServiceToken } from "@/lib/convex-service";
import { isReservedSlug } from "@/lib/reserved-slugs";

const finalizeZap = makeFunctionReference<"mutation">("zaps:finalize");

const finalizeSchema = z.object({
  authorId: z.string().optional(),
  compiledFromRunId: z.string().optional(),
  description: z.string().optional(),
  finalizedBy: z.string().optional(),
  heroAssetUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
  title: z.string().optional(),
}).default({});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ slug: string }> },
) {
  const configuredToken = process.env.ZAP_PUBLISH_TOKEN;
  const providedToken = bearerToken(request);
  if (!configuredToken && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "ZAP_PUBLISH_TOKEN is required before finalizing zaps." }, { status: 503 });
  }
  if (configuredToken && providedToken !== configuredToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  if (isReservedSlug(slug)) return NextResponse.json({ error: `${slug} is reserved.` }, { status: 400 });

  const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return NextResponse.json({ error: "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required." }, { status: 503 });

  const input = finalizeSchema.parse(await request.json().catch(() => ({})));
  const client = new ConvexHttpClient(convexUrl);
  const id = await client.mutation(finalizeZap, { ...input, serviceToken: convexServiceToken(), slug });
  return NextResponse.json({ id, slug, status: "published" });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

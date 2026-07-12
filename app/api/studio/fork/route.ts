import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canonicalZapRegistryIndex } from "@/lib/zap-registry";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const inputSchema = z.object({ slug: z.string() });

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  const { slug } = inputSchema.parse(await request.json());
  if (!canonicalZapRegistryIndex.zaps.some((zap) => zap.slug === slug)) {
    return NextResponse.json({ error: "Unknown registry template." }, { status: 404 });
  }
  const directory = path.join(process.cwd(), "registry", "zaps", `zap-${slug}`);
  const source = await fs.readFile(path.join(directory, "Zap.md"), "utf8");
  const prompts: Record<string, string> = {};
  for (const filename of await fs.readdir(path.join(directory, "prompts")).catch(() => [])) {
    prompts[`prompts/${filename}`] = await fs.readFile(path.join(directory, "prompts", filename), "utf8");
  }
  const forkSlug = `${slug}-copy`;
  const zapMd = source.replace(/^zap:\s*[^\n]+/m, `zap: ${forkSlug}`);
  return NextResponse.json({ prompts, slug: forkSlug, zapMd });
}

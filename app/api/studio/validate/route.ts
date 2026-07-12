import { NextResponse } from "next/server";
import { z } from "zod";
import { parseZapMarkdown, validateZapPromptTemplates } from "@wzrdtech/core/schema";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";

const inputSchema = z.object({
  prompts: z.record(z.string(), z.string()).default({}),
  zapMd: z.string().min(1),
});

export async function POST(request: Request) {
  const principal = await resolveWalletPrincipal(getRequestAccessToken(request));
  if (!principal) return NextResponse.json({ error: "Wallet sign-in required." }, { status: 401 });
  try {
    const input = inputSchema.parse(await request.json());
    const spec = parseZapMarkdown(input.zapMd);
    validateZapPromptTemplates(spec, input.prompts);
    return NextResponse.json({ estimateUsd: spec.budget.estimate_usd, ok: true, slug: spec.zap, steps: spec.steps.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zap validation failed." }, { status: 400 });
  }
}

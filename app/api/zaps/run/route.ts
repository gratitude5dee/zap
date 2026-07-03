import { NextResponse } from "next/server";
import { z } from "zod";
import { runZapRecipe } from "@/lib/zap-runner-server";

const requestSchema = z.object({
  extendCount: z.number().int().min(0).max(64).default(0),
  inputs: z.record(z.string(), z.unknown()).default({}),
  live: z.boolean().default(false),
  provider: z.string().optional(),
  slug: z.string(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await runZapRecipe(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Zap run failed" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getBearerToken } from "@/lib/supabase/server";
import { liveRunAuthError } from "@/lib/zap-run-auth";
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
    const userAccessToken = getBearerToken(request);
    const authError = liveRunAuthError(input.live, userAccessToken);
    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 },
      );
    }

    const result = await runZapRecipe({ ...input, userAccessToken });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Zap run failed" },
      { status: 400 },
    );
  }
}

import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getBearerToken } from "@/lib/supabase/server";
import { liveRunAuthError } from "@/lib/zap-run-auth";
import { createZapRunTicket, executeZapRun } from "@/lib/zap-runner-server";
import { toZapErrorPayload } from "@/lib/zap-errors";

const requestSchema = z.object({
  dryRun: z.boolean().default(false),
  extendCount: z.number().int().min(0).max(64).default(0),
  inputs: z.record(z.string(), z.unknown()).default({}),
  live: z.boolean().default(false),
  provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
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

    const result = await createZapRunTicket({ ...input, userAccessToken });
    if (result.execution) {
      after(() => executeZapRun(result.execution!));
    }
    return NextResponse.json(result.response);
  } catch (error) {
    return NextResponse.json(
      { error: toZapErrorPayload(error) },
      { status: 400 },
    );
  }
}

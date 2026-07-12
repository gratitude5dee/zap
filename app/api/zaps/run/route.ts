import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getRequestAccessToken, resolveWalletPrincipal } from "@/lib/supabase/server";
import { zapRunAuthError } from "@/lib/zap-run-auth";
import { createZapRunTicket, executeZapRun } from "@/lib/zap-runner-server";
import { toZapErrorPayload } from "@/lib/zap-errors";
import { zapProviderSchema } from "@/lib/zap-schema";

const requestSchema = z.object({
  byokSecrets: z.record(z.string(), z.string()).optional(),
  credentialMode: z.enum(["byok", "wzrd-cloud"]).default("byok"),
  dryRun: z.boolean().default(false),
  extendCount: z.number().int().min(0).max(64).default(0),
  inputs: z.record(z.string(), z.unknown()).default({}),
  live: z.boolean().default(false),
  provider: zapProviderSchema.optional(),
  slug: z.string(),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const userAccessToken = getRequestAccessToken(request);
    const principal = userAccessToken ? await resolveWalletPrincipal(userAccessToken) : null;
    const authError = zapRunAuthError({
      credentialMode: input.credentialMode,
      live: input.live,
      principalId: principal?.principalId,
    });
    if (authError) {
      return NextResponse.json(
        { error: authError },
        { status: 401 },
      );
    }

    const result = await createZapRunTicket({
      ...input,
      principalId: principal?.principalId,
      userAccessToken,
      userId: principal?.userId,
    });
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

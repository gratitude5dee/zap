import { z } from "zod";
import { createZapRunTicket } from "./zap-runner-server";
import { zapProviderSchema } from "./zap-schema";

const publicPlanSchema = z.object({
  extendCount: z.number().int().min(0).max(64).default(0),
  inputs: z.record(z.string(), z.unknown()).default({}),
  provider: zapProviderSchema.optional(),
});

export async function createPublicZapPlanResponse(request: Request, slug: string) {
  try {
    const input = publicPlanSchema.parse(await request.json());
    const ticket = await createZapRunTicket({
      ...input,
      credentialMode: "byok",
      dryRun: true,
      live: false,
      slug,
    });
    return Response.json(ticket.response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Zap planning failed." },
      { status: 400 },
    );
  }
}

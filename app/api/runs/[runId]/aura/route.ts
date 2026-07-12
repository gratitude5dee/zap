import { NextResponse } from "next/server";
import { z } from "zod";
import { scoreAuraVideo } from "@/lib/judge";
import { getRunSnapshot } from "@/lib/run-ledger";
import { toZapErrorPayload } from "@/lib/zap-errors";
import { assertRunOwner } from "@/lib/run-request-auth";

const auraSchema = z.object({
  assetId: z.string().optional(),
  assetUrl: z.string().optional(),
  stepId: z.string().optional(),
}).default({});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    await assertRunOwner(request, runId);
    const input = auraSchema.parse(await request.json().catch(() => ({})));
    const snapshot = await getRunSnapshot(runId);
    if (!snapshot.run && !input.assetUrl && !input.assetId) {
      return NextResponse.json({ error: "Run not found." }, { status: 404 });
    }
    const asset = input.assetId
      ? snapshot.assets.find((candidate) => candidate._id === input.assetId)
      : [...snapshot.assets].reverse().find((candidate) => candidate.kind === "mp4") ?? [...snapshot.assets].reverse()[0];
    const result = await scoreAuraVideo({
      assetId: input.assetId ?? asset?._id,
      assetUrl: input.assetUrl ?? snapshot.run?.zapUrl ?? asset?.url,
      runId,
      stepId: input.stepId ?? asset?.stepId ?? snapshot.run?.stage,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: toZapErrorPayload(error) }, { status: 400 });
  }
}

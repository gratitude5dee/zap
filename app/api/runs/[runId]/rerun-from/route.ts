import { after, NextResponse } from "next/server";
import { z } from "zod";
import { executeZapRun, prepareRerunZapRunFromStep } from "@/lib/zap-runner-server";
import { toZapErrorPayload } from "@/lib/zap-errors";
import { assertRunOwner } from "@/lib/run-request-auth";

const bodySchema = z.object({
  comment: z.string().optional(),
  stepId: z.string().min(1),
});

export async function POST(
  request: Request,
  { params }: { readonly params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    await assertRunOwner(request, runId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const prepared = await prepareRerunZapRunFromStep(runId, body.stepId, body.comment);
    after(() => executeZapRun(prepared.execution));
    return NextResponse.json(prepared.snapshot);
  } catch (error) {
    return NextResponse.json({ error: toZapErrorPayload(error) }, { status: 400 });
  }
}

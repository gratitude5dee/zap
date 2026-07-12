import { NextResponse } from "next/server";
import { z } from "zod";
import { getThirdwebAuth } from "@/lib/thirdweb-auth";

const payloadRequestSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  chainId: z.number().int().positive().optional(),
});

export async function POST(request: Request) {
  try {
    const input = payloadRequestSchema.parse(await request.json());
    const { auth } = getThirdwebAuth();
    const payload = await auth.generatePayload(input);
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create wallet login payload." },
      { headers: { "cache-control": "no-store" }, status: 400 },
    );
  }
}

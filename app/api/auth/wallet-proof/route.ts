import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabasePublicConfig } from "@/lib/supabase/server";
import { getThirdwebAuth } from "@/lib/thirdweb-auth";
import { validateWalletLoginPayload } from "@/lib/wallet-siwe";

const walletProofSchema = z.object({
  payload: z.object({
    address: z.string(),
    chain_id: z.string().optional(),
    domain: z.string(),
    expiration_time: z.string(),
    invalid_before: z.string(),
    issued_at: z.string(),
    nonce: z.string(),
    resources: z.array(z.string()).optional(),
    statement: z.string(),
    uri: z.string().optional(),
    version: z.string(),
  }),
  signature: z.string().min(2),
});

export async function POST(request: Request) {
  try {
    const proof = walletProofSchema.parse(await request.json());
    const { apiKey, url } = getSupabasePublicConfig();
    if (!url || !apiKey) {
      return NextResponse.json({ error: "Supabase public env is not configured." }, { status: 503 });
    }

    const { auth, domain, origin } = getThirdwebAuth();
    validateWalletLoginPayload(proof.payload, { domain, uri: origin });
    const verified = await auth.verifyPayload(proof);
    if (!verified.valid) {
      return NextResponse.json({ error: verified.error }, { headers: { "cache-control": "no-store" }, status: 401 });
    }

    const functionName = process.env.ZAP_WALLET_PROOF_FUNCTION ?? "zap-wallet-proof";
    const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
      body: JSON.stringify(proof),
      headers: {
        apikey: apiKey,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const text = await response.text();
    const nextResponse = new NextResponse(text, {
      headers: {
        "cache-control": "no-store",
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
      status: response.status,
    });
    if (response.ok) {
      const result = parseWalletProofResponse(text);
      if (result.token) {
        nextResponse.cookies.set("zap_supabase_token", result.token, {
          httpOnly: true,
          maxAge: result.expiresIn,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
    return nextResponse;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Wallet proof failed." },
      { headers: { "cache-control": "no-store" }, status: 400 },
    );
  }
}

function parseWalletProofResponse(text: string) {
  try {
    const payload = JSON.parse(text);
    return {
      expiresIn: Number(payload.expires_in ?? 60 * 60 * 24 * 7),
      token: payload.access_token ?? payload.session?.access_token ?? payload.token ?? "",
    };
  } catch {
    return { expiresIn: 60 * 60 * 24 * 7, token: "" };
  }
}

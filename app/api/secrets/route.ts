import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderAdapter } from "@wzrdtech/providers";
import { deleteZapSecret, getBearerToken, getSupabasePublicConfig, listZapSecrets, revealZapSecretsForProvider, upsertZapSecret } from "@/lib/supabase/server";
import { isZapSecretType, zapSecretTypes } from "@/lib/supabase/secrets";

const upsertSchema = z.object({
  secretType: z.string(),
  value: z.string().min(1),
});

const deleteSchema = z.object({
  secretType: z.string(),
});

const validateSchema = z.object({
  provider: z.enum(["gmi", "fal", "prodia", "runware"]),
  secrets: z.record(z.string(), z.string()).optional(),
});

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    const config = getSupabasePublicConfig();
    return NextResponse.json({
      configured: Boolean(config.url && config.apiKey),
      project: "wzrdstudio",
      secretTypes: zapSecretTypes,
      secrets: [],
      storage: "supabase.user_secrets",
    });
  }

  try {
    return NextResponse.json({
      configured: true,
      project: "wzrdstudio",
      secretTypes: zapSecretTypes,
      secrets: await listZapSecrets(token),
      storage: "supabase.user_secrets",
    });
  } catch (error) {
    return secretError(error);
  }
}

export async function PUT(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Authorization bearer token required." }, { status: 401 });
  const input = upsertSchema.parse(await request.json());
  if (!isZapSecretType(input.secretType)) {
    return NextResponse.json({ error: `Unsupported secret type ${input.secretType}.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await upsertZapSecret(token, input.secretType, input.value));
  } catch (error) {
    return secretError(error);
  }
}

export async function DELETE(request: Request) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Authorization bearer token required." }, { status: 401 });
  const input = deleteSchema.parse(await request.json());
  if (!isZapSecretType(input.secretType)) {
    return NextResponse.json({ error: `Unsupported secret type ${input.secretType}.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteZapSecret(token, input.secretType));
  } catch (error) {
    return secretError(error);
  }
}

export async function POST(request: Request) {
  const input = validateSchema.parse(await request.json());
  const token = getBearerToken(request);
  const secrets = input.secrets ?? await revealZapSecretsForProvider(input.provider, token);
  try {
    const result = await getProviderAdapter(input.provider).validateKey(secrets);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return secretError(error);
  }
}

function secretError(error: unknown) {
  return NextResponse.json({
    error: error instanceof Error ? error.message : "Zap secret request failed.",
  }, { status: 400 });
}

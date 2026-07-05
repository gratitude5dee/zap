import { requiredSecretTypesForProvider, type MaskedZapSecret, type ZapSecretType } from "./secrets";

type SupabaseEdgeOptions = {
  body?: unknown;
  method?: "DELETE" | "GET" | "POST" | "PUT";
  serverReveal?: boolean;
  userAccessToken?: string;
};

export type RevealedZapSecrets = Partial<Record<ZapSecretType, string>>;

export function getSupabasePublicConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return "";
  return header.slice("bearer ".length).trim();
}

export async function callSupabaseFunction<T>(functionName: string, options: SupabaseEdgeOptions): Promise<T> {
  const { apiKey, url } = getSupabasePublicConfig();
  if (!url || !apiKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${options.userAccessToken ?? apiKey}`,
      "content-type": "application/json",
      ...(options.serverReveal && process.env.ZAP_SECRET_REVEAL_TOKEN
        ? { "x-zap-server-secret": process.env.ZAP_SECRET_REVEAL_TOKEN }
        : {}),
    },
    method: options.method ?? "GET",
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `${functionName} failed with ${response.status}.`);
  }
  return payload as T;
}

export async function listZapSecrets(userAccessToken: string) {
  const result = await callSupabaseFunction<{ secrets: MaskedZapSecret[] }>("zap-user-secrets", {
    method: "GET",
    userAccessToken,
  });
  return result.secrets;
}

export async function upsertZapSecret(userAccessToken: string, secretType: ZapSecretType, value: string) {
  return callSupabaseFunction<{ secret: MaskedZapSecret }>("zap-user-secrets", {
    body: { secretType, value },
    method: "PUT",
    userAccessToken,
  });
}

export async function deleteZapSecret(userAccessToken: string, secretType: ZapSecretType) {
  return callSupabaseFunction<{ ok: true }>("zap-user-secrets", {
    body: { secretType },
    method: "DELETE",
    userAccessToken,
  });
}

export async function revealZapSecretsForProvider(provider: string, userAccessToken?: string): Promise<RevealedZapSecrets | undefined> {
  if (!userAccessToken) return undefined;
  const secretTypes = requiredSecretTypesForProvider(provider);
  if (secretTypes.length === 0) return undefined;
  const result = await callSupabaseFunction<{ secrets: RevealedZapSecrets }>("zap-user-secrets", {
    body: { secretTypes },
    method: "POST",
    serverReveal: true,
    userAccessToken,
  });
  return result.secrets;
}

export async function revealZapSecretsForProviderByUserId(provider: string, userId?: string): Promise<RevealedZapSecrets | undefined> {
  if (!userId) return undefined;
  const secretTypes = requiredSecretTypesForProvider(provider);
  if (secretTypes.length === 0) return undefined;
  const result = await callSupabaseFunction<{ secrets: RevealedZapSecrets }>("zap-user-secrets", {
    body: { secretTypes, userId },
    method: "POST",
    serverReveal: true,
  });
  return result.secrets;
}

export type SandboxCredentialEnv = Readonly<Record<string, string | undefined>>;

export async function resolveManagedSandboxCredential(
  provider: string,
  secretName: string,
  env: SandboxCredentialEnv = process.env,
) {
  const url = normalizeDeploymentEnv(env.NEXT_PUBLIC_SUPABASE_URL);
  const apiKey = normalizeDeploymentEnv(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const revealToken = normalizeDeploymentEnv(env.ZAP_SECRET_REVEAL_TOKEN);
  const functionName = normalizeDeploymentEnv(env.ZAP_MANAGED_PROVIDER_SECRETS_FUNCTION)
    ?? "zap-managed-provider-secrets";
  if (!url || !apiKey || !revealToken) {
    throw new Error(
      `Managed ${provider} credentials require Supabase public config and ZAP_SECRET_REVEAL_TOKEN when the direct environment variable is absent.`,
    );
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/${functionName}`, {
    body: JSON.stringify({ provider }),
    cache: "no-store",
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-zap-server-secret": revealToken,
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: unknown;
    secrets?: Record<string, unknown>;
  };
  const value = payload.secrets?.[secretName];
  if (!response.ok || typeof value !== "string" || value.trim() === "") {
    const message = typeof payload.error === "string" ? payload.error : `Managed ${provider} credential lookup failed.`;
    throw new Error(message);
  }
  return value.trim();
}

function normalizeDeploymentEnv(value?: string) {
  const normalized = value?.trim().replace(/(?:(?:\\r)?\\n)+$/g, "").trim();
  return normalized || undefined;
}

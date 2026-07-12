export type ZapCredentialMode = "byok" | "wzrd-cloud";

export function zapRunAuthError({
  credentialMode,
  live,
  principalId,
}: {
  credentialMode: ZapCredentialMode;
  live: boolean;
  principalId?: string;
}) {
  if (!live || credentialMode === "byok") return null;
  if (principalId?.startsWith("wallet:0x")) return null;
  return "WZRD Cloud runs require a verified wallet sign-in.";
}

/**
 * Backward-compatible wrapper used by older callers. New code should pass an
 * explicit credential mode and a verified principal rather than treating the
 * presence of an opaque token as authorization.
 */
export function liveRunAuthError(
  live: boolean,
  userAccessToken?: string,
  credentialMode: ZapCredentialMode = "wzrd-cloud",
  principalId?: string,
) {
  return zapRunAuthError({
    credentialMode,
    live,
    principalId: principalId ?? (userAccessToken ? "wallet:0xlegacy-token-present" : undefined),
  });
}

export function sanitizeNextPath(value: string | null | undefined, fallback = "/studio") {
  const candidate = value?.trim();
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  try {
    const parsed = new URL(candidate, "https://zap.invalid");
    return parsed.origin === "https://zap.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

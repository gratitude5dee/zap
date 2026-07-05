const secretTypes = [
  "gmi_api_key",
  "gmi_org_id",
  "fal_key",
  "runware_key",
  "prodia_token",
  "openrouter_key",
  "ai_gateway_api_key",
] as const;

export type ZapSecretType = typeof secretTypes[number];

export type MaskedZapSecret = {
  createdAt?: string;
  last4?: string;
  provider?: string;
  secretType: ZapSecretType;
  updatedAt?: string;
};

export function isZapSecretType(value: string): value is ZapSecretType {
  return (secretTypes as readonly string[]).includes(value);
}

export function maskSecret(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

export function requiredSecretTypesForProvider(provider: string): ZapSecretType[] {
  switch (provider) {
    case "gmi":
      return ["gmi_api_key", "gmi_org_id"];
    case "fal":
      return ["fal_key"];
    case "prodia":
      return ["prodia_token"];
    case "runware":
      return ["runware_key"];
    case "openrouter":
      return ["openrouter_key"];
    default:
      return [];
  }
}

export function providerFromSecretType(secretType: ZapSecretType) {
  if (secretType.startsWith("gmi_")) return "gmi";
  if (secretType.startsWith("fal_")) return "fal";
  if (secretType.startsWith("prodia_")) return "prodia";
  if (secretType.startsWith("runware_")) return "runware";
  if (secretType.startsWith("openrouter_")) return "openrouter";
  if (secretType.startsWith("ai_gateway_")) return "ai_gateway";
  return secretType.replace(/_key$|_api_key$|_org_id$/g, "");
}

export const zapSecretTypes = secretTypes;

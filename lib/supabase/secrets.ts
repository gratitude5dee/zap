const secretTypes = [
  "gmi_api_key",
  "gmi_org_id",
  "fal_key",
  "runware_key",
  "prodia_key",
  "openrouter_key",
  "ai_gateway_api_key",
] as const;

export type ZapSecretType = typeof secretTypes[number];

export type MaskedZapSecret = {
  createdAt?: string;
  last4?: string;
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
    case "openrouter":
      return ["openrouter_key"];
    default:
      return [];
  }
}

export const zapSecretTypes = secretTypes;

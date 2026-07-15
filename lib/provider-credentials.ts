import type { ProviderSecrets } from "./provider-types";

export type ProviderCredentialSource = "environment-byok" | "request-byok" | "user-vault" | "wzrd-cloud";

type CredentialCandidates = {
  managed?: ProviderSecrets;
  request?: ProviderSecrets;
  vault?: ProviderSecrets;
};

const secretNames = new Set<keyof ProviderSecrets>([
  "aws_access_key_id",
  "aws_region",
  "aws_role_arn",
  "aws_s3_output_uri",
  "aws_secret_access_key",
  "aws_session_token",
  "fal_key",
  "gmi_api_key",
  "prodia_token",
  "runware_key",
  "vertex_api_key",
  "vertex_location",
  "vertex_output_gcs_uri",
  "vertex_project",
  "vertex_service_account",
]);

export function selectProviderCredentialSet(provider: string, candidates: CredentialCandidates): {
  secrets: ProviderSecrets;
  source: ProviderCredentialSource;
} | null {
  const ordered: Array<[ProviderCredentialSource, ProviderSecrets | undefined]> = [
    ["request-byok", candidates.request],
    ["user-vault", candidates.vault],
    ["wzrd-cloud", candidates.managed],
  ];
  for (const [source, secrets] of ordered) {
    if (secrets && isCompleteProviderCredentialSet(provider, secrets)) return { secrets, source };
  }
  return null;
}

export function isCompleteProviderCredentialSet(provider: string, secrets: ProviderSecrets) {
  const has = (name: keyof ProviderSecrets) => typeof secrets[name] === "string" && Boolean(secrets[name]?.trim());
  switch (provider) {
    case "fal":
      return has("fal_key");
    case "gmi":
      return has("gmi_api_key");
    case "prodia":
      return has("prodia_token");
    case "runware":
      return has("runware_key");
    case "aws":
      return has("aws_access_key_id") && has("aws_secret_access_key");
    case "vertex":
      return has("vertex_project") && (has("vertex_api_key") || has("vertex_service_account"));
    default:
      return false;
  }
}

export function parseManagedProviderKeys(value: string | undefined, provider?: string): ProviderSecrets | undefined {
  if (!value?.trim()) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("WZRD_CLOUD_PROVIDER_KEYS must be valid JSON.");
  }
  if (!isRecord(parsed)) throw new Error("WZRD_CLOUD_PROVIDER_KEYS must be a JSON object.");
  const nestedEntries = Object.entries(parsed).filter(([, entry]) => isRecord(entry));
  const candidate = provider && isRecord(parsed[provider])
    ? parsed[provider]
    : nestedEntries.length === 1 && Object.keys(parsed).length === 1
      ? nestedEntries[0][1]
      : parsed;
  if (!isRecord(candidate)) return undefined;
  const secrets: ProviderSecrets = {};
  for (const [key, raw] of Object.entries(candidate)) {
    if (secretNames.has(key as keyof ProviderSecrets) && typeof raw === "string" && raw.trim()) {
      secrets[key as keyof ProviderSecrets] = raw.trim();
    }
  }
  return Object.keys(secrets).length ? secrets : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

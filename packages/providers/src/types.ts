import type { ZapProvider, ZapStepKind } from "@wzrdtech/core";

export type Capability = ZapStepKind;
export type ProviderId = ZapProvider;
export type ProviderSecretName =
  | "aws_access_key_id"
  | "aws_region"
  | "aws_role_arn"
  | "aws_s3_output_uri"
  | "aws_secret_access_key"
  | "aws_session_token"
  | "gmi_api_key"
  | "fal_key"
  | "prodia_token"
  | "runware_key"
  | "vertex_api_key"
  | "vertex_location"
  | "vertex_output_gcs_uri"
  | "vertex_project"
  | "vertex_service_account";
export type ProviderSecrets = Partial<Record<ProviderSecretName, string>>;

export type GenRequest = {
  attemptSalt?: string;
  capability: Capability;
  durationS?: number;
  inputs: Record<string, unknown>;
  model: string;
  prompt: string;
  provider: ProviderId;
  runId: string;
  secrets?: ProviderSecrets;
  stepId: string;
  webhookUrl?: string;
};

export type ProviderSubmitResult = {
  provider: string;
  requestId: string;
};

export type ProviderPollResult = {
  actualUsd?: number;
  error?: string;
  outputUrl?: string;
  progress?: number;
  status: "queued" | "running" | "done" | "failed";
};

export type ProviderWebhookResult = ProviderPollResult & {
  capability?: Capability | string;
  requestId?: string;
  runId?: string;
  stepId?: string;
};

export type ProviderValidationResult = {
  error?: string;
  ok: boolean;
  provider: ProviderId;
};

export interface ProviderAdapter {
  id: ProviderId;
  auth(secrets?: ProviderSecrets): Record<string, string>;
  defaultModel(capability: Capability): string;
  parseWebhook?(payload: unknown, sourceUrl?: string): ProviderWebhookResult;
  poll(requestId: string, secrets?: ProviderSecrets): Promise<ProviderPollResult>;
  price(req: GenRequest): number;
  submit(req: GenRequest, idemKey: string): Promise<ProviderSubmitResult>;
  validateKey(secrets?: ProviderSecrets): Promise<ProviderValidationResult>;
  secretTypes: readonly ProviderSecretName[];
  supports(capability: Capability, model: string): boolean;
}

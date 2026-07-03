import type { ZapStep } from "./zap-schema";

export type Capability = ZapStep["kind"];

export type GenRequest = {
  attemptSalt?: string;
  capability: Capability;
  durationS?: number;
  inputs: Record<string, unknown>;
  model: string;
  prompt: string;
  provider?: string;
  runId: string;
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

export interface ProviderAdapter {
  id: "gmi" | "fal";
  poll(requestId: string): Promise<ProviderPollResult>;
  price(req: GenRequest): number;
  submit(req: GenRequest, idemKey: string): Promise<ProviderSubmitResult>;
  supports(capability: Capability, model: string): boolean;
}

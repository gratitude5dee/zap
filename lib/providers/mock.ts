import { createHash } from "node:crypto";
import type { Capability, GenRequest, ProviderAdapter, ProviderPollResult } from "../provider-types";

const supported = new Set<Capability>([
  "image.gen",
  "image.edit",
  "video.gen",
  "video.extend",
  "video.edit",
  "video.upscale",
  "audio.tts",
  "audio.music",
  "audio.sfx",
]);

export const mockAdapter: ProviderAdapter = {
  id: "mock",
  async poll(requestId: string): Promise<ProviderPollResult> {
    return {
      actualUsd: 0,
      outputUrl: mockOutputUrl(requestId),
      progress: 1,
      status: "done",
    };
  },
  price() {
    return 0;
  },
  async submit(req: GenRequest, idemKey: string) {
    return {
      provider: "mock",
      requestId: createMockRequestId(req, idemKey),
    };
  },
  supports(capability: Capability) {
    return supported.has(capability);
  },
};

function createMockRequestId(req: GenRequest, idemKey: string) {
  return `mock_${createHash("sha256")
    .update(JSON.stringify({ capability: req.capability, idemKey, prompt: req.prompt, runId: req.runId, stepId: req.stepId }))
    .digest("hex")
    .slice(0, 18)}`;
}

function mockOutputUrl(requestId: string) {
  return `mock://provider/${encodeURIComponent(requestId)}.mp4`;
}

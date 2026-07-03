import { createHash } from "node:crypto";
import type { Capability, GenRequest, ProviderAdapter, ProviderPollResult } from "./types";

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

export function createMockRequestId(req: GenRequest, idemKey: string) {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      capability: req.capability,
      idemKey,
      prompt: req.prompt,
      runId: req.runId,
      stepId: req.stepId,
    }))
    .digest("hex")
    .slice(0, 18);
  return `mock_${digest}`;
}

export function mockOutputUrl(requestId: string) {
  const safeId = encodeURIComponent(requestId);
  return `mock://provider/${safeId}.mp4`;
}

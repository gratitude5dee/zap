import type { Capability, ProviderAdapter, ProviderId } from "./types.ts";
import { falAdapter } from "./fal.ts";
import { gmiAdapter } from "./gmi.ts";
import { prodiaAdapter } from "./prodia.ts";
import { runwareAdapter } from "./runware.ts";

export const providerAdapters: Record<ProviderId, ProviderAdapter> = {
  fal: falAdapter,
  gmi: gmiAdapter,
  prodia: prodiaAdapter,
  runware: runwareAdapter,
};

export function getProviderAdapter(provider: ProviderId) {
  return providerAdapters[provider];
}

export function defaultModelFor(provider: ProviderId, capability: Capability) {
  return providerAdapters[provider].defaultModel(capability);
}

export function listProviderAdapters() {
  return Object.values(providerAdapters);
}

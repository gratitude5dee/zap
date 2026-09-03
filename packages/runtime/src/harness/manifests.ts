// Registry of every §5.6 harness manifest plus the managed-mode wiring
// helpers. Managed runtimes never hold a provider key: their OpenAI/Anthropic-
// compatible base URL points at the control API's per-runtime gateway proxy.
import type { HarnessManifest } from "./zap.ts";
import { zapHarnessManifest } from "./zap.ts";
import { interpreterHarnessManifest } from "./interpreter.ts";
import { fxHarnessManifest } from "./fx.ts";
import { hermesHarnessManifest } from "./hermes.ts";
import { exoHarnessManifest } from "./exo.ts";
import { openclawHarnessManifest } from "./openclaw.ts";
import { opencodeHarnessManifest } from "./opencode.ts";
import { deepseekHarnessManifest } from "./deepseek.ts";
import { grokHarnessManifest } from "./grok.ts";
import { omgHarnessManifest } from "./omg.ts";
import { piHarnessManifest } from "./pi.ts";
import { cursorHarnessManifest } from "./cursor.ts";
import { devinHarnessManifest } from "./devin.ts";
import { kimiHarnessManifest } from "./kimi.ts";
import { agnoHarnessManifest } from "./agno.ts";
import { primeHarnessManifest } from "./prime.ts";
import { headlongHarnessManifest } from "./headlong.ts";
import { frontierHarnessManifest } from "./frontier.ts";
import { foGuangHarnessManifest } from "./fo-guang.ts";

export { createHarnessDriver, type HarnessTransport } from "./adapters.ts";
export { createHermesHarnessService, hermesHarnessManifest } from "./hermes.ts";
export { createExoHarnessService, exoHarnessManifest } from "./exo.ts";
export { createOpenclawHarnessService, openclawHarnessManifest } from "./openclaw.ts";
export { createOpencodeHarnessService, opencodeHarnessManifest } from "./opencode.ts";
export { createDeepseekHarnessService, deepseekHarnessManifest, DEEPSEEK_PRESETS } from "./deepseek.ts";
export { createGrokHarnessService, grokHarnessManifest } from "./grok.ts";
export { createOmgHarnessService, omgHarnessManifest } from "./omg.ts";
export { createPiHarnessService, piHarnessManifest } from "./pi.ts";
export { createCursorHarnessService, cursorHarnessManifest } from "./cursor.ts";
export { createDevinHarnessService, devinHarnessManifest, HarnessPullOnlyError } from "./devin.ts";
export { createKimiHarnessService, kimiHarnessManifest } from "./kimi.ts";
export { createAgnoHarnessService, agnoHarnessManifest } from "./agno.ts";
export { createPrimeHarnessService, primeHarnessManifest } from "./prime.ts";
export { createHeadlongHarnessService, headlongHarnessManifest } from "./headlong.ts";
export { createFrontierHarnessService, frontierHarnessManifest } from "./frontier.ts";
export { foGuangHarnessManifest } from "./fo-guang.ts";

// Heavy LLM harnesses (managed-mode gateway wiring applies to these).
// fo-guang is a heavy robotics profile with no model surface, so it is not one.
const HEAVY_IDS: ReadonlyArray<HarnessManifest["id"]> = [
  "hermes", "exo", "openclaw", "opencode", "deepseek", "grok", "omg",
  "pi", "cursor", "devin", "kimi", "agno", "prime", "headlong", "frontier",
];

const FACTORIES: ReadonlyArray<() => HarnessManifest> = [
  zapHarnessManifest,
  interpreterHarnessManifest,
  fxHarnessManifest,
  hermesHarnessManifest,
  exoHarnessManifest,
  openclawHarnessManifest,
  opencodeHarnessManifest,
  deepseekHarnessManifest,
  grokHarnessManifest,
  omgHarnessManifest,
  piHarnessManifest,
  cursorHarnessManifest,
  devinHarnessManifest,
  kimiHarnessManifest,
  agnoHarnessManifest,
  primeHarnessManifest,
  headlongHarnessManifest,
  frontierHarnessManifest,
  foGuangHarnessManifest,
];

export function allHarnessManifests(): HarnessManifest[] {
  return FACTORIES.map((factory) => factory());
}

export function harnessManifest(id: HarnessManifest["id"]): HarnessManifest | undefined {
  return allHarnessManifests().find((manifest) => manifest.id === id);
}

export function heavyHarnessIds(): ReadonlyArray<HarnessManifest["id"]> {
  return HEAVY_IDS;
}

/** The control API's per-runtime managed gateway proxy (Z9). */
export function managedGatewayUrl(apiUrl: string, runtimeId: string): string {
  return `${apiUrl.replace(/\/$/, "")}/v1/runtimes/${runtimeId}/gateway`;
}

function isEnvVarName(key: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(key);
}

/**
 * Per-box env for a managed runtime fork/create body: only the gateway proxy
 * URL — never a provider key (C6/C15). Non-env managedGateway keys (config
 * file paths) are rendered into the file at bake from ZAP_MANAGED_GATEWAY_URL.
 */
export function managedBoxEnv(
  id: HarnessManifest["id"],
  opts: { apiUrl: string; runtimeId: string },
): Record<string, string> {
  const manifest = harnessManifest(id);
  const url = managedGatewayUrl(opts.apiUrl, opts.runtimeId);
  const env: Record<string, string> = {
    ZAP_PAYER_MODE: "managed",
    ZAP_MANAGED_GATEWAY_URL: url,
  };
  const gateway = manifest?.managedGateway;
  if (gateway && isEnvVarName(gateway.key)) {
    env[gateway.key] = gateway.flavor === "anthropic" ? `${url}/llm` : `${url}/llm/v1`;
  }
  return env;
}

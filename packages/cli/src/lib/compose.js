// @ts-check
/**
 * `zap compose` plumbing: loads a runtime definition from `Runtime.md`
 * (YAML frontmatter, parsed by @wzrdtech/core/runtime-spec) or `zap.config.ts`
 * (default export, loaded via `node --experimental-strip-types` — pinned; no
 * esbuild step), then resolves it into a deterministic plugin tree. Equivalent
 * definitions in either format produce identical trees.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { CONNECTIVITY_DEFAULTS, parseRuntimeSpec } from "@wzrdtech/core/runtime-spec";
import { configHash } from "@wzrdtech/zap-kernel";
import { parseDocument } from "yaml";
import { ZapCliError } from "./errors.js";

export const SANDBOX_PROVIDERS = [
  "box",
  "namespace",
  "selfhost",
  "microsandbox",
  "e2b",
  "daytona",
  "cloudflare",
  "docker",
  "local",
  "fake",
  "modal",
];

/**
 * @param {string} file absolute path to Runtime.md or zap.config.ts
 * @returns {Promise<{ spec: import("@wzrdtech/core/runtime-spec").RuntimeSpec, source: "runtime-md" | "zap-config" }>}
 */
export async function loadRuntimeSpecFromFile(file) {
  const base = path.basename(file);
  if (base.endsWith(".md")) {
    const content = await fs.readFile(file, "utf8");
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      throw new ZapCliError({ code: "SCHEMA_INVALID", message: `${base} has no YAML frontmatter.`, remediation: "Add a --- frontmatter block with runtime, version, and weight." });
    }
    const raw = parseDocument(match[1]).toJS();
    return { source: "runtime-md", spec: validateRuntimeSpec(raw, base) };
  }
  if (base.endsWith(".ts") || base.endsWith(".mts")) {
    const script = "import(process.argv[1]).then((m) => console.log(JSON.stringify(m.default ?? m.config ?? null)));";
    const output = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "-e", script, file], { encoding: "utf8" });
    const raw = JSON.parse(output.trim() || "null");
    if (!raw) {
      throw new ZapCliError({ code: "SCHEMA_INVALID", message: `${base} must default-export a runtime definition object.` });
    }
    return { source: "zap-config", spec: validateRuntimeSpec(raw, base) };
  }
  throw new ZapCliError({ code: "SCHEMA_INVALID", message: `Unsupported runtime definition ${base}. Use Runtime.md or zap.config.ts.` });
}

/**
 * @param {unknown} raw
 * @param {string} source
 */
export function validateRuntimeSpec(raw, source) {
  let spec;
  try {
    spec = parseRuntimeSpec(raw);
  } catch (error) {
    throw new ZapCliError({
      code: "SCHEMA_INVALID",
      message: `${source}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      remediation: "Fix the runtime definition. weight must be light, med, or heavy.",
    });
  }
  const provider = spec.sandbox?.provider;
  if (provider !== undefined && !SANDBOX_PROVIDERS.includes(provider) && !provider.startsWith("catalog:")) {
    throw new ZapCliError({
      code: "PROVIDER_UNSUPPORTED",
      message: `${source}: sandbox.provider "${provider}" is not a supported sandbox provider.`,
      alternatives: SANDBOX_PROVIDERS,
      remediation: `Use one of: ${SANDBOX_PROVIDERS.join(", ")} or catalog:<id>.`,
    });
  }
  return spec;
}

/**
 * Resolves a runtime spec into the deterministic plugin tree for its weight.
 * Pure — never touches sandbox providers or the network.
 * @param {import("@wzrdtech/core/runtime-spec").RuntimeSpec} spec
 */
export function resolveComposeTree(spec) {
  /** @type {Array<{ name: string, config: Record<string, unknown> }>} */
  const plugins = [];
  const sandboxProvider = spec.sandbox?.provider ?? "box";
  plugins.push({ config: {}, name: "sandbox.core" });
  plugins.push({ config: { ...spec.sandbox, provider: sandboxProvider }, name: `sandbox.${sandboxProvider.replace(/^catalog:/, "catalog-")}` });
  plugins.push({ config: {}, name: "fs.core" });
  plugins.push({ config: {}, name: "meter.core" });
  plugins.push({ config: {}, name: spec.pay?.mode === "managed" ? "pay.x402" : "pay.byok" });
  plugins.push({ config: { lanes: [...(spec.lanes ?? [])] }, name: "lanes.core" });
  plugins.push({ config: {}, name: "tools.core" });
  plugins.push({ config: {}, name: "sessions.core" });
  plugins.push({ config: {}, name: "doctor.core" });

  // Opt-in connectivity: a plugin appears only when the runtime asked for it,
  // so an undeclared runtime resolves to exactly the tree it resolved before.
  const connectivity = { ...CONNECTIVITY_DEFAULTS, ...(spec.connectivity ?? {}) };
  for (const feature of /** @type {const} */ (["tailscale", "cotal", "taskrouter", "samMesh"])) {
    if (connectivity[feature]) plugins.push({ config: { enabled: true }, name: `connectivity.${feature}` });
  }
  if (connectivity.x402) plugins.push({ config: { gate: "managed" }, name: "connectivity.x402" });

  if (spec.weight === "med" || spec.weight === "heavy") {
    plugins.push({ config: {}, name: "gateway.core" });
    if (spec.gateway?.llm) plugins.push({ config: { model: spec.gateway.model, route: spec.gateway.llm }, name: "gateway.llm" });
    for (const media of spec.gateway?.media ?? []) {
      plugins.push({ config: { provider: media }, name: "gateway.media" });
    }
    plugins.push({ config: {}, name: "mediafs.core" });
    plugins.push({ config: {}, name: "ffmpeg.presets" });
  }

  if (spec.weight === "heavy") {
    if (spec.memory) plugins.push({ config: { ...spec.memory }, name: `memory.${spec.memory.provider}` });
    plugins.push({ config: {}, name: "skills.store" });
    plugins.push({ config: { id: spec.harness?.id ?? "zap", profile: spec.harness?.profile }, name: "harness" });
    plugins.push({ config: {}, name: "mcp.stdio" });
  }

  const entries = plugins.map(({ config, name }) => ({
    config: sortedConfig(config),
    entryId: `${name}#${configHash(sortedConfig(config))}`,
    name,
  }));

  return {
    entries,
    lock: configHash(entries),
    runtime: spec.runtime,
    sandbox: sandboxProvider,
    version: spec.version,
    weight: spec.weight,
  };
}

/**
 * Deterministic (sorted-key, undefined-stripped) config object.
 * @param {Record<string, unknown>} config
 * @returns {Record<string, unknown>}
 */
function sortedConfig(config) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(config).sort()) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  return out;
}

/**
 * Finds the runtime definition for a project directory when none is given.
 * @param {string} cwd
 * @param {string | undefined} explicit
 */
export function resolveRuntimeDefinition(cwd, explicit) {
  if (explicit) return path.resolve(cwd, explicit);
  for (const candidate of ["Runtime.md", "zap.config.ts"]) {
    const file = path.join(cwd, candidate);
    if (existsSync(file)) return file;
  }
  throw new ZapCliError({
    code: "SCHEMA_INVALID",
    message: "No Runtime.md or zap.config.ts found. Pass a runtime definition path.",
    remediation: "Create Runtime.md with runtime/version/weight frontmatter or pass a path: zap compose <file>.",
  });
}

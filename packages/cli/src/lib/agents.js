// @ts-check
/**
 * Shared agents-as-code plumbing for the `agent`, `session`, `secret`, and
 * `deploy --agent` commands (Z12). Local mode drives the in-VM agent host
 * in-process against `.zap/agentd`; a runtime URL switches to HTTP.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ZapCliError } from "./errors.js";
import { readSecretStore, secretValue } from "./secrets-store.js";

/** @param {string} cwd */
export function agentdRoot(cwd) {
  return path.join(cwd, ".zap", "agentd");
}

/** @param {string} cwd */
export async function assertAgentsProject(cwd) {
  const hasProject = await fs
    .access(path.join(cwd, "project.ts"))
    .then(() => true)
    .catch(() => false);
  const hasAgents = await fs
    .access(path.join(cwd, "agents"))
    .then(() => true)
    .catch(() => false);
  if (!hasProject && !hasAgents) {
    throw new ZapCliError({
      code: "NO_AGENTS_PROJECT",
      message: "No project.ts or agents/ directory here.",
      remediation: "Run zap agent new <id> to scaffold an agent project.",
    });
  }
}

/**
 * Builds the project into a temp out dir and returns the deployment pieces.
 * @param {string} cwd
 * @param {{ skipLint?: boolean }} [options]
 */
export async function buildAgentsProject(cwd, options = {}) {
  const { buildProject } = await import("@wzrdtech/zap-agent");
  const outDir = path.join(cwd, ".zap", "build", `out-${Date.now()}`);
  try {
    const result = await buildProject({ rootDir: cwd, outDir, skipLint: options.skipLint });
    const bundle = await fs.readFile(result.bundlePath);
    return { manifest: result.manifest, bundleSha: result.bundleSha, bundle, outDir };
  } catch (error) {
    await fs.rm(outDir, { force: true, recursive: true }).catch(() => {});
    throw error;
  }
}

/**
 * The local (self-host developer) agent host over `.zap/agentd`.
 * Payer mode comes from ZAP_PAYER_MODE; the model step is served by the
 * recorded fixture in ZAP_FAKE_LLM_FIXTURE when set (tests), otherwise the
 * model call fails closed with KEY_UNAVAILABLE until keys are synced.
 * @param {string} cwd
 */
export async function createLocalAgentHost(cwd) {
  const { createContext } = await import("@wzrdtech/zap-kernel");
  const runtime = await import("@wzrdtech/zap-runtime");
  const testing = await import("@wzrdtech/zap-runtime/testing");
  const agentCode = await import("@wzrdtech/zap-agent");

  const ctx = createContext();
  const payerMode = process.env.ZAP_PAYER_MODE === "byok" ? "byok" : process.env.ZAP_PAYER_MODE === "managed" ? "managed" : "missing";
  ctx.provide("pay", testing.fakePayService({ mode: payerMode }));
  ctx.provide("llm", await makeLlmService());
  const sandbox = testing.fakeSandboxService();
  ctx.provide("sandbox", sandbox);
  ctx.provide(
    "sandboxHandle",
    await sandbox.acquire(/** @type {never} */ ({ provider: "fake", idempotencyKey: "cli-local" })),
  );
  const secrets = runtime.createEnvSecretResolver();
  const store = await readSecretStore(cwd);
  /** @type {Record<string, string>} */
  const values = {};
  for (const entry of store.secrets) values[entry.name] = secretValue(entry);
  secrets.sync(values);
  ctx.provide("secrets", secrets);

  const root = agentdRoot(cwd);
  const host = runtime.createAgentHost({
    ctx,
    root,
    log: process.env.ZAP_DEBUG ? (line) => console.error(line) : undefined,
    async loadBundle(deployment) {
      const bundlePath = path.join(deployment.dir, "bundle.mjs");
      const modules = await agentCode.loadAgentModulesFromBundle(cwd, bundlePath);
      /** @type {import("@wzrdtech/zap-runtime").LoadedProject} */
      const project = { agents: {} };
      for (const [agentId, loaded] of Object.entries(modules)) {
        project.agents[agentId] = {
          agent: loaded.agent,
          connections: loaded.connections,
          mcpServers: loaded.mcpServers,
        };
      }
      return project;
    },
  });
  return { host, root, secrets };
}

async function makeLlmService() {
  const fixture = process.env.ZAP_FAKE_LLM_FIXTURE;
  if (!fixture) {
    return {
      async step() {
        throw new ZapCliError({
          code: "KEY_UNAVAILABLE",
          message: "No model key is synced to this runtime.",
          remediation: "Run zap secret sync (or zap keys add <provider>) first.",
        });
      },
    };
  }
  const steps = JSON.parse(await fs.readFile(fixture, "utf8"));
  let index = 0;
  return {
    async step() {
      const entry = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return {
        text: entry.text ?? "",
        toolCalls: entry.toolCalls ?? [],
        usage: entry.usage ?? { inputTokens: 0, outputTokens: 0, usd: 0 },
      };
    },
  };
}

/**
 * Parses `<agent>[@<alias>]`; no alias means `development`.
 * @param {string} value
 */
export function parseAgentRef(value) {
  const at = value.indexOf("@");
  if (at === -1) return { agent: value, alias: "development" };
  return { agent: value.slice(0, at), alias: value.slice(at + 1) };
}

/** @param {string} cwd */
export async function listLocalAliases(cwd) {
  const dir = path.join(agentdRoot(cwd), "aliases");
  /** @type {Record<string, string>} */
  const aliases = {};
  const entries = await fs.readdir(dir).catch(() => []);
  for (const entry of entries) {
    if (entry === "history.jsonl") continue;
    try {
      const pointer = JSON.parse(await fs.readFile(path.join(dir, entry), "utf8"));
      aliases[entry] = pointer.deploymentId;
    } catch {
      // skip unreadable pointers
    }
  }
  return aliases;
}

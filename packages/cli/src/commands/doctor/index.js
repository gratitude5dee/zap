// @ts-check
import { existsSync } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { resolvePayerStatus } from "../../lib/payer.js";
import { canRun, check, hasExecutable, version } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "doctor",
  summary: "Check local setup",
  usage: "zap doctor [--json]",
  async run({ flags }) {
    const checks = [];
    checks.push(check("node", Number(process.versions.node.split(".")[0]) >= 24, `Node ${process.versions.node}`));
    checks.push(check("package", existsSync(path.join(process.cwd(), "package.json")), "package.json present"));
    checks.push(check("zap skills", existsSync(path.join(process.cwd(), "agent", "skills")), "agent/skills present"));
    checks.push(check("convex", Boolean(process.env.NEXT_PUBLIC_CONVEX_URL), "NEXT_PUBLIC_CONVEX_URL configured"));
    checks.push(check("upstash", Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN), "Upstash REST env configured"));
    checks.push(check("supabase", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)), "Supabase public env configured"));
    checks.push(check("hyperframes", hasExecutable("npx") && canRun("npx", ["hyperframes", "--version"]), "optional HyperFrames CLI available"));
    if (flags.json) {
      const payer = await resolvePayerStatus();
      const sandbox = await listSandboxAdapters();
      printJson({ checks, payer, sandbox, version });
      return;
    }
    checks.forEach((item) => console.log(`${item.ok ? "ok" : "warn"} ${item.name}: ${item.detail}`));
  },
};

/** Lists sandbox adapters and catalog stubs for `doctor --json`. */
async function listSandboxAdapters() {
  try {
    const mod = await import("@wzrdtech/zap-sandbox");
    const adapters = [
      { id: "box", tier: "first-party", default: true, capabilities: mod.BOX_CAPABILITIES },
      { id: "namespace", tier: "first-party", capabilities: mod.NAMESPACE_CAPABILITIES },
      { id: "selfhost", tier: "first-party", capabilities: mod.SELFHOST_CAPABILITIES },
      { id: "microsandbox", tier: "first-party", capabilities: mod.MICROSANDBOX_CAPABILITIES },
      { id: "docker", tier: "first-party", capabilities: mod.DOCKER_CAPABILITIES },
      { id: "e2b", tier: "first-party", capabilities: mod.E2B_CAPABILITIES },
      { id: "daytona", tier: "first-party", capabilities: mod.DAYTONA_CAPABILITIES },
      { id: "cloudflare", tier: "first-party", capabilities: mod.CLOUDFLARE_CAPABILITIES },
      { id: "modal", tier: "first-party", gpu: true, capabilities: mod.MODAL_CAPABILITIES },
      { id: "local", tier: "first-party", capabilities: mod.LOCAL_CAPABILITIES },
      { id: "fake", tier: "first-party", capabilities: mod.FAKE_CAPABILITIES },
    ].filter((entry) => entry.capabilities);
    const catalog = (mod.CATALOG_MANIFESTS ?? []).map((manifest) => ({
      id: manifest.id,
      tier: "catalog-stub",
      capabilities: mod.STUB_CAPABILITIES,
    }));
    return { adapters: [...adapters, ...catalog] };
  } catch {
    return { adapters: [], detail: "@wzrdtech/zap-sandbox not installed" };
  }
}

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
      printJson({ checks, payer, version });
      return;
    }
    checks.forEach((item) => console.log(`${item.ok ? "ok" : "warn"} ${item.name}: ${item.detail}`));
  },
};

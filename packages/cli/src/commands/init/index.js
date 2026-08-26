// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { slugify, version, writeNewFile } from "../../lib/project.js";
import { scaffoldRecipe } from "../new/scaffold.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "init",
  summary: "Create a lightweight Zap project",
  usage: "zap init <directory> [--non-interactive] [--empty] [--example <slug>] [--json]",
  async run({ args, flags }) {
    const target = args[0];
    if (!target) throw new Error("Usage: zap init <directory> [--non-interactive]");
    const root = path.resolve(process.cwd(), target);
    await fs.mkdir(path.join(root, "agent", "skills"), { recursive: true });
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    await fs.mkdir(path.join(root, ".zap"), { recursive: true });
    await writeNewFile(path.join(root, "package.json"), JSON.stringify({
      name: slugify(path.basename(root)),
      private: true,
      devDependencies: {
        "@wzrdtech/zap": version,
      },
      scripts: {
        "zap:docs": "zap docs",
        "zap:doctor": "zap doctor",
        "zap:new": "zap new",
        "zap:run": "zap run",
        "zap:skills": "zap skills check",
        "zap:status": "zap status",
        "zap:validate": "zap validate",
      },
      type: "module",
    }, null, 2) + "\n");
    await writeNewFile(path.join(root, "AGENTS.md"), [
      "# Zap Agent Project",
      "",
      "Use `zap new`, `zap validate`, `zap lint`, and `zap run --json` before shipping recipes.",
      "`zap run` plans spend without provider calls. Use `--live` only after provider keys and budget approval are present.",
      "",
    ].join("\n"));
    await writeNewFile(path.join(root, ".gitignore"), ".env*\n!.env.example\n.zap/runs\nnode_modules\n");
    await writeNewFile(path.join(root, ".env.example"), [
      "UPSTASH_REDIS_REST_URL=",
      "UPSTASH_REDIS_REST_TOKEN=",
      "NEXT_PUBLIC_CONVEX_URL=",
      "NEXT_PUBLIC_SUPABASE_URL=",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=",
    ].join("\n") + "\n");
    if (!flags.empty) {
      await scaffoldRecipe(root, flags.example ? String(flags.example) : "hello-world", { force: false });
    }
    if (!flags.json) console.log(`Initialized Zap project at ${root}`);
    else printJson({ ok: true, root });
  },
};

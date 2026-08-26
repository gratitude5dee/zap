// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { findResourceRoot, listMarkdownTopics } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "docs",
  summary: "Print bundled docs",
  usage: "zap docs [topic] [--json]",
  async run({ args, flags }) {
    const requestedTopic = args[0] ?? "index";
    const aliases = {
      agents: "quickstart/agents",
      cli: "reference/cli",
      deploy: "deploy",
      providers: "providers",
      runtime: "reference/runtime",
      schema: "zap-spec",
      "supabase-secrets": "deployment/supabase-secrets",
      vercel: "deployment/vercel",
      "zap-spec": "zap-spec",
    };
    const topic = aliases[requestedTopic] ?? requestedTopic;
    const docsRoot = path.join(findResourceRoot(), "docs");
    const candidates = [
      path.join(docsRoot, `${topic}.md`),
      path.join(docsRoot, "quickstart", `${topic}.md`),
      path.join(docsRoot, "reference", `${topic}.md`),
      path.join(docsRoot, "deployment", `${topic}.md`),
    ];
    const file = candidates.find((candidate) => existsSync(candidate));
    if (!file) {
      const topics = await listMarkdownTopics(docsRoot);
      if (flags.json) printJson({ requestedTopic, topics });
      else topics.forEach((entry) => console.log(entry));
      return;
    }
    const content = await fs.readFile(file, "utf8");
    if (flags.json) printJson({ content, file, requestedTopic, topic });
    else console.log(content);
  },
};

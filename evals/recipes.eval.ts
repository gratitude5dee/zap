import { promises as fs } from "node:fs";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { parseZapMarkdown } from "@wzrdtech/core/schema";
import { canonicalZapRegistryIndex } from "../lib/zap-registry";

const cases = await Promise.all(canonicalZapRegistryIndex.zaps.map(async (entry) => {
  const source = await fs.readFile(path.join(process.cwd(), "registry", "zaps", `zap-${entry.slug}`, "Zap.md"), "utf8");
  return { entry, spec: parseZapMarkdown(source) };
}));

export default cases.map(({ entry, spec }) => defineEval({
  description: `Dry-run contract for ${entry.slug}: exact step shape and budget guard.`,
  metadata: { recipe: entry.slug },
  tags: ["ci", "recipe", "dry-run"],
  async test(t) {
    const inputs = Object.fromEntries(Object.keys(spec.inputs).map((name) => [name, name === "image" ? "mock://fixture.png" : `fixture-${name.toLowerCase()}`]));
    const response = await t.target.fetch(`/zaps/${entry.slug}/plan`, {
      body: JSON.stringify({ credentialMode: "byok", dryRun: true, extendCount: 0, inputs, live: false, slug: entry.slug }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json() as {
      dryRun?: boolean;
      quoteUsd?: number;
      status?: string;
      steps?: Array<{ stepId?: string }>;
    };
    t.log(`dry-run ${entry.slug}: ${response.status} ${JSON.stringify(payload)}`);
    t.check(response.status, equals(200));
    t.check(payload.status, equals("planned"));
    t.check(payload.dryRun, equals(true));
    t.check(payload.steps?.map((step) => step.stepId), equals(spec.steps.filter((step) => step.kind !== "video.extend" || (step.repeat?.default ?? 0) > 0).map((step) => step.id)));
    t.check(payload.quoteUsd, satisfies(
      (quote) => typeof quote === "number" && quote >= 0 && quote <= spec.budget.cap_usd,
      `quote stays within ${entry.slug} cap`,
    ));
  },
}));

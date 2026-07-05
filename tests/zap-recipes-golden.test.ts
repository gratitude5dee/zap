import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createZapRunTicket } from "../lib/zap-runner-server";
import { loadZapSpec } from "../lib/zap-files";

describe("packaged Zap recipe golden dry-runs", () => {
  it("plans every packaged Zap with synthetic inputs", async () => {
    const slugs = await listZapSlugs();

    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const spec = await loadZapSpec(slug);
      expect(spec, slug).not.toBeNull();
      const result = await createZapRunTicket({
        dryRun: true,
        extendCount: 0,
        inputs: buildSyntheticInputs(spec!),
        slug,
      });

      expect(result.response.status, slug).toBe("planned");
      expect(result.response.steps.length, slug).toBeGreaterThan(0);
      expect(result.response.quoteUsd, slug).toBeGreaterThanOrEqual(0);
      expect(result.execution, slug).toBeUndefined();
    }
  });
});

async function listZapSlugs() {
  const skillsDir = path.join(process.cwd(), "agent", "skills");
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("zap-"))
    .map((entry) => entry.name.slice("zap-".length))
    .sort();
}

function buildSyntheticInputs(spec: NonNullable<Awaited<ReturnType<typeof loadZapSpec>>>) {
  return Object.fromEntries(
    Object.entries(spec.inputs).map(([name, input]) => {
      if (input.type === "image") return [name, "data:image/png;base64,aGVsbG8="];
      if (input.type === "video") return [name, "data:video/mp4;base64,aGVsbG8="];
      if (input.type === "number") return [name, 1];
      if (input.type === "select") return [name, input.options?.[0] ?? "Option"];
      return [name, `Test ${name}`];
    }),
  );
}

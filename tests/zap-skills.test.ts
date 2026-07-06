import { describe, expect, it } from "vitest";
import { listZapSkillDownloads, readZapSkill } from "../lib/zap-skills";

describe("Zap skill registry", () => {
  it("adds stable download URLs to the bundled manifest", async () => {
    const manifest = await listZapSkillDownloads("https://zap.wzrd.tech");
    const core = manifest.skills.find((entry) => entry.skill === "zap");

    expect(core?.downloadUrl).toBe("https://zap.wzrd.tech/api/skills/zap");
    expect(core?.jsonUrl).toBe("https://zap.wzrd.tech/api/skills/zap?format=json");
    expect(manifest.skills.length).toBeGreaterThan(0);
  });

  it("serves only manifest-listed skills", async () => {
    const core = await readZapSkill("zap");

    expect(core?.content).toContain("# zap");
    expect(await readZapSkill("../package")).toBeNull();
  });
});

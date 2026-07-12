import { describe, expect, it } from "vitest";
import { readPrompt } from "../lib/zap-files";

describe("Zap prompt resolution", () => {
  it("uses authored inline prompts as prompt text instead of filesystem paths", async () => {
    const prompt = "Create a release acceptance image for {PROMPT}";
    await expect(readPrompt("release-acceptance", prompt)).resolves.toBe(prompt);
  });

  it("continues loading prompt file references from bundled skills", async () => {
    await expect(readPrompt("world-cup-entrance", "prompts/initial-gen.md"))
      .resolves.toContain("Cinematic World Cup-style player entrance");
  });

  it("rejects prompt file references that escape the skill prompt directory", async () => {
    await expect(readPrompt("world-cup-entrance", "prompts/../../secret.md"))
      .rejects.toThrow(/Invalid prompt file reference/);
  });
});

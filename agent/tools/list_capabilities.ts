import { defineTool } from "eve/tools";
import { z } from "zod";
import { listCapabilityManifest } from "../../lib/providers/router.js";

export default defineTool({
  description: "List provider/model capabilities and pricing units available to Zap planning.",
  inputSchema: z.object({
    includeMock: z.boolean().default(false).describe("Deprecated; production capabilities never include mock providers."),
  }),
  async execute({ includeMock }) {
    return {
      capabilities: listCapabilityManifest({ includeMock }),
    };
  },
  toModelOutput(output) {
    const lines = output.capabilities
      .slice(0, 24)
      .map((capability) => `${capability.provider}/${capability.model} ${capability.capability} $${capability.price.usd}/${capability.price.unit}`);
    const suffix = output.capabilities.length > lines.length ? `\n+${output.capabilities.length - lines.length} more` : "";
    return { type: "text", value: `Zap capabilities:\n${lines.join("\n")}${suffix}` };
  },
});

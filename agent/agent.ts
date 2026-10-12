import { defineAgent } from "eve";
import { createLlmModel, resolveLlmRoute } from "../lib/llm-route";

const selection = resolveLlmRoute();

export default defineAgent({
  build: {
    externalDependencies: ["@ai-sdk/anthropic", "@asciidev/eve-box", "@daytonaio/sdk", "e2b"],
  },
  model: selection.route === "gateway" ? selection.modelId : await createLlmModel(selection),
  reasoning: "medium",
  experimental: {
    workflow: {
      // Zap registers no workflow runs. The Workers deployment installs an
      // inert world; the default world-local backend needs a filesystem.
      world: "zap-workers-world",
    },
  },
});

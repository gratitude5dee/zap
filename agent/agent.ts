import { defineAgent } from "eve";
import { createLlmModel, resolveLlmRoute } from "../lib/llm-route";

const selection = resolveLlmRoute();

export default defineAgent({
  build: {
    externalDependencies: ["@asciidev/eve-box", "@daytonaio/sdk", "e2b"],
  },
  model: selection.route === "gateway" ? selection.modelId : await createLlmModel(selection),
  reasoning: "medium",
});

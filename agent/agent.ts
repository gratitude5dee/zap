import { defineAgent } from "eve";
import { createLlmModel, resolveLlmRoute } from "../lib/llm-route";

const selection = resolveLlmRoute();

export default defineAgent({
  model: selection.route === "gateway" ? selection.modelId : await createLlmModel(selection),
  reasoning: "medium",
});

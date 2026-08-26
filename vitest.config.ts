import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@wzrdtech/zap-agent": path.resolve(import.meta.dirname, "packages/agent-code/src/index.ts"),
      "@": path.resolve(import.meta.dirname),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/*/tests/**/*.test.ts"],
  },
});

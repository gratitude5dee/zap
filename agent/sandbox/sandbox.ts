import { defineSandbox } from "eve/sandbox";
import { resolveSandboxBackend } from "../../packages/sandbox-adapters/src";

export default defineSandbox({
  backend: () => resolveSandboxBackend(),
  description: "Zap media workspace with a configuration-selected hosted sandbox backend.",
  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({ command: "ffmpeg -version >/dev/null 2>&1 || true" });
  },
});

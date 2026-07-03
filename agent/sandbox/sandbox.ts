import { defineSandbox } from "eve/sandbox";

export default defineSandbox({
  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({ command: "ffmpeg -version >/dev/null 2>&1 || true" });
  },
});

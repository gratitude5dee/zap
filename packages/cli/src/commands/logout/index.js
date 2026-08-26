// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { zapConfigDir } from "../../lib/project.js";
import { readAuthStore, writeAuthStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "logout",
  summary: "Remove the stored Zap API token",
  usage: "zap logout [--json]",
  async run({ flags }) {
    const file = path.join(await zapConfigDir(), "auth.json");
    if (existsSync(file)) {
      const auth = await readAuthStore();
      const { apiToken, token, ...rest } = auth;
      const keepable = { ...rest };
      if (keepable.managed || keepable.providers) {
        await writeAuthStore(keepable);
      } else {
        await fs.rm(file, { force: true });
      }
    }
    if (flags.json) printJson({ ok: true });
    else console.log("Logged out.");
  },
};

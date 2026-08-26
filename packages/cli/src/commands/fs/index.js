// @ts-check
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { findRuntime, reacquireHandle, readRuntimeState } from "../../lib/runtimes.js";

const USAGE = "zap fs <ls|read|write|rm> <runtime-id> <path> [content] [--json]";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "fs",
  summary: "Runtime filesystem operations (ls, read, write, rm)",
  usage: USAGE,
  async run({ args, flags }) {
    const [subcommand, runtimeId, targetPath, content] = args;
    if (!subcommand || !runtimeId || !targetPath) throw usageError(`Usage: ${USAGE}`);
    const state = await readRuntimeState();
    const record = findRuntime(state, runtimeId);
    const handle = await reacquireHandle(record);
    switch (subcommand) {
      case "ls": {
        if (!handle.fs.readdir) throw usageError(`Provider ${record.provider} does not support readdir.`);
        const entries = await handle.fs.readdir(targetPath);
        if (flags.json) printJson({ entries, path: targetPath });
        else entries.forEach((entry) => console.log(`${entry.type === "dir" ? "d" : "-"} ${entry.name}`));
        return;
      }
      case "read": {
        const bytes = await handle.fs.read(targetPath);
        const text = bytes ? new TextDecoder().decode(bytes) : null;
        if (flags.json) printJson({ content: text, path: targetPath });
        else if (text !== null) process.stdout.write(text);
        return;
      }
      case "write": {
        if (content === undefined) throw usageError(`Usage: ${USAGE}`);
        await handle.fs.write(targetPath, new TextEncoder().encode(content));
        if (flags.json) printJson({ ok: true, path: targetPath });
        else console.log(`Wrote ${targetPath}`);
        return;
      }
      case "rm": {
        await handle.fs.remove(targetPath, { recursive: Boolean(flags.recursive) });
        if (flags.json) printJson({ ok: true, path: targetPath });
        else console.log(`Removed ${targetPath}`);
        return;
      }
      default:
        throw usageError(`Usage: ${USAGE}`);
    }
  },
};

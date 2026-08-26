// @ts-check
// Shared helpers for the MCP tool modules (packages/mcp/src/tools/<domain>.js).
// Every CLI-backed tool shells out to the zap CLI with --json (§5.10) and
// never returns a secret value; live:true paths are payer-gated (C5).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAYER_MISSING_REMEDIATION = [
  "zap keys add <provider> …",
  "zap login --provider claude-code",
  "zap pay login --managed",
];

/**
 * Wraps a JSON value as MCP text content.
 * @param {unknown} value
 */
export function toolJson(value) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
  };
}

/**
 * Wraps an error payload as MCP error content.
 * @param {unknown} payload
 */
export function toolError(payload) {
  return {
    content: [{ text: JSON.stringify(payload, null, 2), type: "text" }],
    isError: true,
  };
}

/**
 * Runs a zap CLI command with --json and wraps its result.
 * @param {string[]} args
 */
export async function cliTool(args) {
  try {
    const payload = await runZapJson(args);
    return toolJson(payload);
  } catch (error) {
    return toolError({ error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Payer gate for live:true tool calls (C5): resolves the payer through the
 * CLI (`zap pay status --json`) and returns a PAYER_MISSING tool error when
 * no payer is configured, or null when the live call may proceed.
 */
export async function refuseLiveWithoutPayer() {
  let payer = "missing";
  try {
    const status = await runZapJson(["pay", "status", "--json"]);
    if (status && typeof status === "object" && "payer" in status) {
      payer = String(/** @type {{ payer?: unknown }} */ (status).payer ?? "missing");
    }
  } catch {
    payer = "missing";
  }
  if (payer !== "missing") return null;
  return toolError({
    error: {
      code: "PAYER_MISSING",
      message: "live:true requires a payer; none is configured.",
      remediation: PAYER_MISSING_REMEDIATION,
    },
  });
}

/** @param {string[]} args */
export async function runZapJson(args) {
  const result = await runZap(args);
  const text = result.stdout.trim();
  if (!text) return { ok: result.code === 0, stderr: result.stderr.trim() };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: result.code === 0, stderr: result.stderr.trim(), stdout: text };
  }
}

/** @param {string[]} args */
async function runZap(args) {
  const command = await resolveZapCommand();
  const childArgs = command.kind === "node" ? [command.bin, ...args] : args;
  return await new Promise((resolve, reject) => {
    const child = spawn(command.kind === "node" ? process.execPath : command.bin, childArgs, {
      cwd: process.cwd(),
      env: { ...process.env, ZAP_MCP_CHILD: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ code, stderr, stdout });
      else reject(new Error((stderr || stdout || `zap exited with ${code}`).trim()));
    });
  });
}

async function resolveZapCommand() {
  const explicit = process.env.ZAP_CLI_BIN;
  if (explicit) return existsSync(explicit) ? { bin: explicit, kind: "node" } : { bin: explicit, kind: "command" };

  const local = fileURLToPath(new URL("../../cli/bin/zap.js", import.meta.url));
  if (existsSync(local)) return { bin: local, kind: "node" };

  const linked = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "zap.cmd" : "zap");
  if (existsSync(linked)) return { bin: linked, kind: "command" };

  return { bin: "zap", kind: "command" };
}

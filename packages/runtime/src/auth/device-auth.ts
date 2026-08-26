import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerSecret } from "./redact.ts";
import type { ByokProvider } from "./byok.ts";

export type DeviceAuthProvider = ByokProvider | "openrouter" | "openai" | "anthropic";

export interface DeviceAuthDeps {
  exec(cmd: string, args: string[]): Promise<{ stdout: string; exitCode: number }>;
  zapDir?: string;
  log?: (line: string) => void;
  /** key provided on stdin for `openai|anthropic|openrouter` or `codex --with-api-key`. */
  stdinKey?: string;
}

export interface DeviceLoginResult {
  provider: DeviceAuthProvider;
  storedAt: string;
}

async function storeToken(
  zapDir: string,
  provider: string,
  token: string,
): Promise<string> {
  await fs.mkdir(zapDir, { recursive: true });
  const file = path.join(zapDir, "device-auth.json");
  let tokens: Record<string, string> = {};
  try {
    tokens = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, string>;
  } catch {
    tokens = {};
  }
  tokens[provider] = token;
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  await fs.chmod(file, 0o600);
  return file;
}

/**
 * `zap login --provider <id>`: claude-code runs `claude setup-token`; codex
 * runs `codex login --device-auth` (or `--with-api-key` from stdin); plain
 * API providers take the key from stdin. Tokens are stored 0600 and never
 * printed.
 */
export async function deviceLogin(
  provider: DeviceAuthProvider,
  deps: DeviceAuthDeps,
): Promise<DeviceLoginResult> {
  const zapDir = deps.zapDir ?? path.join(os.homedir(), ".zap");
  const log = deps.log ?? (() => undefined);
  let token: string | undefined;

  if (provider === "claude-code") {
    const result = await deps.exec("claude", ["setup-token"]);
    if (result.exitCode !== 0) throw new Error("claude setup-token failed.");
    token = result.stdout.trim();
  } else if (provider === "codex") {
    if (deps.stdinKey) {
      const result = await deps.exec("codex", ["login", "--with-api-key"]);
      if (result.exitCode !== 0) throw new Error("codex login failed.");
      token = deps.stdinKey;
    } else {
      const result = await deps.exec("codex", ["login", "--device-auth"]);
      if (result.exitCode !== 0) throw new Error("codex login --device-auth failed.");
      token = result.stdout.trim() || "codex-device-auth";
    }
  } else {
    token = deps.stdinKey;
    if (!token) throw new Error(`Provide the ${provider} key on stdin.`);
  }

  registerSecret(token);
  const storedAt = await storeToken(zapDir, provider, token);
  log(`Stored ${provider} credential (0600).`);
  return { provider, storedAt };
}

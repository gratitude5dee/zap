import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerSecret } from "./redact.ts";
import type { PayerMode } from "../meter/units.ts";

export type ByokProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "xai"
  | "claude-code"
  | "codex";

export const PROVIDER_KEY_ENV: Record<ByokProvider, string> = {
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  xai: "XAI_API_KEY",
  "claude-code": "CLAUDE_CODE_OAUTH_TOKEN",
  codex: "CODEX_API_KEY",
};

export class AuthError extends Error {
  readonly code: "KEY_MISSING" | "KEY_UNAVAILABLE" | "AUTH_FILE_INSECURE";
  readonly remediation?: string;

  constructor(code: AuthError["code"], message: string, remediation?: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.remediation = remediation;
  }
}

export interface ByokDeps {
  env?: Record<string, string | undefined>;
  /** `.zap/credentials.json` — the `zap keys` store. */
  credentials?: (provider: ByokProvider) => Promise<string | undefined>;
  /** device-auth token store (`.zap/device-auth.json`, Codex `~/.codex/auth.json`). */
  deviceTokens?: (provider: ByokProvider) => Promise<string | undefined>;
  /** Supabase user vault (web). */
  vault?: (provider: ByokProvider) => Promise<string | undefined>;
  zapDir?: string;
}

/** `status() = "byok"` whenever ZAP_PAYER_MODE=byok — free lanes need no key. */
export function byokStatus(env: Record<string, string | undefined>): PayerMode {
  return env.ZAP_PAYER_MODE === "byok" ? "byok" : "missing";
}

async function readDeviceToken(provider: ByokProvider, zapDir: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(path.join(zapDir, "device-auth.json"), "utf8");
    const tokens = JSON.parse(raw) as Record<string, string | undefined>;
    return tokens[provider];
  } catch {
    return undefined;
  }
}

/**
 * Resolve a BYOK provider key at route time: env → `zap keys` store →
 * device-auth tokens → vault. Never logged; registered for redaction.
 */
export async function resolveByokKey(provider: ByokProvider, deps: ByokDeps = {}): Promise<string> {
  const env = deps.env ?? {};
  const zapDir = deps.zapDir ?? path.join(os.homedir(), ".zap");

  const fromEnv = env[PROVIDER_KEY_ENV[provider]];
  const resolved =
    fromEnv ??
    (await deps.credentials?.(provider)) ??
    (deps.deviceTokens ? await deps.deviceTokens(provider) : await readDeviceToken(provider, zapDir)) ??
    (await deps.vault?.(provider));

  if (!resolved) {
    throw new AuthError(
      "KEY_MISSING",
      `No key configured for provider "${provider}".`,
      `Set ${PROVIDER_KEY_ENV[provider]} or run: zap keys set ${provider}`,
    );
  }
  registerSecret(resolved);
  return resolved;
}

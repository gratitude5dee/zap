/**
 * Secret redaction for every Zap log line (C24). Every later session logs
 * through `redact` — canary classes: Box keys, hosted `_token`, desktop
 * URLs, runtime/bridge tokens, provider keys, Thirdweb/CDP/MPP secrets.
 */
import { scrub } from "./auth/redact.ts";

export const REDACTED = "[REDACTED]";

interface RedactionRule {
  id: string;
  pattern: RegExp;
  replace: (match: string, ...groups: string[]) => string;
}

const keepKeyRule = (id: string, pattern: RegExp): RedactionRule => ({
  id,
  pattern,
  replace: (_match, key: string) => `${key}${REDACTED}`,
});

const RULES: RedactionRule[] = [
  // hosted URL bearer: ?_token=… (Box hosted routes)
  keepKeyRule("hosted_token", /([?&]_token=)[^\s&"']+/gi),
  // desktop stream URLs are secret-bearing end to end
  {
    id: "desktop_url",
    pattern: /https:\/\/[^\s"']*desktop[^\s"']*/gi,
    replace: () => REDACTED,
  },
  // Box API keys
  { id: "box_key", pattern: /\bbox_(?:live|test)_[A-Za-z0-9_-]{8,}\b/g, replace: () => REDACTED },
  // env-style assignments and JSON fields for token/key/secret material
  keepKeyRule(
    "env_assignment",
    /\b((?:RUNTIME_TOKEN|ZAP_SELFHOST_TOKEN|GATEWAY_TOKEN|BOX_API_KEY|MSB_API_KEY|NAMESPACE_TOKEN|X-Zap-Bridge-Token|THIRDWEB_SECRET_KEY|CDP_API_KEY_SECRET|MPP_SECRET|FAL_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|UPSTASH_REDIS_REST_TOKEN)\s*[=:]\s*["']?)[^\s"',}]+/gi,
  ),
  // Authorization / bearer headers
  keepKeyRule("bearer", /\b((?:authorization|x-nsc-ingress-auth|x-zap-bridge-token)\s*[=:]\s*["']?(?:bearer\s+)?)[^\s"',}]+/gi),
  keepKeyRule("bearer_prefix", /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi),
  // common provider key shapes
  { id: "openai_key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: () => REDACTED },
  { id: "thirdweb_key", pattern: /\btw_secret_[A-Za-z0-9_-]{8,}\b/g, replace: () => REDACTED },
  { id: "cdp_key", pattern: /\bcdp_[A-Za-z0-9_-]{8,}\b/g, replace: () => REDACTED },
  { id: "mpp_key", pattern: /\bmpp_[A-Za-z0-9_-]{8,}\b/g, replace: () => REDACTED },
  { id: "upstash_token", pattern: /\bA[A-Za-z0-9]{20,}=(?=\s|$|["'])/g, replace: () => REDACTED },
  // owner-supplied connectivity join credentials (tailnet, SAM mesh)
  { id: "tailscale_authkey", pattern: /\btskey-[A-Za-z0-9-]{8,}\b/g, replace: () => REDACTED },
  keepKeyRule(
    "connectivity_join",
    /((?:--auth-key|--authkey|--bootstrap-token|--join|TS_AUTHKEY|ZAP_TAILSCALE_AUTH_KEY|ZAP_SAM_BOOTSTRAP_TOKEN|ZAP_MESH_INVITE_TOKEN)[=:\s]+["']?)[^\s"',}]+/gi,
  ),
];

/** Redacts secret material from one log line. */
export function redact(text: string): string {
  // The registry runs first: an owner-supplied credential (a mesh invite
  // token, say) has no recognizable shape for a pattern rule to catch.
  let out = scrub(text);
  for (const rule of RULES) {
    out = out.replace(rule.pattern, rule.replace as (substring: string, ...args: unknown[]) => string);
  }
  return out;
}

/** Redacts every string leaf of a structured payload (for --json surfaces). */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(item);
    }
    return out as T;
  }
  return value;
}

/** A log sink that redacts before writing; buffers for canary assertions in tests. */
export function createRedactingLog(write: (line: string) => void): {
  log: (line: string) => void;
  buffer: string[];
} {
  const buffer: string[] = [];
  return {
    buffer,
    log(line: string) {
      const safe = redact(line);
      buffer.push(safe);
      write(safe);
    },
  };
}

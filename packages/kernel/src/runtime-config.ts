import { NotImplementedError } from "./errors.ts";
import type { RuntimeOptions } from "./types.ts";

/**
 * Structural view of a parsed Runtime.md frontmatter. The full zod schema
 * lives in @wzrdtech/core/runtime-spec; the kernel only needs the shape.
 */
export interface RuntimeSpecLike {
  runtime: string;
  version: number;
  weight: RuntimeOptions["weight"];
  sandbox?: { provider: string; template?: string; size?: string; environment?: string; idleStopMinutes?: number };
  memory?: { provider: string; consent?: boolean };
  gateway?: { llm?: string; model?: string; media?: readonly string[] };
  harness?: { id: string; profile?: string };
  pay?: { mode: "byok" | "managed"; keysInRuntime?: boolean };
  skills?: readonly string[];
  connections?: ReadonlyArray<Record<string, unknown>>;
  env?: { allow?: readonly string[] };
  lanes?: readonly string[];
}

/**
 * Runtime.md -> plugin tree with stable entry ids. The plugin factory
 * registry is contributed by @wzrdtech/zap-runtime compose(); until that
 * lands this fails closed.
 */
export function loadRuntimeConfig(spec: RuntimeSpecLike): RuntimeOptions {
  void spec;
  throw new NotImplementedError("loadRuntimeConfig (provided by @wzrdtech/zap-runtime compose)");
}

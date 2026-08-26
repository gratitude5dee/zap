// @ts-check
import { toErrorPayload } from "./errors.js";

/** @param {unknown} value */
export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

/** @param {unknown} error */
export function printError(error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`zap: ${message}`);
}

/**
 * Prints a structured error: JSON envelope on stdout with `--json`,
 * the legacy `zap: <message>` line on stderr otherwise.
 * @param {unknown} error
 * @param {{ json?: unknown }} flags
 */
export function printCommandError(error, flags) {
  if (flags && flags.json) printJson({ error: toErrorPayload(error) });
  else printError(error);
}

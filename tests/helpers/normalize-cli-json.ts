import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const cliVersion = (
  JSON.parse(readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")) as { version: string }
).version;

const RUN_ID = /\brun_[0-9a-z]+(?:_[0-9a-z]+)*\b/g;
const ISO_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const EPOCH_MS = /\b1[6-9]\d{11}\b/g;

/**
 * Normalizes dynamic values in CLI --json output so 0.3.1 fixtures stay
 * byte-comparable: runId, timestamps, absolute paths, and the CLI version.
 */
export function normalizeCliJson(raw: string): string {
  let text = raw;
  text = text.split(repoRoot).join("<repo>");
  const home = process.env.HOME;
  if (home) text = text.split(home).join("<home>");
  text = text.replace(ISO_TIMESTAMP, "<timestamp>");
  text = text.replace(EPOCH_MS, "<epoch-ms>");
  text = text.replace(RUN_ID, "<run-id>");
  text = text.split(cliVersion).join("<cli-version>");
  return text;
}

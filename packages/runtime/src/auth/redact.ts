/**
 * Process-wide redaction registry (C24): every resolved secret value is
 * registered here and scrubbed from any log line or --json payload.
 */
const REGISTERED = new Set<string>();

export function registerSecret(value: string): void {
  if (value && value.length >= 4) REGISTERED.add(value);
}

export function scrub(text: string): string {
  let out = text;
  for (const secret of REGISTERED) {
    while (out.includes(secret)) out = out.replace(secret, "[redacted]");
  }
  return out;
}

export function resetRedaction(): void {
  REGISTERED.clear();
}

export type LogSink = (line: string) => void;

export function redactingLogger(sink: LogSink): LogSink {
  return (line: string) => sink(scrub(line));
}

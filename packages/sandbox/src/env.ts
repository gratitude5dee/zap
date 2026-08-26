/**
 * Dedicated environment access for the sandbox package (C22): adapters never
 * read process.env directly — every gate and credential flows through here so
 * tests can inject values and the read surface stays auditable.
 */
export type SandboxEnv = Readonly<Record<string, string | undefined>>;

export function readSandboxEnv(overrides?: SandboxEnv): SandboxEnv {
  return overrides ?? process.env;
}

export function fakeSandboxAllowed(env?: SandboxEnv): boolean {
  return readSandboxEnv(env).ZAP_ALLOW_FAKE_SANDBOX === "1";
}

export function localSandboxAllowed(env?: SandboxEnv): boolean {
  const e = readSandboxEnv(env);
  return (
    e.ZAP_ALLOW_LOCAL_SANDBOX === "1" ||
    Boolean(e.RUNTIME_TOKEN?.trim()) ||
    Boolean(e.ZAP_SELFHOST_TOKEN?.trim())
  );
}

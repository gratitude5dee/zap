// The connectivity enable path must read the flag keys parseArgs actually
// produces: `--auth-key-file` arrives camelCased as `authKeyFile`. A mocked
// argv test cannot catch that drift, so these tests run the real parser and
// the real enable path against a fake box.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ConnectivityBox } from "@wzrdtech/zap-runtime";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/lib/args.js";
import { enableFeature } from "../src/commands/runtime/index.js";

function fakeBox(): { box: ConnectivityBox; commands: string[]; files: Map<string, string> } {
  const commands: string[] = [];
  const files = new Map<string, string>();
  const box: ConnectivityBox = {
    async exec(command) {
      commands.push(command);
      return { exitCode: 0, stderr: "", stdout: "" };
    },
    async writeFile(filePath, content) {
      files.set(filePath, content);
    },
  };
  return { box, commands, files };
}

describe("runtime connectivity enable reads parseArgs' camelCase flag keys", () => {
  it("tailscale: --auth-key-file and --hostname reach enableTailscale", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zap-conn-"));
    const keyFile = path.join(dir, "authkey");
    const authKey = "tskey-auth-test1234567890";
    writeFileSync(keyFile, `${authKey}\n`);
    const { flags } = parseArgs(["--auth-key-file", keyFile, "--hostname", "my-box"]);
    const { box, commands, files } = fakeBox();
    await enableFeature(box, "tailscale", flags);
    expect([...files.values()]).toContain(authKey);
    expect(commands.some((command) => command.includes("--hostname='my-box'"))).toBe(true);
  });

  it("samMesh: --control-plane and --bootstrap-token-file reach enableSamMesh", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zap-conn-"));
    const tokenFile = path.join(dir, "bootstrap");
    const token = "sam-bootstrap-token-1234567890";
    writeFileSync(tokenFile, `${token}\n`);
    const { flags } = parseArgs(["--control-plane", "https://mesh.owner.example", "--bootstrap-token-file", tokenFile]);
    const { box, files } = fakeBox();
    await enableFeature(box, "samMesh", flags);
    expect([...files.values()]).toContain(token);
    const meshConfig = [...files.entries()].find(([file]) => file.endsWith("mesh.json"))?.[1] ?? "";
    expect(meshConfig).toContain("https://mesh.owner.example");
  });
});

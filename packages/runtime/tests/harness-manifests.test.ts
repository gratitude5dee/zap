// Z10 acceptance: every manifest's run adapter matches the §5.6 table; port
// and privacy rules hold; managed mode is declared for every heavy harness
// that is neither in-process nor pull-only; pins are recorded (C30).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessManifest } from "../src/harness/zap.ts";
import { allHarnessManifests, heavyHarnessIds, managedGatewayUrl } from "../src/harness/manifests.ts";

const RUN_TABLE: Record<HarnessManifest["id"], HarnessManifest["run"]> = {
  zap: "http-runs",
  hermes: "http-runs",
  opencode: "http-runs",
  kimi: "http-runs",
  agno: "http-runs",
  openclaw: "openai-compat",
  pi: "rpc-jsonl",
  prime: "rpc-jsonl",
  fx: "cli-exec",
  cursor: "cli-exec",
  devin: "cli-exec",
  headlong: "cli-exec",
  frontier: "cli-exec",
  deepseek: "cli-exec",
  grok: "http-runs",
  interpreter: "ws-jsonrpc",
  omg: "ws-jsonrpc",
};

// harnesses whose only inbound surface exists by construction (no other
// adapters ship in the binary), so an empty disabledInbound is correct.
const SINGLE_INBOUND = new Set<HarnessManifest["id"]>([
  "zap", "fx", "interpreter", "pi", "prime", "cursor", "devin", "headlong", "frontier", "deepseek",
]);

describe("harness manifests (§5.6 table)", () => {
  const manifests = allHarnessManifests();

  it("covers every harness id exactly once", () => {
    const ids = manifests.map((m) => m.id).sort();
    expect(ids).toEqual(Object.keys(RUN_TABLE).sort());
  });

  it.each(Object.entries(RUN_TABLE))("%s runs over %s", (id, run) => {
    const manifest = manifests.find((m) => m.id === id);
    expect(manifest, `manifest for ${id}`).toBeDefined();
    expect(manifest?.run).toBe(run);
  });

  it("http/openai/ws harnesses declare exactly one api port; devin is outbound-only", () => {
    for (const manifest of manifests) {
      const apiPorts = manifest.ports.filter((p) => p.role === "api");
      if (manifest.pullOnly) {
        expect(manifest.ports, `${manifest.id} is outbound-only`).toEqual([]);
        continue;
      }
      if (manifest.run === "cli-exec" || manifest.run === "rpc-jsonl") {
        expect(manifest.ports, `${manifest.id} declares no ports`).toEqual([]);
      } else {
        expect(apiPorts, `${manifest.id} declares exactly one api port`).toHaveLength(1);
      }
    }
  });

  it("every hosted port is private", () => {
    for (const manifest of manifests) {
      for (const port of manifest.ports) {
        expect(port.hostPrivate, `${manifest.id}:${port.port}`).toBe(true);
      }
    }
  });

  it("disabledInbound is non-empty except single-inbound-by-construction harnesses", () => {
    for (const manifest of manifests) {
      if (SINGLE_INBOUND.has(manifest.id)) continue;
      expect(manifest.disabledInbound.length, `${manifest.id} disables its other inbound adapters`).toBeGreaterThan(0);
    }
  });

  it("managedGateway present unless inProcess or pullOnly (heavy harnesses)", () => {
    for (const manifest of manifests) {
      if (!heavyHarnessIds().includes(manifest.id)) continue;
      if (manifest.inProcess || manifest.pullOnly) {
        expect(manifest.managedGateway).toBeUndefined();
      } else {
        expect(manifest.managedGateway, `${manifest.id} declares managedGateway`).toBeDefined();
      }
    }
  });

  it("pins are non-empty for every heavy harness manifest (C30)", () => {
    for (const manifest of manifests) {
      if (!heavyHarnessIds().includes(manifest.id)) continue;
      expect(Object.keys(manifest.pins).length, `${manifest.id} records pins`).toBeGreaterThan(0);
    }
  });

  it("well-known ports match the template matrix", () => {
    const byId = new Map(manifests.map((m) => [m.id, m]));
    expect(byId.get("hermes")?.ports).toEqual([
      { port: 8642, role: "api", hostPrivate: true },
      { port: 9119, role: "dashboard", hostPrivate: true },
    ]);
    expect(byId.get("openclaw")?.ports).toEqual([{ port: 18789, role: "api", hostPrivate: true }]);
    expect(byId.get("opencode")?.ports).toEqual([{ port: 4096, role: "api", hostPrivate: true }]);
    expect(byId.get("omg")?.ports).toEqual([{ port: 8766, role: "api", hostPrivate: true }]);
    expect(byId.get("kimi")?.ports).toEqual([{ port: 58627, role: "api", hostPrivate: true }]);
    expect(byId.get("agno")?.ports).toEqual([{ port: 7777, role: "api", hostPrivate: true }]);
  });

  it("deepseek exposes only the supported presets and never the fourth (C3)", () => {
    const deepseek = manifests.find((m) => m.id === "deepseek");
    expect(deepseek).toBeDefined();
    const serialized = JSON.stringify(deepseek).toLowerCase();
    const { deny } = JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../../../tests/fixtures/platform-name-denylist.json"),
        "utf8",
      ),
    ) as { deny: string[] };
    for (const name of deny) {
      expect(serialized).not.toContain(name.toLowerCase());
    }
    expect(deepseek?.pins["@deepseek-ai/dsh"]).toBeTruthy();
  });

  it("managedGatewayUrl points at the control API per-runtime proxy", () => {
    expect(managedGatewayUrl("https://api.zap.example", "rt_123")).toBe(
      "https://api.zap.example/v1/runtimes/rt_123/gateway",
    );
  });
});

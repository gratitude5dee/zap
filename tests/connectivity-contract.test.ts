// Connectivity opt-in contract: every runtime template ships the four
// connectivity features installed but DISABLED, no bake step joins a network,
// and nothing in the opt-in surface can carry a credential or content.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONNECTIVITY_DEFAULTS,
  parseRuntimeMarkdown,
  parseRuntimeSpec,
  resolveConnectivity,
  serializeRuntimeMarkdown,
} from "@wzrdtech/core/runtime-spec";
import { resolveComposeTree } from "../packages/cli/src/lib/compose.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const templatesDir = path.join(repoRoot, "packages/templates");

const templates = readdirSync(templatesDir).filter(
  (entry) =>
    entry.startsWith("zap-") &&
    statSync(path.join(templatesDir, entry)).isDirectory() &&
    readdirSync(path.join(templatesDir, entry)).includes("bake.sh"),
);

function read(...parts: string[]): string {
  return readFileSync(path.join(templatesDir, ...parts), "utf8");
}

describe("every template installs connectivity disabled", () => {
  it("covers light, med overlays, and every heavy variant", () => {
    expect(templates.length).toBeGreaterThanOrEqual(20);
    expect(templates).toContain("zap-light");
    expect(templates).toContain("zap-med");
    expect(templates).toContain("zap-heavy");
  });

  it.each(templates)("%s bakes the connectivity fragments", (template) => {
    const bake = read(template, "bake.sh");
    expect(bake).toContain("connectivity");
    for (const fragment of ["70-connectivity.sh", "71-taskrouter.sh", "72-sam-mesh.sh", "taskrouter.py", "doctor.sh"]) {
      expect(readdirSync(path.join(templatesDir, template, "connectivity"))).toContain(fragment);
    }
  });

  it.each(templates)("%s never enables or starts a connectivity unit at bake", (template) => {
    const dir = path.join(templatesDir, template, "connectivity");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sh"))) {
      const body = readFileSync(path.join(dir, file), "utf8");
      // The launcher scripts written INTO the box may contain `systemctl
      // enable` text for the owner opt-in path, but the bake fragments
      // themselves must only ever disable.
      expect(body).not.toMatch(/^\s*(sudo )?systemctl (enable|start)\b/m);
      expect(body).not.toMatch(/tailscale up/);
      expect(body).not.toMatch(/sam-node join[^\n]*\$\{?CONTROL_PLANE_DEFAULT/);
      // no public/community mesh discovery, ever (I1)
      expect(body).not.toMatch(/mesh-llm\s+(serve|client)\s+--auto\b/);
    }
  });

  it.each(templates)("%s records pins and default-off flags in template.json", (template) => {
    const manifest = JSON.parse(read(template, "template.json")) as {
      pins?: Record<string, string>;
      connectivity?: Record<string, boolean>;
    };
    for (const pin of ["tailscale", "cotal", "sam", "mesh-llm", "taskrouter-model"]) {
      expect(manifest.pins?.[pin]).toBeTruthy();
    }
    for (const feature of ["tailscale", "cotal", "taskrouter", "samMesh", "x402"]) {
      expect(manifest.connectivity?.[feature]).toBe(false);
    }
  });

  it.each(templates)("%s reports connectivity as optional doctor rows", (template) => {
    expect(read(template, "doctor.sh")).toContain("connectivity/doctor.sh");
  });
});

describe("taskrouter stays box-local and degrades to heuristics", () => {
  const source = read("zap-light", "connectivity", "taskrouter.py");

  it("binds loopback only", () => {
    expect(source).toContain('"127.0.0.1"');
    expect(source).not.toContain("0.0.0.0");
  });

  it("logs decisions under ~/.zap and falls back without a model", () => {
    expect(source).toContain(".zap");
    expect(source).toContain("taskrouter");
    expect(source).toMatch(/heuristic/i);
  });
});

describe("runtime spec connectivity is optional and default-off", () => {
  const base = { runtime: "demo", version: 1, weight: "light" as const };

  it("a spec that declares nothing resolves every feature to false", () => {
    const spec = parseRuntimeSpec(base);
    expect(spec.connectivity).toBeUndefined();
    expect(resolveConnectivity(spec)).toEqual(CONNECTIVITY_DEFAULTS);
  });

  it("a partial declaration leaves the rest off", () => {
    const spec = parseRuntimeSpec({ ...base, connectivity: { taskrouter: true } });
    expect(resolveConnectivity(spec)).toEqual({ ...CONNECTIVITY_DEFAULTS, taskrouter: true });
  });

  it("round-trips through markdown", () => {
    const spec = parseRuntimeSpec({ ...base, connectivity: { samMesh: true, x402: true } });
    const markdown = serializeRuntimeMarkdown(spec, "# Demo\n");
    const parsed = parseRuntimeMarkdown(markdown);
    expect(resolveConnectivity(parsed.spec)).toEqual({ ...CONNECTIVITY_DEFAULTS, samMesh: true, x402: true });
    expect(parsed.body.trim()).toBe("# Demo");
  });

  it("declares no place for a join credential", () => {
    expect(() =>
      parseRuntimeSpec({ ...base, connectivity: { samMesh: true, bootstrapToken: "bt-canary-0000" } }),
    ).not.toThrow();
    const spec = parseRuntimeSpec({ ...base, connectivity: { samMesh: true, bootstrapToken: "bt-canary-0000" } });
    expect(JSON.stringify(spec)).not.toContain("bt-canary-0000");
  });
});

describe("compose keeps plan-only defaults", () => {
  const base = { runtime: "demo", version: 1, weight: "light" as const };

  it("adds no connectivity plugin when nothing is declared", () => {
    const tree = resolveComposeTree(parseRuntimeSpec(base));
    expect(tree.entries.filter((entry) => entry.name.startsWith("connectivity."))).toEqual([]);
  });

  it("adds exactly the declared features, deterministically", () => {
    const spec = parseRuntimeSpec({ ...base, connectivity: { cotal: true, tailscale: true } });
    const names = resolveComposeTree(spec).entries.map((entry) => entry.name).filter((name) => name.startsWith("connectivity."));
    expect(names).toEqual(["connectivity.tailscale", "connectivity.cotal"]);
    expect(resolveComposeTree(spec).lock).toBe(resolveComposeTree(spec).lock);
  });

  it("an opted-in tree still differs from the default tree only by its connectivity entries", () => {
    const off = resolveComposeTree(parseRuntimeSpec(base));
    const on = resolveComposeTree(parseRuntimeSpec({ ...base, connectivity: { taskrouter: true } }));
    expect(on.entries.length).toBe(off.entries.length + 1);
    expect(on.lock).not.toBe(off.lock);
  });
});

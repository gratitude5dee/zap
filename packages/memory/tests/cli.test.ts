import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../../cli/src/commands/memory/index.js";
import type { MemoryService } from "../src/contract.ts";
import { createInMemoryTransport, createOpenVikingMemory } from "../src/openviking.ts";

const fixturesDir = path.resolve(import.meta.dirname, "..", "..", "cli", "tests", "fixtures");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}

type MemoryRun = (
  args: string[],
  flags: Record<string, string | boolean>,
  deps?: { service?: MemoryService },
) => Promise<number>;

const runMemory = run as MemoryRun;

async function seededService(): Promise<MemoryService> {
  const transport = createInMemoryTransport();
  await transport.write("viking://user/self/memories/one", { text: "deploy target is us-east-1" });
  await transport.write("viking://user/self/resources/notes", { text: "golden path notes" });
  return createOpenVikingMemory({ transport });
}

describe("zap memory --json fixtures", () => {
  let lines: string[] = [];
  beforeEach(() => {
    lines = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const jsonOut = (): unknown => JSON.parse(lines.join("\n"));

  it("memory status --json matches the fixture", async () => {
    await runMemory(["status"], { json: true }, { service: await seededService() });
    expect(jsonOut()).toEqual(fixture("memory-status.json"));
  });

  it("memory search --json matches the fixture", async () => {
    await runMemory(["search", "deploy"], { json: true }, { service: await seededService() });
    expect(jsonOut()).toEqual(fixture("memory-search.json"));
  });

  it("memory export --json matches the fixture", async () => {
    await runMemory(["export"], { json: true }, { service: await seededService() });
    expect(jsonOut()).toEqual(fixture("memory-export.json"));
  });

  it("memory forget --json matches the fixture", async () => {
    const service = await seededService();
    await runMemory(["forget", "viking://user/self/memories/one"], { json: true }, { service });
    expect(jsonOut()).toEqual(fixture("memory-forget.json"));
    await expect(
      service.read({ tenantId: "self", runtimeId: "local" }, "viking://user/self/memories/one"),
    ).resolves.toBeNull();
  });

  it("memory remember --json stores a durable item that search can find", async () => {
    const service = await seededService();
    await runMemory(["remember", "the golden path is zap run"], { json: true }, { service });
    const out = jsonOut() as { ok: boolean; uri: string; durable: boolean };
    expect(out.ok).toBe(true);
    expect(out.durable).toBe(true);
    expect(out.uri).toContain("viking://");
    const found = await service.search({ tenantId: "self", runtimeId: "local" }, "golden path is zap run");
    expect(found.some((item) => item.uri === out.uri)).toBe(true);
  });

  it("memory remember --ephemeral stores a non-durable item", async () => {
    const service = await seededService();
    await runMemory(["remember", "scratch note"], { ephemeral: true, json: true }, { service });
    const out = jsonOut() as { ok: boolean; durable: boolean };
    expect(out.ok).toBe(true);
    expect(out.durable).toBe(false);
  });

  it("memory remember without text throws a usage error", async () => {
    await expect(runMemory(["remember"], {}, { service: await seededService() })).rejects.toThrowError(
      /remember requires text/,
    );
  });

  it("unknown subcommand throws a structured error", async () => {
    await expect(runMemory(["bogus"], {}, { service: await seededService() })).rejects.toThrowError(
      /Unknown memory subcommand/,
    );
  });
});

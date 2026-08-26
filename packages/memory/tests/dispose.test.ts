import { describe, expect, it } from "vitest";
import type { MemoryItem, MemoryScope } from "../src/contract.ts";
import { createFakeMemory } from "../src/fake.ts";
import { createMem0Memory } from "../src/mem0.ts";
import { createInMemoryTransport, createOpenVikingMemory } from "../src/openviking.ts";
import { createZepMemory } from "../src/zep.ts";
import { createMem0FetchMock, createZepFetchMock, fileReader, type ProviderCase } from "./helpers.ts";

const scope: MemoryScope = { tenantId: "tenant-1", runtimeId: "rt-1", sessionId: "sess-1" };

const cases: ProviderCase[] = [
  { name: "fake", make: (files = {}) => createFakeMemory({ readFile: fileReader(files) }) },
  {
    name: "openviking",
    make: (files = {}) =>
      createOpenVikingMemory({ transport: createInMemoryTransport({ readFile: fileReader(files) }) }),
  },
  {
    name: "mem0",
    make: (files = {}) =>
      createMem0Memory({ consent: true, fetchImpl: createMem0FetchMock(), readFile: fileReader(files) }),
  },
  {
    name: "zep",
    make: (files = {}) =>
      createZepMemory({ consent: true, fetchImpl: createZepFetchMock(), readFile: fileReader(files) }),
  },
];

async function collect(iterable: AsyncIterable<MemoryItem>): Promise<MemoryItem[]> {
  const items: MemoryItem[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

describe.each(cases)("wipeSession + export: $name", ({ make }) => {
  it("wipeSession removes session-scoped items and keeps durable tenant memory", async () => {
    const memory = make();
    const durable = await memory.remember(scope, { text: "durable preference: metric units", durable: true });
    const session = await memory.remember(scope, { text: "scratch note for this session only" });

    await memory.wipeSession(scope);

    await expect(memory.read(scope, durable.uri)).resolves.toContain("metric units");
    await expect(memory.read(scope, session.uri)).resolves.toBeNull();

    const durableHits = await memory.search(scope, "metric units");
    expect(durableHits.some((hit) => hit.uri === durable.uri)).toBe(true);
    const sessionHits = await memory.search(scope, "scratch note");
    expect(sessionHits.find((hit) => hit.uri === session.uri)).toBeUndefined();
  });

  it("wipeSession only touches the named session", async () => {
    const memory = make();
    const otherSession: MemoryScope = { ...scope, sessionId: "sess-2" };
    const keep = await memory.remember(otherSession, { text: "other session survives" });
    await memory.remember(scope, { text: "this session dies" });

    await memory.wipeSession(scope);

    await expect(memory.read(otherSession, keep.uri)).resolves.toContain("survives");
  });

  it("export streams every item for the tenant (durable, session, resources)", async () => {
    const memory = make({ "/tmp/spec.md": "resource body for export" });
    const durable = await memory.remember(scope, { text: "durable export row", durable: true });
    const session = await memory.remember(scope, { text: "session export row" });
    const resource = await memory.addResource(scope, { path: "/tmp/spec.md" });

    const items = await collect(await memory.export(scope));
    const uris = items.map((item) => item.uri);
    expect(uris).toContain(durable.uri);
    expect(uris).toContain(session.uri);
    expect(uris).toContain(resource.uri);
  });

  it("export after wipeSession contains durable items only", async () => {
    const memory = make();
    const durable = await memory.remember(scope, { text: "durable after wipe", durable: true });
    const session = await memory.remember(scope, { text: "session after wipe" });

    await memory.wipeSession(scope);
    const items = await collect(await memory.export(scope));
    const uris = items.map((item) => item.uri);
    expect(uris).toContain(durable.uri);
    expect(uris).not.toContain(session.uri);
  });
});

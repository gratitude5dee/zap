import { describe, expect, it } from "vitest";
import type { MemoryScope, MemoryService } from "../src/contract.ts";
import { MemoryError } from "../src/errors.ts";
import { createFakeMemory } from "../src/fake.ts";
import { createMem0Memory } from "../src/mem0.ts";
import { createControlPlaneMemory } from "../src/offvm.ts";
import { createInMemoryTransport, createOpenVikingMemory } from "../src/openviking.ts";
import { createZepMemory } from "../src/zep.ts";
import { createMem0FetchMock, createZepFetchMock, fileReader, type ProviderCase } from "./helpers.ts";

const scope: MemoryScope = { tenantId: "tenant-1", runtimeId: "rt-1", sessionId: "sess-1" };

const cases: ProviderCase[] = [
  {
    name: "fake",
    make: (files = {}) => createFakeMemory({ readFile: fileReader(files) }),
  },
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

describe.each(cases)("memory contract: $name", ({ name, make }) => {
  it("reports a healthy status", async () => {
    const memory = make();
    const status = await memory.status();
    expect(status.healthy).toBe(true);
    expect(status.items).toBeGreaterThanOrEqual(0);
  });

  it("remember returns an addressable item and read round-trips", async () => {
    const memory = make();
    const item = await memory.remember(scope, { text: "the deploy target is us-east-1" });
    expect(item.uri).toBeTruthy();
    expect(item.kind).toBe("memory");
    await expect(memory.read(scope, item.uri)).resolves.toContain("us-east-1");
  });

  it("read returns null for a missing uri", async () => {
    const memory = make();
    const item = await memory.remember(scope, { text: "seed" });
    await memory.forget(scope, item.uri);
    await expect(memory.read(scope, item.uri)).resolves.toBeNull();
  });

  it("search finds remembered text and honors limit", async () => {
    const memory = make();
    await memory.remember(scope, { text: "favorite color is teal", durable: true });
    await memory.remember(scope, { text: "favorite editor is helix", durable: true });
    const hits = await memory.search(scope, "favorite teal");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.text).toContain("teal");
    const limited = await memory.search(scope, "favorite", { limit: 1 });
    expect(limited.length).toBe(1);
  });

  it("search does not leak across tenants", async () => {
    const memory = make();
    await memory.remember(scope, { text: "tenant one secret handshake", durable: true });
    const other: MemoryScope = { tenantId: "tenant-2", runtimeId: "rt-2" };
    const hits = await memory.search(other, "handshake");
    expect(hits).toEqual([]);
  });

  it("read does not leak to a tenant whose id is a prefix of the owner's", async () => {
    const memory = make();
    const owner: MemoryScope = { tenantId: "tenant-12", runtimeId: "rt-1", sessionId: "sess-1" };
    const item = await memory.remember(owner, { text: "prefix isolation secret", durable: true });
    const prefixTenant: MemoryScope = { tenantId: "tenant-1", runtimeId: "rt-1" };
    await expect(memory.read(prefixTenant, item.uri)).resolves.toBeNull();
    await expect(memory.read(owner, item.uri)).resolves.toContain("prefix isolation secret");
  });

  it("addResource ingests a file and read returns its content", async () => {
    const memory = make({ "/tmp/notes.md": "resource body: golden path" });
    const item = await memory.addResource(scope, { path: "/tmp/notes.md" });
    expect(item.kind).toBe("resource");
    await expect(memory.read(scope, item.uri)).resolves.toContain("golden path");
  });

  it("search can filter by kind", async () => {
    const memory = make({ "/tmp/guide.md": "kindcheck resource text" });
    await memory.remember(scope, { text: "kindcheck memory text", durable: true });
    await memory.addResource(scope, { path: "/tmp/guide.md" });
    const memories = await memory.search(scope, "kindcheck", { kinds: ["memory"] });
    expect(memories.every((hit) => hit.kind === "memory")).toBe(true);
    expect(memories.length).toBeGreaterThanOrEqual(1);
  });

  it("forget removes an item from search", async () => {
    const memory = make();
    const item = await memory.remember(scope, { text: "ephemeral zanzibar fact", durable: true });
    await memory.forget(scope, item.uri);
    const hits = await memory.search(scope, "zanzibar");
    expect(hits.find((hit) => hit.uri === item.uri)).toBeUndefined();
  });

  it(`declares its provider and locality (${name})`, async () => {
    const memory = make();
    if (name === "fake" || name === "openviking") {
      expect(memory.provider).toBe("openviking");
      expect(memory.locality).toBe("on-vm");
    } else {
      expect(memory.provider).toBe(name);
      expect(memory.locality).toBe("saas");
    }
  });
});

describe("openviking mcp endpoint", () => {
  it("exposes the loopback MCP url for harnesses", () => {
    const memory = createOpenVikingMemory({ transport: createInMemoryTransport() });
    expect(memory.mcp?.()).toEqual({ url: "http://127.0.0.1:1933/mcp" });
  });
});

describe("saas consent gate", () => {
  it("mem0 refuses to construct without consent: true", () => {
    expect(() => createMem0Memory({ consent: false, fetchImpl: createMem0FetchMock() })).toThrowError(MemoryError);
    try {
      createMem0Memory({ consent: false, fetchImpl: createMem0FetchMock() });
    } catch (error) {
      expect((error as MemoryError).code).toBe("MEMORY_CONSENT_REQUIRED");
    }
  });

  it("zep refuses to construct without consent: true", () => {
    try {
      createZepMemory({ consent: false, fetchImpl: createZepFetchMock() });
      expect.unreachable("zep constructed without consent");
    } catch (error) {
      expect((error as MemoryError).code).toBe("MEMORY_CONSENT_REQUIRED");
    }
  });
});

describe("off-VM guard (control plane)", () => {
  const inner = (): MemoryService => createFakeMemory();

  it("content methods throw MEMORY_CONTENT_OFF_VM", async () => {
    const guarded = createControlPlaneMemory(inner());
    for (const call of [
      () => guarded.remember(scope, { text: "x" }),
      () => guarded.search(scope, "x"),
      () => guarded.read(scope, "viking://user/tenant-1/memories/x"),
      () => guarded.addResource(scope, { path: "/tmp/x" }),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: "MEMORY_CONTENT_OFF_VM" });
    }
  });

  it("status and forget still pass through", async () => {
    const base = inner();
    const item = await base.remember(scope, { text: "control-plane visible uri only" });
    const guarded = createControlPlaneMemory(base);
    const status = await guarded.status();
    expect(status.healthy).toBe(true);
    await guarded.forget(scope, item.uri);
    await expect(base.read(scope, item.uri)).resolves.toBeNull();
  });

  it("export requires consent on the control plane", async () => {
    const base = inner();
    await base.remember(scope, { text: "exportable", durable: true });
    const denied = createControlPlaneMemory(base);
    await expect(denied.export(scope)).rejects.toMatchObject({ code: "MEMORY_CONSENT_REQUIRED" });
    const allowed = createControlPlaneMemory(base, { exportConsent: true });
    const items = [];
    for await (const item of await allowed.export(scope)) items.push(item);
    expect(items.length).toBe(1);
  });
});

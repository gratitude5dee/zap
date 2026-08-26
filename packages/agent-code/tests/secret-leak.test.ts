// C15/C24: a canary secret bound with bearer(useSecret(...)) never appears in
// instructions, the manifest, /zap/** on the host, events, or logs — only on
// the single outbound request the connection layer attaches it to.
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalManifest, collect, makeHost, recordedLlm } from "./helpers/host.ts";

const CANARY = "canary-webhook-token-9f8e7d6c";

async function grepDir(dir: string, needle: string): Promise<string[]> {
  const hits: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) hits.push(...(await grepDir(target, needle)));
    else if ((await fs.readFile(target, "utf8").catch(() => "")).includes(needle)) hits.push(target);
  }
  return hits;
}

describe("secret leak", () => {
  it("never leaks the canary anywhere a test can grep", async () => {
    const llm = recordedLlm([
      { text: "notifying", toolCalls: [{ id: "c1", name: "notify", input: { note: "done" } }] },
      { text: "sent" },
    ]);
    const fixture = await makeHost({
      payer: "byok",
      llm: llm.service,
      secrets: { WEBHOOK_TOKEN: CANARY, CONTEXT7_API_KEY: "canary-context7" },
    });

    const session = await fixture.host.createSession({ agent: "researcher", alias: "development" });
    const events = await collect(
      fixture.host.turn(session.id, { text: "notify the webhook", live: true, payer: "byok" }),
    );

    // the connection layer attached it to the one outbound request
    expect(fixture.outbound).toHaveLength(1);
    expect(fixture.outbound[0]?.headers.Authorization).toBe(`Bearer ${CANARY}`);

    // rendered instructions and manifest are clean
    const render = events.find((event) => event.type === "render");
    expect(JSON.stringify(render)).not.toContain(CANARY);
    expect(JSON.stringify(canonicalManifest())).not.toContain(CANARY);

    // no event, no log line, nothing under the host root
    expect(JSON.stringify(events)).not.toContain(CANARY);
    expect(fixture.logs.join("\n")).not.toContain(CANARY);
    expect(await grepDir(fixture.root, CANARY)).toEqual([]);

    const completed = events.find((event) => event.type === "turn.completed");
    expect(completed).toBeDefined();
  });

  it("fails closed with SECRET_UNAVAILABLE when the secret is not synced", async () => {
    const llm = recordedLlm([
      { text: "notifying", toolCalls: [{ id: "c1", name: "notify", input: { note: "done" } }] },
      { text: "handled" },
    ]);
    const fixture = await makeHost({ payer: "byok", llm: llm.service, secrets: {} });
    const session = await fixture.host.createSession({ agent: "researcher", alias: "development" });
    const events = await collect(fixture.host.turn(session.id, { text: "notify now", live: true, payer: "byok" }));
    expect(fixture.outbound).toHaveLength(0);
    expect(JSON.stringify(events)).toContain("SECRET_UNAVAILABLE");
  });
});

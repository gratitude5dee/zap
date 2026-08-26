// C7/C8: plan-only is the default; side-effecting tools are planned, read-only
// tools may run; live spend requires an explicit payer; PAYER_MISSING fails
// closed before any model call.
import { describe, expect, it } from "vitest";
import { collect, makeHost, recordedLlm } from "./helpers/host.ts";

describe("plan-only default", () => {
  it("plans a side-effecting tool instead of executing it", async () => {
    const llm = recordedLlm([
      { text: "will transcode", toolCalls: [{ id: "c1", name: "ffmpeg_transcode", input: { path: "/zap/fs/in.mp4" } }] },
      { text: "planned" },
    ]);
    const fixture = await makeHost({ payer: "byok", llm: llm.service });
    const session = await fixture.host.createSession({ agent: "transcode", alias: "development" });
    const events = await collect(fixture.host.turn(session.id, { text: "transcode in.mp4", payer: "byok" }));

    expect(events.some((event) => event.type === "tool.planned" && event.tool === "ffmpeg_transcode")).toBe(true);
    expect(events.some((event) => event.type === "tool.result")).toBe(false);
    expect(fixture.sandboxExecs).toHaveLength(0);
    const started = events.find((event) => event.type === "turn.started");
    expect(started).toMatchObject({ live: false });
  });

  it("executes read-only tools even in plan-only mode", async () => {
    const llm = recordedLlm([
      { text: "probing", toolCalls: [{ id: "c1", name: "ffprobe", input: { path: "/zap/fs/in.mp4" } }] },
      { text: "probed" },
    ]);
    const fixture = await makeHost({ payer: "byok", llm: llm.service });
    const session = await fixture.host.createSession({ agent: "researcher", alias: "development" });
    const events = await collect(fixture.host.turn(session.id, { text: "probe the file", payer: "byok" }));

    expect(events.some((event) => event.type === "tool.result" && event.tool === "ffprobe")).toBe(true);
    expect(events.some((event) => event.type === "tool.planned")).toBe(false);
    expect(fixture.sandboxExecs.length).toBeGreaterThan(0);
  });

  it("executes a side-effecting tool live with a payer", async () => {
    const llm = recordedLlm([
      { text: "transcoding", toolCalls: [{ id: "c1", name: "ffmpeg_transcode", input: { path: "/zap/fs/in.mp4" } }] },
      { text: "done" },
    ]);
    const fixture = await makeHost({ payer: "byok", llm: llm.service });
    const session = await fixture.host.createSession({ agent: "transcode", alias: "development" });
    const events = await collect(
      fixture.host.turn(session.id, { text: "transcode in.mp4", live: true, payer: "byok" }),
    );

    expect(events.some((event) => event.type === "tool.result" && event.tool === "ffmpeg_transcode")).toBe(true);
    expect(fixture.sandboxExecs.length).toBeGreaterThan(0);
    const started = events.find((event) => event.type === "turn.started");
    expect(started).toMatchObject({ live: true });
  });

  it("fails closed with PAYER_MISSING before invoking the model", async () => {
    const llm = recordedLlm([{ text: "should never run" }]);
    const fixture = await makeHost({ payer: "missing", llm: llm.service });
    const session = await fixture.host.createSession({ agent: "transcode", alias: "development" });
    const events = await collect(fixture.host.turn(session.id, { text: "transcode in.mp4" }));

    expect(llm.calls).toHaveLength(0);
    const failed = events.find((event) => event.type === "turn.failed");
    expect(failed).toMatchObject({ code: "PAYER_MISSING" });
  });

  it("returns SESSION_BUSY for a concurrent turn on the same session", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const llm = {
      calls: [] as unknown[],
      service: {
        async step(): Promise<{ text: string; toolCalls: never[]; usage: { inputTokens: number; outputTokens: number; usd: number } }> {
          await gate;
          return { text: "slow", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, usd: 0 } };
        },
      },
    };
    const fixture = await makeHost({ payer: "byok", llm: llm.service });
    const session = await fixture.host.createSession({ agent: "transcode", alias: "development" });
    const firstTurn = collect(fixture.host.turn(session.id, { text: "hello", payer: "byok" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await collect(fixture.host.turn(session.id, { text: "again", payer: "byok" }));
    expect(JSON.stringify(second)).toContain("SESSION_BUSY");
    release?.();
    const first = await firstTurn;
    expect(first.some((event) => event.type === "turn.completed")).toBe(true);
  });
});
